import { existsSync, readFileSync, realpathSync } from 'node:fs';
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http';
import { extname, resolve } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export interface StaticServerInfo {
  url: string;
  stop: () => Promise<void>;
}

export function startStaticServer(rootDir: string): Promise<StaticServerInfo> {
  return new Promise((resolvePromise, reject) => {
    // Get canonical root path to prevent path traversal attacks
    const rootPath = realpathSync(rootDir);

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Parse URL to extract pathname only (ignore query strings)
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

      // Resolve the path relative to root directory
      const filePath = resolve(rootPath, `.${pathname}`);

      // Security check: ensure the resolved path is within rootPath
      if (!filePath.startsWith(rootPath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const url = `http://${address.address}:${address.port}`;
        resolvePromise({
          url,
          stop: () =>
            new Promise<void>((resolveStop) => {
              server.close(() => resolveStop());
            }),
        });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', reject);
  });
}
