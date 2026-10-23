import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { EvaluationResult, Testcase } from './src/types';

const testcasesRoot = fileURLToPath(new URL('../testcases/', import.meta.url));
const outputRoot = fileURLToPath(
  new URL('../evaluation/output/', import.meta.url),
);

export async function createDatasetApp() {
  const app = new Hono();
  app.get('/api/testcases', async (context) => {
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
    context.header('Cache-Control', 'no-store');
    return context.json({ testcases });
  });
  app.get('/api/runs', async (context) => {
    const entries = await readdir(outputRoot, { withFileTypes: true }).catch(
      (error) => {
        if (error.code !== 'ENOENT') throw error;
        return [];
      },
    );
    return context.json({
      runs: entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => Number(right) - Number(left)),
    });
  });
  app.get('/api/runs/:runId', async (context) => {
    const runId = context.req.param('runId');
    const runRoot = path.join(outputRoot, runId);
    const entries = await readdir(runRoot, {
      withFileTypes: true,
      recursive: true,
    }).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!entries) return context.notFound();
    const results: EvaluationResult[] = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const filename = path.join(entry.parentPath, entry.name);
          const relativePath = path
            .relative(runRoot, filename)
            .split(path.sep)
            .join('/');
          return {
            ...JSON.parse(await readFile(filename, 'utf8')),
            id: relativePath.slice(0, -5),
            jsonUrl: `/results/${encodeURIComponent(runId)}/${relativePath.split('/').map(encodeURIComponent).join('/')}`,
          };
        }),
    );
    return context.json({ results });
  });
  app.use(
    '/images/*',
    serveStatic({
      root: testcasesRoot,
      rewriteRequestPath: (pathname) => pathname.replace('/images', ''),
    }),
  );
  app.use(
    '/results/*',
    serveStatic({
      root: outputRoot,
      allowPercentInPath: true,
      rewriteRequestPath: (pathname) => pathname.replace('/results', ''),
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
  for (const route of [
    '/',
    '/benchmark',
    '/benchmark/:name',
    '/runs',
    '/runs/:runId',
    '/runs/:runId/:id',
  ]) {
    app.get(route, serveStatic({ path: path.join(distRoot, 'index.html') }));
  }

  serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () =>
    console.log(`Grounding viewer: http://127.0.0.1:${port}`),
  );
}
