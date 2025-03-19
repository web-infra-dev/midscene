import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { rmSync, statSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ensureDirectoryExistence,
  fileContentOfPath,
  safeCopyFile,
  tplReplacer,
} from './building-utils';

const __dirname = dirname(__filename);

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

const replaceStringWithFirstAppearance = (
  str: string,
  target: string,
  replacement: string,
) => {
  const index = str.indexOf(target);
  return str.slice(0, index) + replacement + str.slice(index + target.length);
};

/* report utils */
function emptyDumpReportHTML() {
  let html = replaceStringWithFirstAppearance(
    reportTpl,
    '{{css}}',
    `<style>\n${reportCSS}\n</style>\n`,
  );
  html = replaceStringWithFirstAppearance(
    html,
    '{{js}}',
    `<script type="module">\n${reportJS}\n</script>`,
  );
  return html;
}

const tplRetrieverFn = `window.get_midscene_report_tpl = () => {
  const tpl = document.getElementById('midscene_report_tpl').innerText;
  if (!tpl) {
    return '';
  }
  const tplDecoded = decodeURIComponent(tpl);
  return tplDecoded;
};`;
function putReportTplIntoHTML(html: string, outsourceMode = false) {
  assert(html.indexOf('</body>') !== -1, 'HTML must contain </body>');

  if (outsourceMode) {
    const tplWrapper = `<noscript id="midscene_report_tpl">\n${encodeURIComponent(
      emptyDumpReportHTML(),
    )}\n</noscript>`;
    // in Chrome extension
    return html.replace(
      '</body>',
      `${tplWrapper}<script type="module" src="/lib/set-report-tpl.js"></script>\n</body>`,
    );
  }

  return html;
  // return html.replace(
  //   '</body>',
  //   `${tplWrapper}<script>${tplRetrieverFn}</script>\n</body>`,
  // );
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

  const emptyDumpHTML = emptyDumpReportHTML();
  assert(
    emptyDumpHTML.length <
      (process.env.CI ? 10 * 1000 * 1000 : 20 * 1000 * 1000),
    `emptyDumpHTML is too large, length: ${emptyDumpHTML.length}`,
  );

  const reportHTML = replaceStringWithFirstAppearance(
    emptyDumpHTML,
    '{{dump}}',
    dumpContent || '{{dump}}',
  );

  const html = putReportTplIntoHTML(reportHTML);
  if (filePath) {
    writeFileSync(filePath, html);
    console.log(`HTML file generated successfully: ${filePath}`);
  }
  return html;
}

async function zipDir(src: string, dest: string) {
  // console.log('cwd', dirname(src));
  execSync(`zip -r "${dest}" .`, {
    cwd: src,
  });
}

/* build task: report and demo pages*/
function buildReport() {
  const reportHTMLContent = reportHTMLWithDump();
  assert(reportHTMLContent.length >= 1000);
  ensureDirectoryExistence(outputReportHTML);
  writeFileSync(outputReportHTML, reportHTMLContent);
  console.log(
    `HTML file generated successfully: ${outputReportHTML}, size: ${reportHTMLContent.length}`,
  );

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
    join(__dirname, '../../core/report/index.html'),
  );
}

buildReport();
