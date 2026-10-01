// Локальный сервер без зависимостей. /admin отдаёт ту же страницу с модальным входом.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.avif': 'image/avif' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = ['/', '/admin', '/admin/'].includes(pathname) ? 'index.html' : pathname.slice(1);
    // Раздаём только фронтенд; SQL, тесты, dotfiles и исходники сервера недоступны.
    if (!(relative === 'index.html' || /^(css|js|assets)\//.test(relative)) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) { response.writeHead(404).end('Not found'); return; }
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep) || !types[extname(path)]) { response.writeHead(403).end(); return; }
    const data = await readFile(path);
    const headers = { 'Content-Type': types[extname(path)], 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) { response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end(); return; }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
      response.end(request.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': data.length });
      response.end(request.method === 'HEAD' ? undefined : data);
    }
  } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 400).end('Not found'); }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, '127.0.0.1', () => console.log(`Portfolio: http://localhost:${port}\nAdmin: http://localhost:${port}/admin`));
