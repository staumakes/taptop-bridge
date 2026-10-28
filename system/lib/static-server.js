const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { inside } = require('./project');

// Read-only static server for local previews and the comparison tool. It binds
// to 127.0.0.1 only, answers GET/HEAD, and never follows a path or symlink out
// of its root.
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function startStaticServer({ root, port = 4320 }) {
  const realRoot = fs.realpathSync(root);
  const server = http.createServer((request, response) => {
    const send = (status, text) => { response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); response.end(text); };
    if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Method not allowed');
    let relative;
    try { relative = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch { return send(400, 'Bad request'); }
    if (relative.split('/').includes('..') || relative.includes('\0')) return send(403, 'Forbidden');
    let file = path.join(realRoot, relative);
    try {
      file = fs.realpathSync(file);
      if (!inside(realRoot, file) && file !== realRoot) return send(403, 'Forbidden');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const bytes = fs.readFileSync(file);
      response.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      send(404, 'Not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startStaticServer };
