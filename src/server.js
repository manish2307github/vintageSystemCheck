import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addAction, getAnalysis, importCsv } from './data.js';

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

export function createServer() {
  return createHttpServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");

    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(response, 200, { status: 'ok' });
      }
      if (request.method === 'GET' && url.pathname === '/api/dashboard') {
        return sendJson(response, 200, await getAnalysis());
      }
      if (request.method === 'POST' && url.pathname === '/api/actions') {
        const body = await readBody(request, 16_384);
        return sendJson(response, 201, await addAction(JSON.parse(body)));
      }
      if (request.method === 'POST' && url.pathname === '/api/import') {
        const csv = await readBody(request, 2_000_000);
        return sendJson(response, 200, { importedAccounts: await importCsv(csv) });
      }
      if (request.method === 'GET') return await serveStatic(url.pathname, response);
      return sendJson(response, 405, { error: 'Method not allowed.' });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : error.message === 'Account not found.' ? 404 : 400;
      return sendJson(response, status, { error: error.message || 'Request failed.' });
    }
  });
}

async function serveStatic(pathname, response) {
  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return sendJson(response, 400, { error: 'Invalid URL path.' });
  }
  const filePath = path.resolve(publicDirectory, `.${relativePath}`);
  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    return sendJson(response, 403, { error: 'Forbidden.' });
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
  }
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, host, () => {
    console.log(`Churn Signals running at http://${host}:${port}`);
  });
}