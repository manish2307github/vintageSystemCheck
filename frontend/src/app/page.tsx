"use client";

import { useEffect, useMemo, useState } from "react";

type Week = { week_start: string; login_count: number };
type Account = {
  account_id: string;
  weekly_logins: Week[];
  account_age_weeks: number;
  previous_average: number | null;
  recent_average: number | null;
  decline_percent: number | null;
  trend_slope: number | null;
  risk_level: string;
  confidence: number;
  explanation: string;
  recommended_action: string;
  priority: string;
  customer_success_notes: string;
};
type Summary = { total_accounts: number; counts: Record<string, number> };

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const levels = ["Healthy", "Watch", "At Risk", "Critical", "Insufficient Data"];

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState<"overview" | "table" | "detail">("overview");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${api}/accounts`).then(checkResponse),
      fetch(`${api}/risk-summary`).then(checkResponse),
    ])
      .then(([accountData, summaryData]) => {
        setAccounts(accountData);
        setSummary(summaryData);
        setSelectedId(accountData[0]?.account_id ?? "");
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  const selected = useMemo(
    () => accounts.find((account) => account.account_id === selectedId),
    [accounts, selectedId],
  );

  function openAccount(accountId: string) {
    setSelectedId(accountId);
    setPage("detail");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Vantage home">
          <span className="brand-mark">V</span>
          <span>VANTAGE<span className="brand-sub">RETAIL SYSTEMS</span></span>
        </a>
        <div className="side-label">CUSTOMER SUCCESS</div>
        <nav aria-label="Main navigation">
          {(["overview", "table", "detail"] as const).map((item) => (
            <button className={`nav-item ${page === item ? "active" : ""}`} key={item} onClick={() => setPage(item)}>
              <span className="nav-dot" />
              {item === "overview" ? "Risk overview" : item === "table" ? "Accounts" : "Account detail"}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><span className="status-dot" />Usage signals live</div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><span className="eyebrow">VANTAGE / CUSTOMER HEALTH</span><h1>Churn early warning</h1></div>
          <div className="as-of"><span className="status-dot" />Weekly usage analysis</div>
        </header>

        {error && <div className="error-banner" role="alert">Could not load account data: {error}</div>}
        {!summary && !error && <div className="loading">Loading account signals…</div>}

        {summary && page === "overview" && (
          <section className="content">
            <div className="section-heading"><div><h2>Risk overview</h2><p>Account engagement signals from weekly login activity.</p></div><button className="button-primary" onClick={() => setPage("table")}>View accounts <span>→</span></button></div>
            <div className="metric-grid">
              <Metric label="Total accounts" value={summary.total_accounts} tone="navy" />
              {levels.slice(0, 4).map((level) => <Metric key={level} label={level} value={summary.counts[level] ?? 0} tone={tone(level)} />)}
            </div>
            <div className="overview-grid">
              <div className="panel-card">
                <div className="card-heading"><div><h3>Accounts needing attention</h3><p>Decline signals with highest urgency</p></div><button className="text-button" onClick={() => setPage("table")}>All accounts →</button></div>
                <div className="attention-list">
                  {accounts.filter((account) => ["Critical", "At Risk"].includes(account.risk_level)).slice(0, 4).map((account) => (
                    <button className="attention-row" key={account.account_id} onClick={() => openAccount(account.account_id)}>
                      <span className="account-avatar">{account.account_id.slice(-2)}</span>
                      <span className="account-cell"><strong>{account.account_id}</strong><small>{account.weekly_logins.length} weeks of history</small></span>
                      <span className="decline">{formatDecline(account.decline_percent)}</span>
                      <RiskBadge level={account.risk_level} />
                    </button>
                  ))}
                  {accounts.every((account) => !["Critical", "At Risk"].includes(account.risk_level)) && <p className="empty-state">No accounts currently need urgent attention.</p>}
                </div>
              </div>
              <div className="panel-card signal-card">
                <span className="signal-icon">↘</span><h3>How the signal works</h3>
                <p>Compare average logins from the latest 4 weeks against the prior 4. A downward trend raises confidence; it does not predict churn.</p>
                <div className="signal-rule"><span>Minimum history</span><strong>8 consecutive weeks</strong></div>
                <div className="signal-rule"><span>Watch threshold</span><strong>15% decline</strong></div>
                <p className="disclaimer">Usage is an early-warning proxy, not a churn outcome.</p>
              </div>
            </div>
          </section>
        )}

        {summary && page === "table" && (
          <section className="content">
            <div className="section-heading"><div><h2>Account risk table</h2><p>Review all scored accounts and their evidence.</p></div><span className="result-count">{accounts.length} accounts</span></div>
            <div className="panel-card table-wrap">
              <table><thead><tr><th>Account</th><th>Prior 4-week avg</th><th>Recent 4-week avg</th><th>Decline</th><th>Risk level</th><th>Priority</th></tr></thead>
                <tbody>{accounts.map((account) => <tr key={account.account_id} onClick={() => openAccount(account.account_id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && openAccount(account.account_id)}>
                  <td><strong>{account.account_id}</strong><small>{account.weekly_logins.length} weeks</small></td>
                  <td>{formatValue(account.previous_average)}</td><td>{formatValue(account.recent_average)}</td>
                  <td className={account.decline_percent && account.decline_percent > 0 ? "decline" : ""}>{formatDecline(account.decline_percent)}</td>
                  <td><RiskBadge level={account.risk_level} /></td><td>{account.priority}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {summary && page === "detail" && (
          <section className="content">
            <div className="section-heading"><div><h2>Account detail</h2><p>Usage history, risk rationale, and recommended next step.</p></div>
              <select aria-label="Select account" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.account_id}</option>)}</select>
            </div>
            {selected && <div className="detail-grid">
              <div className="panel-card chart-card">
                <div className="card-heading"><div><h3>{selected.account_id}</h3><p>{selected.account_age_weeks} weeks account history</p></div><RiskBadge level={selected.risk_level} /></div>
                <TrendChart weeks={selected.weekly_logins} />
                <div className="chart-legend"><span><i />Weekly logins</span><span>Prior 4-week avg: <strong>{formatValue(selected.previous_average)}</strong></span><span>Recent 4-week avg: <strong>{formatValue(selected.recent_average)}</strong></span></div>
                <div className="detail-stats"><div><span>Decline</span><strong>{formatDecline(selected.decline_percent)}</strong></div><div><span>Trend slope</span><strong>{formatValue(selected.trend_slope)}</strong></div><div><span>Confidence</span><strong>{selected.confidence}%</strong></div></div>
              </div>
              <div className="panel-card explanation-card"><span className="card-kicker">WHY FLAGGED</span><h3>Usage signal</h3><p>{selected.explanation}</p>
                <div className="action-box"><span className="card-kicker">RECOMMENDED ACTION · {selected.priority.toUpperCase()}</span><strong>{selected.recommended_action}</strong><p>{selected.customer_success_notes}</p></div>
              </div>
            </div>}
          </section>
        )}
        <footer className="footer">Vantage Retail Systems <span>•</span> Explainable usage signals</footer>
      </section>
    </main>
  );
}

function Metric({ label, value, tone: color }: { label: string; value: number; tone: string }) {
  return <div className={`metric-card ${color}`}><span>{label}</span><strong>{value}</strong><i /></div>;
}

function RiskBadge({ level }: { level: string }) {
  return <span className={`badge ${tone(level)}`}><i />{level}</span>;
}

function TrendChart({ weeks }: { weeks: Week[] }) {
  const width = 720, height = 220, padding = 28;
  const values = weeks.map((week) => week.login_count);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = padding + index * (width - padding * 2) / Math.max(values.length - 1, 1);
    const y = height - padding - value / max * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  return <div className="chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weekly login trend chart">
    {[0, 1, 2, 3].map((line) => <line key={line} x1={padding} x2={width - padding} y1={padding + line * (height - padding * 2) / 3} y2={padding + line * (height - padding * 2) / 3} className="gridline" />)}
    <polyline points={points} className="chart-line" />
    {values.map((value, index) => <circle key={`${weeks[index].week_start}-${index}`} cx={padding + index * (width - padding * 2) / Math.max(values.length - 1, 1)} cy={height - padding - value / max * (height - padding * 2)} r="4" className="chart-point"><title>{weeks[index].week_start}: {value} logins</title></circle>)}
  </svg><div className="chart-dates"><span>{weeks[0]?.week_start}</span><span>{weeks.at(-1)?.week_start}</span></div></div>;
}

function tone(level: string) {
  return level.toLowerCase().replaceAll(" ", "-");
}
function formatValue(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}
function formatDecline(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
async function checkResponse(response: Response) {
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}
