import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.MIDSCENE_ANDROID_TODO_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid MIDSCENE_ANDROID_TODO_PORT: ${port}`);
}

const fixtureUrl = new URL('../tests/fixtures/todo-mvc.html', import.meta.url);
const fixture = await readFile(fileURLToPath(fixtureUrl));

const server = createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok\n');
    return;
  }

  if (request.url === '/' || request.url === '/index.html') {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    });
    response.end(fixture);
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found\n');
});

server.on('error', (error) => {
  throw error;
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Android TodoMVC fixture listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        throw error;
      }
      process.exit(0);
    });
  });
}
