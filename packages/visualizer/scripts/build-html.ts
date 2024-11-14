import { strict as assert } from 'node:assert';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execa } from 'execa';
import {
  ensureDirectoryExistence,
  fileContentOfPath,
  safeCopyFile,
  tplReplacer,
} from './building-utils';

const demoData = ['demo', 'demo-mobile', 'zero-execution'];

const outputExtensionUnpackedBaseDir = join(__dirname, '../unpacked-extension');

const multiEntrySegment = fileContentOfPath('./fixture/multi-entries.html');
const reportTpl = fileContentOfPath('../html/report.html');
const reportCSS = fileContentOfPath('../dist/report.css');
const reportJS = fileContentOfPath('../dist/report.js');
const playgroundCSS = fileContentOfPath(
  '../unpacked-extension/lib/playground-entry.css',
);
const playgroundTpl = fileContentOfPath('../html/playground.html');
const extensionSidepanelTpl = fileContentOfPath(
  '../html/extension-sidepanel.html',
);

const outputReportHTML = join(__dirname, '../dist/report/index.html');
const outputMultiEntriesHTML = join(__dirname, '../dist/report/multi.html');
const outputEmptyDumpHTML = join(__dirname, '../dist/report/empty-error.html');
const outputExtensionZipDir = join(__dirname, '../dist/extension/');
const outputExtensionPageDir = join(outputExtensionUnpackedBaseDir, 'pages');
const outputExtensionPlayground = join(
  outputExtensionPageDir,
  'playground.html',
);
const outputExtensionSidepanel = join(outputExtensionPageDir, 'sidepanel.html');

/* report utils */
function emptyDumpReportHTML() {
  return tplReplacer(reportTpl, {
    css: `<style>\n${reportCSS}\n</style>\n`,
    js: `<script>\n${reportJS}\n</script>`,
    dump: '',
  });
}

function scriptsOfSettingReportTpl() {
  const leftAngleMark = '__left_angle_mark_';
  return `window.midscene_report_tpl = ${JSON.stringify(
    emptyDumpReportHTML(),
  ).replace(/</g, leftAngleMark)}.replace(/${leftAngleMark}/g, '<') ;`;
}

function putReportTplIntoHTML(html: string, outsourceMode = false) {
  assert(html.indexOf('</body>') !== -1, 'HTML must contain </body>');
  if (outsourceMode) {
    return html.replace(
      '</body>',
      `<script src="/lib/set-report-tpl.js"></script>\n</body>`,
    );
  }
  return html.replace(
    '</body>',
    `<script>\n${scriptsOfSettingReportTpl()}\n</script>\n</body>`,
  );
}

function reportHTMLWithDump(
  dumpJsonString?: string,
  rawDumpString?: string,
  filePath?: string,
) {
  let dumpContent = rawDumpString;
  if (!dumpContent && dumpJsonString) {
    dumpContent = `<script type="midscene_web_dump">\n${dumpJsonString}\n</script>`;
  }

  const reportHTML = tplReplacer(emptyDumpReportHTML(), {
    dump: dumpContent,
  });

  const html = putReportTplIntoHTML(reportHTML);
  if (filePath) {
    writeFileSync(filePath, html);
    console.log(`HTML file generated successfully: ${filePath}`);
  }
  return html;
}

/* build task: extension */
function buildExtension() {
  // clear everything in the extension page dir
  rmSync(outputExtensionPageDir, { recursive: true, force: true });
  ensureDirectoryExistence(outputExtensionSidepanel);

  // write the set-report-tpl.js into the extension
  writeFileSync(
    join(__dirname, '../unpacked-extension/lib/set-report-tpl.js'),
    scriptsOfSettingReportTpl(),
  );

  // playground.html
  const resultWithOutsource = tplReplacer(playgroundTpl, {
    css: `<style>\n${playgroundCSS}\n</style>\n`,
    js: `<script src="/lib/playground-entry.js"></script>`,
    bootstrap: '<!-- leave it empty -->', // the entry iife will mount by itself
  });
  writeFileSync(
    outputExtensionPlayground,
    putReportTplIntoHTML(resultWithOutsource, true),
  );
  console.log(`HTML file generated successfully: ${outputExtensionPlayground}`);

  // sidepanel.html
  writeFileSync(
    outputExtensionSidepanel,
    putReportTplIntoHTML(extensionSidepanelTpl, true), // TODO: remove the inline script
  );
  console.log(`HTML file generated successfully: ${outputExtensionSidepanel}`);

  // put the htmlElement.js into the extension
  safeCopyFile(
    join(__dirname, '../../web-integration/dist/script/htmlElement.js'),
    join(__dirname, '../unpacked-extension/lib/htmlElement.js'),
  );
}

async function zipDir(src: string, dest: string) {
  // console.log('cwd', dirname(src));
  await execa('zip', ['-r', dest, '.'], {
    cwd: src,
  });
}

async function packExtension() {
  const manifest = fileContentOfPath('../unpacked-extension/manifest.json');

  const version = JSON.parse(manifest).version;
  const zipName = `midscene-extension-v${version}.zip`;
  const distFile = join(outputExtensionZipDir, zipName);
  ensureDirectoryExistence(distFile);

  // zip the extension
  await zipDir(outputExtensionUnpackedBaseDir, distFile);
}

/* build task: report and demo pages*/
function buildReport() {
  const reportHTMLContent = reportHTMLWithDump();
  assert(reportHTMLContent.length >= 1000);
  ensureDirectoryExistence(outputReportHTML);
  writeFileSync(outputReportHTML, reportHTMLContent);
  console.log(`HTML file generated successfully: ${outputReportHTML}`);

  // demo pages
  for (const demo of demoData) {
    reportHTMLWithDump(
      fileContentOfPath(`./fixture/${demo}.json`),
      undefined,
      join(__dirname, `../dist/report/${demo}.html`),
    );
  }

  // multi entries
  reportHTMLWithDump(undefined, multiEntrySegment, outputMultiEntriesHTML);

  // dump data with empty array
  reportHTMLWithDump(
    undefined,
    '<script type="midscene_web_dump"></script>',
    outputEmptyDumpHTML,
  );

  // copy to @midscene/core
  safeCopyFile(
    outputReportHTML,
    join(__dirname, '../../midscene/report/index.html'),
  );
}

buildExtension();
buildReport();
packExtension();
