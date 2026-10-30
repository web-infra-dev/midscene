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

export const datasetApp = new Hono();
datasetApp.get('/api/testcases', async (context) => {
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
datasetApp.get('/api/evaluations', async (context) => {
  const entries = await readdir(outputRoot, { withFileTypes: true }).catch(
    (error) => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    },
  );
  return context.json({
    evaluations: entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => Number(right) - Number(left)),
  });
});
datasetApp.get('/api/evaluations/:evaluationId', async (context) => {
  const evaluationId = context.req.param('evaluationId');
  const evaluationRoot = path.join(outputRoot, evaluationId);
  const entries = await readdir(evaluationRoot, {
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
          .relative(evaluationRoot, filename)
          .split(path.sep)
          .join('/');
        return {
          ...JSON.parse(await readFile(filename, 'utf8')),
          id: relativePath.slice(0, -5),
          jsonUrl: `/results/${encodeURIComponent(evaluationId)}/${relativePath.split('/').map(encodeURIComponent).join('/')}`,
        };
      }),
  );
  return context.json({ results });
});
datasetApp.use(
  '/images/*',
  serveStatic({
    root: testcasesRoot,
    rewriteRequestPath: (pathname) => pathname.replace('/images', ''),
  }),
);
datasetApp.use(
  '/results/*',
  serveStatic({
    root: outputRoot,
    allowPercentInPath: true,
    rewriteRequestPath: (pathname) => pathname.replace('/results', ''),
  }),
);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: { port: { type: 'string', default: '4319' } },
  });
  const port = Number(values.port);
  const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
  datasetApp.use('*', serveStatic({ root: distRoot }));
  for (const route of [
    '/',
    '/testcases',
    '/testcases/:name',
    '/evaluations',
    '/evaluations/:evaluationId',
    '/evaluations/:evaluationId/:id',
  ]) {
    datasetApp.get(
      route,
      serveStatic({ path: path.join(distRoot, 'index.html') }),
    );
  }

  serve({ fetch: datasetApp.fetch, hostname: '0.0.0.0', port }, () =>
    console.log(`Grounding viewer: http://127.0.0.1:${port} (host: 0.0.0.0)`),
  );
}
