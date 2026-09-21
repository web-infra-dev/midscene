#!/usr/bin/env node

/**
 * Rebuild a report from the current report shell while preserving the normal
 * report data tags and the experimental Animated WebP attachment tags.
 *
 * Usage:
 *   node packages/core/scripts/retheme-animated-webp-report-poc.mjs input.html output.html
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  throw new Error(
    'Usage: retheme-animated-webp-report-poc.mjs input.html output.html',
  );
}

const reportHtml = await readFile(resolve(inputArg), 'utf8');
const shellPath = resolve('apps/report/dist/index.html');
const shellHtml = await readFile(shellPath, 'utf8');
const tagPattern =
  /<script type="(midscene(?:_web_dump|-image|-animated-webp(?:-manifest)?))"[^>]*>([\s\S]*?)<\/script>/g;
const dataScripts = [];
let match;
match = tagPattern.exec(reportHtml);
while (match) {
  const [tag, type, content] = match;
  const trimmed = content.trim();
  const isData =
    (type === 'midscene_web_dump' && trimmed.startsWith('{')) ||
    (type === 'midscene-image' && trimmed.startsWith('data:image/')) ||
    (type === 'midscene-animated-webp' &&
      trimmed.startsWith('data:image/webp;base64,')) ||
    (type === 'midscene-animated-webp-manifest' && trimmed.startsWith('{'));
  if (isData) {
    dataScripts.push(tag);
  }
  match = tagPattern.exec(reportHtml);
}
if (!dataScripts.length) {
  throw new Error('No Midscene report data scripts found');
}
const closingHtml = shellHtml.lastIndexOf('</html>');
if (closingHtml < 0) {
  throw new Error('Report shell is missing </html>');
}
const outputHtml = `${shellHtml.slice(0, closingHtml)}\n${dataScripts.join('\n')}\n${shellHtml.slice(closingHtml)}`;
await writeFile(resolve(outputArg), outputHtml);
console.log(`Rethemed report written to: ${resolve(outputArg)}`);
console.log(
  `Copied ${dataScripts.length} data script(s) from ${resolve(inputArg)}`,
);
