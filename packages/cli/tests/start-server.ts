import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

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
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let filePath = join(rootDir, req.url === '/' ? 'index.html' : req.url || '');

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
        resolve({
          url,
          stop: () => new Promise<void>((resolveStop) => {
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
