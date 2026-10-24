import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAccount, parseWeeklyCsv } from './analysis.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(projectRoot, 'data');
const seedPath = path.join(dataDirectory, 'seed.json');
const importedPath = path.join(dataDirectory, 'imported.json');
const actionsPath = path.join(dataDirectory, 'actions.json');
const latestSeedWeek = '2026-10-19';

export async function getAccounts() {
  try {
    const imported = JSON.parse(await readFile(importedPath, 'utf8'));
    return imported.accounts;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const seed = JSON.parse(await readFile(seedPath, 'utf8'));
  return seed.map((account) => {
    const lastWeek = new Date(`${latestSeedWeek}T00:00:00Z`);
    const startWeek = new Date(lastWeek.getTime() - (account.weeklyLogins.length - 1) * 7 * 24 * 60 * 60 * 1000);
    return {
      accountId: account.accountId,
      accountName: account.accountName,
      segment: account.segment,
      history: account.weeklyLogins.map((logins, index) => ({
        weekStart: new Date(startWeek.getTime() + index * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        logins
      }))
    };
  });
}

export async function getAnalysis() {
  const accounts = (await getAccounts()).map(analyzeAccount);
  const actions = await readActions();
  const counts = accounts.reduce((result, account) => {
    result[account.status] += 1;
    return result;
  }, { 'at-risk': 0, watch: 0, healthy: 0, insufficient: 0 });
  return { accounts, actions, counts, asOf: new Date().toISOString() };
}

export async function importCsv(csv) {
  const accounts = parseWeeklyCsv(csv);
  const tempPath = `${importedPath}.tmp`;
  await writeFile(tempPath, JSON.stringify({ accounts }, null, 2), 'utf8');
  await rename(tempPath, importedPath);
  return accounts.length;
}

export async function addAction({ accountId, type, owner, note }) {
  const account = (await getAccounts()).find((item) => item.accountId === accountId);
  if (!account) throw new Error('Account not found.');
  if (!['contacted', 'follow-up', 'dismissed'].includes(type)) throw new Error('Unsupported action type.');
  if (typeof note !== 'string' || note.length > 500) throw new Error('Note must be 500 characters or fewer.');
  if (typeof owner !== 'string' || owner.trim().length === 0 || owner.length > 80) throw new Error('Owner must be 1 to 80 characters.');

  const actions = await readActions();
  const action = {
    id: crypto.randomUUID(),
    accountId,
    type,
    owner: owner.trim(),
    note: note.trim(),
    createdAt: new Date().toISOString()
  };
  actions.unshift(action);
  await writeFile(actionsPath, JSON.stringify(actions, null, 2), 'utf8');
  return action;
}

async function readActions() {
  try {
    return JSON.parse(await readFile(actionsPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}