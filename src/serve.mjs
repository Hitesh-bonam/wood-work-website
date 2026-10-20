// A tiny web server for the finished site (used by the preview and the tests).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @param {object} options
 * @param {string} options.dir      folder to serve
 * @param {string} [options.prefix] serve the site under this path, like GitHub Pages does ("/wood-work")
 * @param {Record<string, Function>} [options.routes] extra handlers by exact path
 */
export function createStaticServer({ dir, prefix = '', routes = {} }) {
  const root = path.resolve(dir);
  const base = prefix.replace(/\/+$/, '');
  return http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end('Server error');
    }
  });

  function handle(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (pathname.includes('\0')) {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (routes[pathname]) {
      routes[pathname](req, res);
      return;
    }
    const sendNotFound = () => {
      const page = path.join(root, '404.html');
      fs.readFile(page, (err, body) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(err ? 'Not found' : body);
      });
    };
    if (base) {
      if (pathname === base) {
        res.writeHead(301, { Location: `${base}/` }).end();
        return;
      }
      if (!pathname.startsWith(`${base}/`)) {
        sendNotFound();
        return;
      }
      pathname = pathname.slice(base.length);
    }
    const file = path.join(root, pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(file, (err, stat) => {
      if (!err && stat.isDirectory()) {
        if (!pathname.endsWith('/')) {
          const search = new URL(req.url, 'http://localhost').search;
          res.writeHead(301, { Location: `${base}${pathname}/${search}` }).end();
          return;
        }
        serveFile(path.join(file, 'index.html'));
        return;
      }
      if (err) {
        sendNotFound();
        return;
      }
      serveFile(file);
    });
    function serveFile(target) {
      fs.stat(target, (err, stat) => {
        if (err || !stat.isFile()) {
          sendNotFound();
          return;
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-store',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
      });
    }
  }
}

/** Listens on the first free port starting at `port`. */
export function listen(server, port, host = '127.0.0.1', tries = 20) {
  return new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      const onError = (err) => {
        server.off('listening', onListening);
        if (err.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1);
        else reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(p, host);
    };
    attempt(port, tries);
  });
}
