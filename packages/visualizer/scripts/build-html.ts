/* this is a builder for HTML files
Step: 
* Read the HTML tpl from './html/tpl.html'
* Replace the placeholders with the actual values
* {{css}} --> {{./dist/index.css}}
* {{js}} --> {{./dist/index.js}}
* Write the result to './dist/index.html'
* 
*/

import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const htmlPath = join(__dirname, '../html/tpl.html');
const cssPath = join(__dirname, '../dist/index.css');
const jsPath = join(__dirname, '../dist/index.js');
const demoPath = join(__dirname, './fixture/demo-dump.json');

function tplReplacer(tpl: string, obj: Record<string, string>) {
  return tpl.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return obj[key] || `{{${key}}}`; // keep the placeholder if not found
  });
}

function build() {
  const html = readFileSync(htmlPath, 'utf-8');
  const css = readFileSync(cssPath, 'utf-8');
  const js = readFileSync(jsPath, 'utf-8');

  const result = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script>\n${js}\n</script>`,
  });

  assert(result.length >= 1000);
  const output = join(__dirname, '../dist/index.html');
  writeFileSync(output, result);
  console.log(`HTML file generated successfully: ${output}`);

  const demoData = readFileSync(demoPath, 'utf-8');
  const resultWithDemo = tplReplacer(html, {
    css: `<style>\n${css}\n</style>\n`,
    js: `<script>\n${js}\n</script>`,
    dump: `<script type="midscene_web_dump" type="application/json">${demoData}</script>`,
  });
  const outputWithDemo = join(__dirname, '../dist/demo.html');
  writeFileSync(outputWithDemo, resultWithDemo);
  console.log(`HTML file generated successfully: ${outputWithDemo}`);
}

build();
