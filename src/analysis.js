const WEEKS_REQUIRED = 12;
const RECENT_WEEKS = 4;
const BASELINE_WEEKS = 8;
const AT_RISK_DECLINE_PCT = 30;
const WATCH_DECLINE_PCT = 15;
const AT_RISK_DECLINE_STREAK = 3;

export function analyzeAccount(account) {
  const history = [...account.history].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  const latestHistory = history.slice(-WEEKS_REQUIRED);
  const contiguous = latestHistory.length === WEEKS_REQUIRED && latestHistory.every((week, index) => {
    if (index === 0) return true;
    const priorDate = new Date(`${latestHistory[index - 1].weekStart}T00:00:00Z`);
    const currentDate = new Date(`${week.weekStart}T00:00:00Z`);
    return currentDate.getTime() - priorDate.getTime() === 7 * 24 * 60 * 60 * 1000;
  });

  if (latestHistory.length < WEEKS_REQUIRED || !contiguous) {
    return {
      ...account,
      historyWeeks: history.length,
      status: 'insufficient',
      reasons: [latestHistory.length < WEEKS_REQUIRED
        ? `Needs ${WEEKS_REQUIRED} consecutive weeks; has ${history.length}.`
        : 'Recent history has missing weeks; trend is withheld.'],
      recentAverage: null,
      baselineAverage: null,
      changePct: null,
      decliningWeeks: 0,
      suggestedAction: 'Review after more complete weekly history is available.'
    };
  }

  const baseline = latestHistory.slice(0, BASELINE_WEEKS).map((week) => week.logins);
  const recent = latestHistory.slice(BASELINE_WEEKS).map((week) => week.logins);
  const baselineAverage = average(baseline);
  const recentAverage = average(recent);
  const changePct = baselineAverage === 0
    ? (recentAverage === 0 ? 0 : 100)
    : ((recentAverage - baselineAverage) / baselineAverage) * 100;
  let decliningWeeks = 0;
  for (let index = history.length - 1; index > 0; index -= 1) {
    const previous = history[index - 1];
    const current = history[index];
    const previousDate = new Date(`${previous.weekStart}T00:00:00Z`);
    const currentDate = new Date(`${current.weekStart}T00:00:00Z`);
    if (currentDate.getTime() - previousDate.getTime() !== 7 * 24 * 60 * 60 * 1000 || current.logins >= previous.logins) break;
    decliningWeeks += 1;
  }

  const declinePct = Math.max(0, -changePct);
  const atRisk = declinePct >= AT_RISK_DECLINE_PCT && decliningWeeks >= AT_RISK_DECLINE_STREAK;
  const watch = declinePct >= WATCH_DECLINE_PCT || decliningWeeks >= 2;
  const status = atRisk ? 'at-risk' : watch ? 'watch' : 'healthy';
  const reasons = [
    `${formatPct(declinePct)} change: ${formatNumber(recentAverage)} recent weekly logins vs ${formatNumber(baselineAverage)} baseline.`,
    `${decliningWeeks} consecutive week-over-week decline${decliningWeeks === 1 ? '' : 's'}.`
  ];

  return {
    ...account,
    historyWeeks: history.length,
    status,
    reasons,
    recentAverage: round(recentAverage),
    baselineAverage: round(baselineAverage),
    changePct: round(changePct),
    decliningWeeks,
    suggestedAction: status === 'at-risk'
      ? 'Ask the account owner to review usage with the customer and agree on one adoption goal.'
      : status === 'watch'
        ? 'Check for a recent workflow or staffing change before outreach.'
        : 'Continue routine monitoring.'
  };
}

export function parseWeeklyCsv(csv) {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error('CSV must include a header and at least one data row.');

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const required = ['account_id', 'account_name', 'week_start', 'weekly_logins'];
  const indexes = Object.fromEntries(required.map((column) => [column, headers.indexOf(column)]));
  const missing = required.filter((column) => indexes[column] < 0);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

  const accounts = new Map();
  const seenWeeks = new Set();
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const accountId = row[indexes.account_id]?.trim();
    const accountName = row[indexes.account_name]?.trim();
    const weekStart = row[indexes.week_start]?.trim();
    const rawLogins = row[indexes.weekly_logins]?.trim();
    if (!accountId || !accountName || !weekStart || rawLogins === '') {
      throw new Error(`Line ${line}: account_id, account_name, week_start, and weekly_logins are required.`);
    }
    if (!isValidDate(weekStart)) throw new Error(`Line ${line}: week_start must be a valid YYYY-MM-DD date.`);
    if (!/^\d+$/.test(rawLogins)) throw new Error(`Line ${line}: weekly_logins must be a non-negative whole number.`);

    const key = `${accountId}\u0000${weekStart}`;
    if (seenWeeks.has(key)) throw new Error(`Line ${line}: duplicate account_id and week_start.`);
    seenWeeks.add(key);

    const account = accounts.get(accountId) ?? { accountId, accountName, history: [] };
    if (account.accountName !== accountName) throw new Error(`Line ${line}: account_name changed for ${accountId}.`);
    account.history.push({ weekStart, logins: Number(rawLogins) });
    accounts.set(accountId, account);
  });

  return [...accounts.values()].map((account) => ({
    ...account,
    history: account.history.sort((left, right) => left.weekStart.localeCompare(right.weekStart))
  }));
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPct(value) {
  return `${Math.round(value)}%`;
}