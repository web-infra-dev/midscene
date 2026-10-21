import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Testcase } from './src/types';

const testcasesRoot = fileURLToPath(new URL('../testcases/', import.meta.url));

export async function createDatasetApp() {
  const entries = await readdir(testcasesRoot, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const testcases = await Promise.all(
    names.map(async (name) => {
      const record: Testcase = JSON.parse(
        await readFile(path.join(testcasesRoot, name, 'index.json'), 'utf8'),
      );
      const image =
        record.reference.image.format === 'png' ? 'image.png' : 'image.jpg';
      return { ...record, imageUrl: `/images/${name}/${image}` };
    }),
  );
  const app = new Hono();
  app.get('/api/testcases', (context) => context.json({ testcases }));
  app.use(
    '/images/*',
    serveStatic({
      root: testcasesRoot,
      rewriteRequestPath: (pathname) => pathname.replace('/images', ''),
    }),
  );
  return app;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: { port: { type: 'string', default: '4319' } },
  });
  const port = Number(values.port);
  const distRoot = fileURLToPath(new URL('./dist/', import.meta.url));
  const app = await createDatasetApp();
  app.use('*', serveStatic({ root: distRoot }));

  serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () =>
    console.log(`Grounding viewer: http://127.0.0.1:${port}`),
  );
}
