#!/usr/bin/env node
// Tiny HTTP sidecar for clawd-gui:
// - POST /upload — save file attachments to disk
// - GET /usage  — return Claude usage data (cached 2 min)

import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fetchClaudeUsage } from './fetch-usage.js';

const PORT = parseInt(process.env.UPLOAD_PORT || '9089', 10);
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/home/alex/clawd/uploads';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// Usage cache — avoid hammering claude.ai
let usageCache = null;
let usageCacheTime = 0;
const USAGE_CACHE_MS = 2 * 60 * 1000; // 2 minutes

await mkdir(UPLOAD_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /usage — Claude usage data
  if (req.method === 'GET' && req.url === '/usage') {
    const now = Date.now();
    if (usageCache && (now - usageCacheTime) < USAGE_CACHE_MS) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usageCache));
      return;
    }

    try {
      usageCache = await fetchClaudeUsage();
      usageCacheTime = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usageCache));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // POST /upload — file upload
  if (req.method === 'POST' && req.url === '/upload') {
    try {
      const chunks = [];
      let totalBytes = 0;

      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }));
          return;
        }
        chunks.push(chunk);
      }

      const body = Buffer.concat(chunks);
      const originalName = req.headers['x-filename'] || 'upload';
      const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const id = randomUUID().slice(0, 8);
      const fileName = `${id}-${safeName}`;
      const filePath = join(UPLOAD_DIR, fileName);

      await writeFile(filePath, body);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: filePath, fileName }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sidecar listening on http://0.0.0.0:${PORT}`);
});
