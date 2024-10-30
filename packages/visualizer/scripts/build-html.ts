/* this is a builder for HTML files
Step: 
* Read the HTML tpl from './html/report.html'
* Replace the placeholders with the actual values
* {{css}} --> {{./dist/index.css}}
* {{js}} --> {{./dist/index.js}}
* Write the result to './dist/index.html'
* 
*/

import { strict as assert } from 'node:assert';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const reportHTMLPath = join(__dirname, '../html/report.html');
const reportCSSPath = join(__dirname, '../dist/report.css');
const reportJSPath = join(__dirname, '../dist/report.js');
const playgroundHTMLPath = join(__dirname, '../html/playground.html');
const playgroundCSSPath = join(__dirname, '../dist/playground.css');
const playgroundJSPath = join(__dirname, '../dist/playground.js');

const demoData = ['demo', 'demo-mobile', 'zero-execution'];

const multiEntrySegment = join(__dirname, './fixture/multi-entries.html');
const outputHTML = join(__dirname, '../dist/report/index.html');
const outputMultiEntriesHTML = join(__dirname, '../dist/report/multi.html');
const outputEmptyDumpHTML = join(__dirname, '../dist/report/empty-error.html');
const outputPlaygroundHTML = join(__dirname, '../dist/playground/index.html');
const outputPlaygroundWithOutsourceJS = join(
  __dirname,
  '../dist/playground/index-with-outsource.html',
);

function ensureDirectoryExistence(filePath: string) {
  const directoryPath = dirname(filePath);

  if (existsSync(directoryPath)) {
    return true;
  }

  mkdirSync(directoryPath, { recursive: true });
  return true;
}

function tplReplacer(tpl: string, obj: Record<string, string>) {
  return tpl.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return obj[key] || `{{${key}}}`; // keep the placeholder if not found
  });
}

function copyToCore() {
  const corePath = join(__dirname, '../../midscene/report/index.html');
  const corePathEsm = corePath.replace(/.html$/, '.ts');
  ensureDirectoryExistence(corePath);
  copyFileSync(outputHTML, corePath);
  console.log(`HTML file copied to core successfully: ${corePath}`);

  // make a module for import
  const htmlContent = readFileSync(corePath, 'utf-8');
  const htmlAsEsm = `export default ${JSON.stringify(htmlContent)}`;
  writeFileSync(corePathEsm, htmlAsEsm);
  console.log(`HTML.esm file copied to core successfully: ${corePathEsm}`);
}

function copyToWebIntegration() {
  const staticIndexPath = join(
    __dirname,
    '../../web-integration/static/index.html',
  );
  ensureDirectoryExistence(staticIndexPath);
  copyFileSync(outputPlaygroundHTML, staticIndexPath);
  console.log(
    `HTML file copied to web-integration successfully: ${staticIndexPath}`,
  );
}

function buildPlayground() {
  const html = readFileSync(playgroundHTMLPath, 'utf-8');
  const css = readFileSync(playgroundCSSPath, 'utf-8');
  const js = readFileSync(playgroundJSPath, 'utf-8');
  ensureDirectoryExistence(outputPlaygroundHTML);

  const result = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script>\n${js}\n</script>`,
    bootstrap: `<script> midscenePlayground.default.mount('app'); </script>`,
  });
  writeFileSync(outputPlaygroundHTML, result);
  console.log(`HTML file generated successfully: ${outputPlaygroundHTML}`);

  // add the outsource js
  const resultWithOutsource = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script src="/lib/playground-entry.js"></script>`,
    bootstrap: '<!-- leave it empty -->', // leave it to the extension to inject
  });
  writeFileSync(outputPlaygroundWithOutsourceJS, resultWithOutsource);
  console.log(
    `HTML file generated successfully: ${outputPlaygroundWithOutsourceJS}`,
  );

  copyToWebIntegration();
}

function buildReport() {
  const html = readFileSync(reportHTMLPath, 'utf-8');
  const css = readFileSync(reportCSSPath, 'utf-8');
  const js = readFileSync(reportJSPath, 'utf-8');

  const result = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script>\n${js}\n</script>`,
  });

  assert(result.length >= 1000);
  ensureDirectoryExistence(outputHTML);
  writeFileSync(outputHTML, result);
  console.log(`HTML file generated successfully: ${outputHTML}`);

  for (const demo of demoData) {
    const demoData = readFileSync(
      join(__dirname, `./fixture/${demo}.json`),
      'utf-8',
    );
    const resultWithDemo = tplReplacer(html, {
      css: `<style>\n${css}\n</style>\n`,
      js: `<script>\n${js}\n</script>`,
      dump: `<script type="midscene_web_dump" type="application/json">\n${demoData}\n</script>`,
    });
    const outputPath = join(__dirname, `../dist/report/${demo}.html`);
    writeFileSync(outputPath, resultWithDemo);
    console.log(`HTML file generated successfully: ${outputPath}`);
  }

  const multiEntriesData = readFileSync(multiEntrySegment, 'utf-8');
  const resultWithMultiEntries = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script>\n${js}\n</script>`,
    dump: multiEntriesData,
  });
  writeFileSync(outputMultiEntriesHTML, resultWithMultiEntries);
  console.log(`HTML file generated successfully: ${outputMultiEntriesHTML}`);

  // dump data with empty array
  const resultWithEmptyDump = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script>\n${js}\n</script>`,
    dump: '<script type="midscene_web_dump" type="application/json"></script>',
  });
  writeFileSync(outputEmptyDumpHTML, resultWithEmptyDump);
  console.log(`HTML file generated successfully: ${outputEmptyDumpHTML}`);

  copyToCore();
}

buildPlayground();
buildReport();
