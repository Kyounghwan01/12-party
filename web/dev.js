import http from 'node:http';
import { readFile } from 'node:fs/promises';
process.env.LOCAL_DEV ??= '1';
const { handle } = await import('./lib/quiz.js');

const files = { '/': 'index.html', '/admin': 'admin.html', '/screen': 'screen.html', '/common.js': 'common.js', '/style.css': 'style.css' };
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/api/quiz') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const out = await handle(new Request(`http://x${req.url}`, { method: req.method, body: chunks.length ? Buffer.concat(chunks) : undefined }));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    return res.end(await out.text());
  }
  const f = files[pathname];
  if (!f) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': `${types[f.split('.')[1]]}; charset=utf-8` });
  res.end(await readFile(new URL(`public/${f}`, import.meta.url)));
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
