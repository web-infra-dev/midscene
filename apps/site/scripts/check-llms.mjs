import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const outputRoot = new URL('../doc_build/', import.meta.url);
const readOutput = (relativePath) =>
  readFile(new URL(relativePath, outputRoot), 'utf8');
const redirects = await readOutput('_redirects');

for (const [locale, introduction] of [
  ['', 'Midscene.js provides a vision-based GUI Agent'],
  ['zh/', 'Midscene.js 提供基于视觉的 GUI Agent'],
]) {
  const markdownPath = `${locale}index.md`;
  const markdown = await readOutput(markdownPath);
  assert.ok(
    markdown.includes(introduction) && markdown.includes('E2E'),
    `${markdownPath} must contain the homepage overview`,
  );
  assert.doesNotMatch(markdown, /<!doctype html>/i);

  const index = await readOutput(`${locale}llms.txt`);
  const links = [...index.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.equal(
    links.filter((link) => link === `https://midscenejs.com/${markdownPath}`)
      .length,
    1,
    `${locale}llms.txt must link to its homepage Markdown exactly once`,
  );
  const otherHomepage = locale ? '/index.md' : '/zh/index.md';
  assert.ok(
    !links.includes(`https://midscenejs.com${otherHomepage}`),
    `${locale}llms.txt must not include the other language's overview`,
  );
  assert.ok(
    (await readOutput(`${locale}llms-full.txt`)).includes(introduction),
    `${locale}llms-full.txt must retain the homepage overview`,
  );
  assert.ok(
    redirects
      .split('\n')
      .includes(`/${locale}introduction.md /${markdownPath} 301`),
    `/${locale}introduction.md must permanently redirect to existing Markdown`,
  );
}

console.log('LLMs overview and Markdown compatibility build checks passed.');
