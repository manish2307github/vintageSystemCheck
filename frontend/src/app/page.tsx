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
type TimePeriod = "1w" | "4w" | "8w" | "12w" | "all";

// ============================================================================
// CONFIGURATION: All labels, messages, and legends - modify here only
// ============================================================================
const CONFIG = {
  api: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  
  // Page labels and headings
  labels: {
    brand: "VANTAGE RETAIL SYSTEMS",
    eyebrow: "VANTAGE / CUSTOMER HEALTH",
    mainTitle: "Churn early warning",
    statusMessage: "Weekly usage analysis",
    usageSignalsLive: "Usage signals live",
    
    // Navigation
    riskOverview: "Risk overview",
    accounts: "Accounts",
    accountDetail: "Account detail",
    
    // Section headings
    overview: "Risk overview",
    overviewDesc: "Account engagement signals from weekly login activity",
    totalAccounts: "Total accounts",
    accountsNeedAttention: "Accounts needing attention",
    attentionDesc: "Decline signals with highest urgency",
    riskTable: "Account risk table",
    riskTableDesc: "Review all scored accounts and their evidence.",
    accountDetailTitle: "Account detail",
    accountDetailDesc: "Usage history, risk rationale, and recommended next step.",
    
    // Chart and metrics
    chartLabel: "Weekly logins",
    priorPeriodAvg: "Prior {period} avg",
    recentPeriodAvg: "Recent {period} avg",
    priorPeriodAvgShort: "Prior period avg",
    recentPeriodAvgShort: "Recent period avg",
    decline: "Change",
    trendSlope: "Trend slope",
    confidence: "Confidence",
    weeksOfHistory: "weeks in period",
    
    // Signal explanation
    signalTitle: "How the signal works",
    signalDesc: "Compare average logins from the latest {weeks} weeks against the prior {weeks} weeks. A downward trend raises confidence; it does not predict churn.",
    minimumHistory: "Minimum history",
    minimumHistoryValue: "{weeks} consecutive weeks",
    watchThreshold: "Watch threshold",
    watchThresholdValue: "15% decline",
    disclaimer: "Usage is an early-warning proxy, not a churn outcome.",
    riskLevelsTitle: "Risk levels & criteria",
    
    // Button labels
    viewAccounts: "View accounts",
    allAccounts: "All accounts",
    selectAccount: "Select account",
    
    // Table headers
    accountTableHeader: "Account",
    priorAvgHeader: "Prior period avg",
    recentAvgHeader: "Recent period avg",
    declineHeader: "Decline",
    riskLevelHeader: "Risk level",
    priorityHeader: "Priority",
    weeksHeader: "weeks",
    
    // Footer
    footerBrand: "Vantage Retail Systems",
    footerNote: "Explainable usage signals",
  },

  // Time period configurations
  timePeriods: [
    { value: "1w" as TimePeriod, label: "Last 1 week", weeks: 1 },
    { value: "4w" as TimePeriod, label: "Last 4 weeks", weeks: 4 },
    { value: "8w" as TimePeriod, label: "Last 8 weeks", weeks: 8 },
    { value: "12w" as TimePeriod, label: "Last 12 weeks", weeks: 12 },
    { value: "all" as TimePeriod, label: "All history", weeks: Infinity },
  ],

  // Risk levels
  riskLevels: ["Healthy", "Watch", "At Risk", "Critical", "Insufficient Data"],

  // Risk thresholds - used for recalculation
  riskThresholds: {
    criticalDecline: 25,
    criticalTrendSlope: -5,
    atRiskDecline: 15,
    atRiskTrendSlope: -2,
    watchDecline: 10,
    watchTrendSlope: 0,
    minDataPoints: 4,
  },

  // Account names lookup
  accountNames: {
    "VNT-001": "Northstar Outfitters",
    "VNT-002": "Beacon Supply Co.",
    "VNT-003": "Harbor Home Goods",
    "VNT-004": "Cedar Lane Market",
    "VNT-005": "Metro Outfitters",
    "VNT-006": "Summit Parts Group",
    "VNT-007": "Valley Market",
    "VNT-008": "Pioneer Goods",
    "VNT-009": "Redwood Retail Group",
    "VNT-010": "Bluepeak Commerce",
    "VNT-011": "Evergreen Supply",
    "VNT-012": "Atlas Home & Garden",
    "VNT-013": "Westbridge Stores",
    "VNT-014": "Silverline Distribution",
    "VNT-015": "Clearwater Market Co.",
    "VNT-016": "Granite Point Retail",
    "VNT-017": "Crescent Retail Group",
  },

  // Error messages
  errors: {
    loadFailed: "Could not load account data: ",
    loading: "Loading account signals…",
  },

  // Chart and display
  chart: {
    width: 720,
    height: 220,
    padding: 28,
  },
};
// ============================================================================

const api = CONFIG.api;
const levels = CONFIG.riskLevels;
const timePeriods = CONFIG.timePeriods;
const accountNames = CONFIG.accountNames;
};

function accountName(accountId: string) {
  return accountNames[accountId] ?? `Company ${accountId}`;
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState<"overview" | "table" | "detail">("overview");
  const [error, setError] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("8w");

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

  const periodConfig = useMemo(() => timePeriods.find((p) => p.value === timePeriod), [timePeriod]);

  // Filter and calculate metrics based on selected time period
  const filteredAccounts = useMemo(() => {
    if (!periodConfig || periodConfig.weeks === Infinity) return accounts;

    return accounts.map((account) => {
      const recentWeeks = account.weekly_logins.slice(-periodConfig.weeks);
      if (recentWeeks.length === 0) return account;

      const recentAvg = recentWeeks.reduce((sum, w) => sum + w.login_count, 0) / recentWeeks.length;

      // Calculate previous period average for comparison
      const prevWeeks = account.weekly_logins.slice(
        Math.max(0, account.weekly_logins.length - periodConfig.weeks * 2),
        account.weekly_logins.length - periodConfig.weeks,
      );
      const prevAvg = prevWeeks.length > 0 ? prevWeeks.reduce((sum, w) => sum + w.login_count, 0) / prevWeeks.length : null;

      const newDeclinePercent =
        prevAvg && recentAvg > 0 ? ((prevAvg - recentAvg) / prevAvg) * 100 : null;

      // Recalculate trend slope for the period
      const newTrendSlope =
        recentWeeks.length > 1
          ? (recentWeeks[recentWeeks.length - 1].login_count - recentWeeks[0].login_count) / (recentWeeks.length - 1)
          : 0;

      // Recalculate risk level based on new metrics
      const newRiskLevel = calculateRiskLevel(newDeclinePercent, recentWeeks.length, newTrendSlope);

      return {
        ...account,
        weekly_logins: recentWeeks,
        previous_average: prevAvg,
        recent_average: recentAvg,
        decline_percent: newDeclinePercent,
        trend_slope: newTrendSlope,
        risk_level: newRiskLevel,
      };
    });
  }, [accounts, periodConfig]);

  const selected = useMemo(
    () => filteredAccounts.find((account) => account.account_id === selectedId),
    [filteredAccounts, selectedId],
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
              {item === "overview" ? CONFIG.labels.riskOverview : item === "table" ? CONFIG.labels.accounts : CONFIG.labels.accountDetail}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><span className="status-dot" />{CONFIG.labels.usageSignalsLive}</div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><span className="eyebrow">{CONFIG.labels.eyebrow}</span><h1>{CONFIG.labels.mainTitle}</h1></div>
          <div className="as-of">
            <span className="status-dot" />
            <select 
              aria-label="Select time period" 
              value={timePeriod} 
              onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
              className="period-selector"
            >
              {timePeriods.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        {error && <div className="error-banner" role="alert">{CONFIG.errors.loadFailed}{error}</div>}
        {!summary && !error && <div className="loading">{CONFIG.errors.loading}</div>}

        {summary && page === "overview" && (
          <section className="content">
            <div className="section-heading"><div><h2>{CONFIG.labels.overview}</h2><p>{CONFIG.labels.overviewDesc} ({periodConfig?.label}).</p></div><button className="button-primary" onClick={() => setPage("table")}>{CONFIG.labels.viewAccounts} <span>→</span></button></div>
            <div className="metric-grid">
              <Metric label={CONFIG.labels.totalAccounts} value={filteredAccounts.length} tone="navy" />
              {levels.slice(0, 4).map((level) => {
                const count = filteredAccounts.filter((a) => a.risk_level === level).length;
                return <Metric key={level} label={level} value={count} tone={tone(level)} />;
              })}
            </div>
            <div className="risk-legend-section">
              <h3>Risk Categories Legend</h3>
              <div className="risk-legend-grid">
                {levels.slice(0, 4).map((level) => {
                  const meta = getRiskMetadata(level);
                  return (
                    <div key={level} className={`legend-item ${tone(level)}`}>
                      <div className="legend-header">
                        <div className="legend-badge">
                          <span className={`badge ${tone(level)}`}><i /></span>
                        </div>
                        <h4>{level}</h4>
                      </div>
                      <p className="legend-tooltip">{meta.tooltip}</p>
                      <div className="legend-criteria">
                        <span className="criteria-label">Criteria:</span>
                        <ul>
                          {meta.criteria.map((criterion, i) => (
                            <li key={i}>{criterion}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="overview-grid">
              <div className="panel-card">
                <div className="card-heading"><div><h3>{CONFIG.labels.accountsNeedAttention}</h3><p>{CONFIG.labels.attentionDesc} ({periodConfig?.label})</p></div><button className="text-button" onClick={() => setPage("table")}>{CONFIG.labels.allAccounts} →</button></div>
                <div className="attention-list">
                  {filteredAccounts.filter((account) => ["Critical", "At Risk"].includes(account.risk_level)).slice(0, 4).map((account) => (
                    <button className="attention-row" key={account.account_id} onClick={() => openAccount(account.account_id)}>
                      <span className="account-avatar">{accountName(account.account_id).slice(0, 2).toUpperCase()}</span>
                      <span className="account-cell"><strong>{accountName(account.account_id)}</strong><small>{account.account_id} · {account.weekly_logins.length} {CONFIG.labels.weeksHeader} of data</small></span>
                      <span className="decline">{formatChange(account.decline_percent)}</span>
                      <RiskBadge level={account.risk_level} />
                    </button>
                  ))}
                  {filteredAccounts.every((account) => !["Critical", "At Risk"].includes(account.risk_level)) && <p className="empty-state">No accounts currently need urgent attention.</p>}
                </div>
              </div>
              <div className="panel-card signal-card">
                <span className="signal-icon">↘</span><h3>{CONFIG.labels.signalTitle}</h3>
                <p>{CONFIG.labels.signalDesc.replace(/\{weeks\}/g, periodConfig?.weeks === Infinity ? "available" : `${periodConfig?.weeks}`)}</p>
                <div className="signal-rule"><span>{CONFIG.labels.minimumHistory}</span><strong>{CONFIG.labels.minimumHistoryValue.replace("{weeks}", periodConfig?.weeks === Infinity ? "8+" : `${periodConfig?.weeks}`)}</strong></div>
                <div className="signal-rule"><span>{CONFIG.labels.watchThreshold}</span><strong>{CONFIG.labels.watchThresholdValue}</strong></div>
                <p className="disclaimer">{CONFIG.labels.disclaimer}</p>
                
                <div className="risk-criteria-section">
                  <h4>Risk levels & criteria</h4>
                  <div className="risk-criteria-list">
                    {levels.slice(0, 4).map((level) => {
                      const meta = getRiskMetadata(level);
                      return (
                        <div key={level} className={`criteria-item ${tone(level)}`}>
                          <span className="criteria-label">{level}</span>
                          <span className="criteria-description">
                            {meta.criteria.map((c, i) => (
                              <span key={i}>{c}{i < meta.criteria.length - 1 ? " " : ""}</span>
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {summary && page === "table" && (
          <section className="content">
            <div className="section-heading"><div><h2>{CONFIG.labels.riskTable}</h2><p>{CONFIG.labels.riskTableDesc} ({periodConfig?.label}).</p></div><span className="result-count">{filteredAccounts.length} {CONFIG.labels.accounts}</span></div>
            <div className="panel-card table-wrap">
              <table><thead><tr><th>{CONFIG.labels.accountTableHeader}</th><th>{CONFIG.labels.priorAvgHeader}</th><th>{CONFIG.labels.recentAvgHeader}</th><th>{CONFIG.labels.declineHeader}</th><th>{CONFIG.labels.riskLevelHeader}</th><th>{CONFIG.labels.priorityHeader}</th></tr></thead>
                <tbody>{filteredAccounts.map((account) => <tr key={account.account_id} onClick={() => openAccount(account.account_id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && openAccount(account.account_id)}>
                  <td><strong>{accountName(account.account_id)}</strong><small>{account.account_id} · {account.weekly_logins.length} {CONFIG.labels.weeksHeader}</small></td>
                  <td>{formatValue(account.previous_average)}</td><td>{formatValue(account.recent_average)}</td>
                  <td className={account.decline_percent && account.decline_percent > 0 ? "decline" : ""}>{formatChange(account.decline_percent)}</td>
                  <td><RiskBadge level={account.risk_level} /></td><td>{account.priority}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {summary && page === "detail" && (
          <section className="content">
            <div className="section-heading"><div><h2>{CONFIG.labels.accountDetailTitle}</h2><p>{CONFIG.labels.accountDetailDesc} ({periodConfig?.label}).</p></div>
              <select aria-label={CONFIG.labels.selectAccount} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{filteredAccounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountName(account.account_id)}</option>)}</select>
            </div>
            {selected && <div className="detail-grid">
              <div className="panel-card chart-card">
                <div className="card-heading"><div><h3>{accountName(selected.account_id)}</h3><p>{selected.account_id} · {selected.weekly_logins.length} {CONFIG.labels.weeksOfHistory}</p></div><RiskBadge level={selected.risk_level} /></div>
                <TrendChart weeks={selected.weekly_logins} />
                <div className="chart-legend">
                  <span><i />{CONFIG.labels.chartLabel}</span>
                  <span>{periodConfig?.weeks === Infinity ? CONFIG.labels.priorPeriodAvgShort : CONFIG.labels.priorPeriodAvg.replace("{period}", `${periodConfig?.weeks}-week`)}: <strong>{formatValue(selected.previous_average)}</strong></span>
                  <span>{periodConfig?.weeks === Infinity ? CONFIG.labels.recentPeriodAvgShort : CONFIG.labels.recentPeriodAvg.replace("{period}", `${periodConfig?.weeks}-week`)}: <strong>{formatValue(selected.recent_average)}</strong></span>
                </div>
                <div className="detail-stats"><div><span>{CONFIG.labels.decline}</span><strong>{formatChange(selected.decline_percent)}</strong></div><div><span>{CONFIG.labels.trendSlope}</span><strong>{formatValue(selected.trend_slope)}</strong></div><div><span>{CONFIG.labels.confidence}</span><strong>{selected.confidence}%</strong></div></div>
              </div>
              <div className="panel-card explanation-card"><span className="card-kicker">WHY FLAGGED</span><h3>Usage signal</h3><p>{selected.explanation}</p>
                <div className="action-box"><span className="card-kicker">RECOMMENDED ACTION · {selected.priority.toUpperCase()}</span><strong>{selected.recommended_action}</strong><p>{selected.customer_success_notes}</p></div>
              </div>
            </div>}
          </section>
        )}
        <footer className="footer">{CONFIG.labels.footerBrand} <span>•</span> {CONFIG.labels.footerNote}</footer>
      </section>
    </main>
  );
}

function Metric({ label, value, tone: color }: { label: string; value: number; tone: string }) {
  return <div className={`metric-card ${color}`}><span>{label}</span><strong>{value}</strong><i /></div>;
}

function RiskBadge({ level }: { level: string }) {
  const metadata = getRiskMetadata(level);
  return (
    <span className={`badge ${tone(level)}`} title={metadata.tooltip}>
      <i />{level}
      <span className="risk-badge-tooltip">{metadata.tooltip}</span>
    </span>
  );
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
function formatChange(declinePercent: number | null) {
  if (declinePercent === null) return "—";
  const changePercent = -declinePercent;
  return `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%`;
}
async function checkResponse(response: Response) {
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

function calculateRiskLevel(declinePercent: number | null, dataPoints: number, trendSlope: number): string {
  const { criticalDecline, criticalTrendSlope, atRiskDecline, atRiskTrendSlope, watchDecline, minDataPoints } = CONFIG.riskThresholds;
  
  // Insufficient data check
  if (dataPoints < minDataPoints) return "Insufficient Data";
  if (declinePercent === null) return "Insufficient Data";

  // Critical threshold: > configured decline or steep negative trend
  if (declinePercent > criticalDecline || (trendSlope < criticalTrendSlope && declinePercent > atRiskDecline)) 
    return "Critical";

  // At Risk: configured decline or negative trend with moderate decline
  if (declinePercent > atRiskDecline || (trendSlope < atRiskTrendSlope && declinePercent > watchDecline)) 
    return "At Risk";

  // Watch: configured decline or slight negative trend
  if (declinePercent > watchDecline || (trendSlope < 0 && declinePercent > 5)) 
    return "Watch";

  // Healthy: stable or growing
  return "Healthy";
}

function getRiskMetadata(level: string) {
  const metadata: Record<string, { tooltip: string; criteria: string[] }> = {
    Healthy: {
      tooltip: "Stable or growing login activity. No decline signals detected.",
      criteria: [
        "Decline < 10% OR",
        "Stable trend (slope ≥ 0) with minimal decline"
      ]
    },
    Watch: {
      tooltip: "Early warning signal. Moderate login decline detected.",
      criteria: [
        "Decline 10-15% OR",
        "Slight negative trend (slope < 0) with 5-10% decline"
      ]
    },
    "At Risk": {
      tooltip: "Significant decline in login activity. Requires attention.",
      criteria: [
        "Decline 15-25% OR",
        "Negative trend (slope < -2) with 10%+ decline"
      ]
    },
    Critical: {
      tooltip: "Severe decline in login activity. Immediate action recommended.",
      criteria: [
        "Decline > 25% OR",
        "Steep negative trend (slope < -5) with 15%+ decline"
      ]
    },
    "Insufficient Data": {
      tooltip: "Account has less than 4 weeks of historical data.",
      criteria: ["Minimum 4 consecutive weeks of data required"]
    }
  };
  
  return metadata[level] || { tooltip: "Unknown risk level", criteria: [] };
}
