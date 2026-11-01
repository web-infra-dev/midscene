import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw new Error('Expected artifact and publication directories');
const assets = path.resolve(destination, 'assets');
mkdirSync(assets, { recursive: true });
const links = [];
for (const artifact of readdirSync(source).sort()) {
  if (!/^e2e-app-report-output-\d+$/.test(artifact)) continue;
  const root = realpathSync(path.resolve(source, artifact));
  const results = path.join(root, '.midscene/test-results');
  const summaries = readdirSync(results).map((entry) =>
    path.join(results, entry, 'summary.json'),
  );
  if (summaries.length !== 1)
    throw new Error(`Expected one result in ${artifact}`);
  const summary = JSON.parse(readFileSync(summaries[0], 'utf8'));
  const report = realpathSync(
    path.resolve(path.dirname(summaries[0]), summary.report),
  );
  const relative = path.relative(
    path.join(root, 'midscene_run/report'),
    report,
  );
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    path.basename(report) !== 'index.html'
  ) {
    throw new Error(`Invalid report path in ${artifact}`);
  }
  cpSync(path.dirname(report), path.join(assets, artifact), {
    recursive: true,
  });
  links.push(
    `<li><a href="./${artifact}/index.html">Report shard ${Number(artifact.split('-').at(-1)) + 1}</a></li>`,
  );
}
if (!links.length) throw new Error('No shard reports found');
writeFileSync(
  path.join(assets, 'index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Report E2E</title><h1>Report E2E</h1><ul>${links.join('')}</ul></html>`,
);
writeFileSync(
  path.join(destination, 'wrangler.json'),
  JSON.stringify({
    name: 'midscene-reports',
    compatibility_date: '2026-10-14',
    preview_urls: true,
    assets: { directory: assets, not_found_handling: 'none' },
    previews: {},
  }),
);
