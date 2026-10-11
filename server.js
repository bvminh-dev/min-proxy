// Proxy nhẹ, không phụ thuộc thư viện ngoài. Chạy: node server.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = process.env.CONFIG || path.join(__dirname, 'config.json');

let cache = { mtime: 0, data: null };
function loadConfig() {
  const mtime = fs.statSync(CONFIG_FILE).mtimeMs;
  if (mtime !== cache.mtime) {
    cache = { mtime, data: JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    console.log('Đã nạp config:', Object.keys(cache.data.routes || {}).length, 'route');
  }
  return cache.data;
}

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function send(res, status, msg) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}

function handle(req, res) {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    return send(res, 500, 'Config lỗi: ' + e.message);
  }

  // Xác thực (tùy chọn): header x-api-key phải khớp config.apiKey
  if (cfg.apiKey && req.headers['x-api-key'] !== cfg.apiKey) {
    return send(res, 401, 'Sai hoặc thiếu x-api-key');
  }

  // Dạng gọi: /<code>[/path/phụ][?query]
  const incoming = new URL(req.url, 'http://localhost');
  const [, code, ...rest] = incoming.pathname.split('/');
  const base = cfg.routes && cfg.routes[decodeURIComponent(code || '')];
  if (!base) return send(res, 404, 'Không tìm thấy code');

  const target = new URL(base);
  if (rest.length) target.pathname = target.pathname.replace(/\/$/, '') + '/' + rest.join('/');
  // Gộp query: query trong config + query của request
  incoming.searchParams.forEach((v, k) => target.searchParams.append(k, v));

  // Header: giữ nguyên, chỉ bỏ hop-by-hop, host và x-api-key của proxy
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(k) || k === 'host' || k === 'x-api-key') continue;
    headers[k] = v;
  }

  const lib = target.protocol === 'https:' ? https : http;
  const upstream = lib.request(target, { method: req.method, headers }, (up) => {
    // Trả nguyên status, header (kể cả nhiều set-cookie) và body (không giải nén)
    const out = {};
    for (const [k, v] of Object.entries(up.headers)) {
      if (!HOP_BY_HOP.has(k)) out[k] = v;
    }
    res.writeHead(up.statusCode, up.statusMessage, out);
    up.pipe(res);
  });

  upstream.setTimeout(cfg.timeoutMs || 60000, () => upstream.destroy(new Error('timeout')));
  upstream.on('error', (e) => {
    if (!res.headersSent) send(res, 502, 'Lỗi gọi upstream: ' + e.message);
    else res.destroy();
  });
  req.on('aborted', () => upstream.destroy());

  req.pipe(upstream); // stream body, không buffer
}

let port = 3000;
try { port = loadConfig().port || port; } catch (e) { console.error(e.message); process.exit(1); }

http.createServer(handle).listen(port, () => console.log(`Proxy chạy tại http://localhost:${port}`));
