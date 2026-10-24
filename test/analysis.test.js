import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAccount, parseWeeklyCsv } from '../src/analysis.js';

const weeks = (logins) => logins.map((value, index) => ({
  weekStart: new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10),
  logins: value
}));

test('flags a sustained decline and explains its evidence', () => {
  const account = { accountId: 'A1', accountName: 'Test Account', history: weeks([
    50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 30, 28, 25, 22
  ]) };
  const result = analyzeAccount(account);

  assert.equal(result.status, 'at-risk');
  assert.equal(result.changePct, -47.5);
  assert.equal(result.decliningWeeks, 4);
  assert.match(result.reasons[0], /48% change/);
});

test('keeps a moderate decline in watch, not at-risk', () => {
  const account = { accountId: 'A2', accountName: 'Test Account', history: weeks([
    40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 35, 34, 30, 25
  ]) };

  assert.equal(analyzeAccount(account).status, 'watch');
});

test('withholds a trend when history is too short or has a gap', () => {
  const short = { accountId: 'A3', accountName: 'New Account', history: weeks([10, 9, 8, 7, 6, 5, 4, 3]) };
  const gapHistory = weeks(Array(12).fill(10));
  gapHistory[7].weekStart = '2026-02-25';
  const gap = { accountId: 'A4', accountName: 'Gap Account', history: gapHistory };

  assert.equal(analyzeAccount(short).status, 'insufficient');
  assert.equal(analyzeAccount(gap).status, 'insufficient');
});

test('normalizes CSV whitespace, sorts weeks, and preserves quoted commas', () => {
  const csv = [
    ' account_id , account_name , week_start , weekly_logins ',
    'A1,"North, West",2026-01-12, 7 ',
    'A1,"North, West",2026-01-05,5'
  ].join('\n');
  const result = parseWeeklyCsv(csv);

  assert.equal(result[0].accountName, 'North, West');
  assert.deepEqual(result[0].history.map((week) => week.logins), [5, 7]);
});

test('rejects duplicate weeks and invalid login counts', () => {
  const duplicate = 'account_id,account_name,week_start,weekly_logins\nA1,Account,2026-01-05,5\nA1,Account,2026-01-05,6';
  const invalidCount = 'account_id,account_name,week_start,weekly_logins\nA1,Account,2026-01-05,-1';

  assert.throws(() => parseWeeklyCsv(duplicate), /duplicate account_id and week_start/);
  assert.throws(() => parseWeeklyCsv(invalidCount), /non-negative whole number/);
});