// Runs the Express backend (server/src/app.js) as a Netlify Function at /api/*
import http from 'node:http';
import { createApp } from '../../server/src/app.js';

let baseUrl;

// Start Express once per function instance on a private local port,
// then forward each incoming request to it.
function start() {
  baseUrl ||= new Promise((resolve, reject) => {
    const server = http.createServer(createApp());
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    server.on('error', reject);
  });
  return baseUrl;
}

export default async (req) => {
  const base = await start();
  const url = new URL(req.url);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const fwd = new Headers(req.headers);
  for (const h of ['host', 'connection', 'content-length', 'accept-encoding']) fwd.delete(h);
  const res = await fetch(base + url.pathname + url.search, {
    method: req.method,
    headers: fwd,
    body: hasBody ? await req.arrayBuffer() : undefined,
  });
  const headers = new Headers(res.headers);
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  headers.delete('connection');
  return new Response(await res.arrayBuffer(), { status: res.status, headers });
};

export const config = { path: '/api/*' };
