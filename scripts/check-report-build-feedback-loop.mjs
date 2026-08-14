import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const reportHtmlPath = path.join(
  repositoryRoot,
  'apps',
  'report',
  'dist',
  'index.html',
);

function readReportSnapshot() {
  const content = readFileSync(reportHtmlPath);
  const html = content.toString('utf8');

  return {
    bytes: content.byteLength,
    documentCount: html.match(/<!doctype html>/gi)?.length ?? 0,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function formatSnapshot(snapshot) {
  return `${snapshot.bytes} bytes, ${snapshot.documentCount} HTML document(s), sha256=${snapshot.sha256}`;
}

const beforeRebuild = readReportSnapshot();

if (beforeRebuild.documentCount === 0) {
  throw new Error(
    `Cannot check the Report build: ${reportHtmlPath} does not contain an HTML document.`,
  );
}

execFileSync(
  'pnpm',
  ['exec', 'nx', 'build', '@midscene/report', '--skip-nx-cache'],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
  },
);

const afterRebuild = readReportSnapshot();
// Rsbuild output hashes may vary between otherwise equivalent builds. The
// feedback loop is identified by another embedded document and near-doubling.
const hasEmbeddedDocument =
  afterRebuild.documentCount > beforeRebuild.documentCount;
const hasUnexpectedGrowth = afterRebuild.bytes > beforeRebuild.bytes * 1.5;

if (hasEmbeddedDocument || hasUnexpectedGrowth) {
  throw new Error(
    [
      'Report build feedback loop detected. The second build embedded a previous Report template.',
      `Before: ${formatSnapshot(beforeRebuild)}`,
      `After: ${formatSnapshot(afterRebuild)}`,
    ].join('\n'),
  );
}

console.log(
  [
    'Report build has no template feedback loop.',
    `Before: ${formatSnapshot(beforeRebuild)}`,
    `After: ${formatSnapshot(afterRebuild)}`,
  ].join('\n'),
);
