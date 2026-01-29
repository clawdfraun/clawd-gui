#!/usr/bin/env node
// Tiny HTTP upload server for clawd-gui file attachments.
// Saves files to UPLOAD_DIR and returns the path so the agent can read them.

import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = parseInt(process.env.UPLOAD_PORT || '9089', 10);
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/home/alex/clawd/uploads';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

await mkdir(UPLOAD_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/upload') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

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
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Upload server listening on http://127.0.0.1:${PORT}`);
});
