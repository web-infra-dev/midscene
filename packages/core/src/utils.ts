import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { getRunningPkgInfo } from '@midscene/shared/fs';
import { assert } from '@midscene/shared/utils';
import { ifInBrowser, uuid } from '@midscene/shared/utils';
import {
  MIDSCENE_DEBUG_MODE,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  getAIConfig,
  getAIConfigInJson,
} from './env';
import type { Rect, ReportDumpWithAttributes } from './types';

let logDir = join(process.cwd(), './midscene_run/');
let logEnvReady = false;
export const groupedActionDumpFileExt = 'web-dump.json';

export function getLogDir() {
  return logDir;
}

export function setLogDir(dir: string) {
  logDir = dir;
}

export function getLogDirByType(type: 'dump' | 'cache' | 'report' | 'tmp') {
  const dir = join(getLogDir(), type);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

let reportTpl: string | null = null;
function getReportTpl() {
  if (ifInBrowser) {
    if (!reportTpl && (window as any).get_midscene_report_tpl) {
      reportTpl = (window as any).get_midscene_report_tpl();
    }
    // assert(
    //   reportTpl,
    //   'reportTpl should be set before writing report in browser',
    // );
    return reportTpl;
  }

  if (!reportTpl) {
    let reportPath = join(__dirname, '../../report/index.html');
    if (!existsSync(reportPath)) {
      reportPath = join(__dirname, '../report/index.html');
    }
    reportTpl = readFileSync(reportPath, 'utf-8');
  }
  return reportTpl;
}

export function replaceStringWithFirstAppearance(
  str: string,
  target: string,
  replacement: string,
) {
  const index = str.indexOf(target);
  return str.slice(0, index) + replacement + str.slice(index + target.length);
}

export function reportHTMLContent(
  dumpData: string | ReportDumpWithAttributes[],
): string {
  const tpl = getReportTpl();
  if (!tpl) {
    console.warn('reportTpl is not set, will not write report');
    return '';
  }
  let reportContent: string;
  if (
    (Array.isArray(dumpData) && dumpData.length === 0) ||
    typeof dumpData === 'undefined'
  ) {
    reportContent = replaceStringWithFirstAppearance(
      tpl,
      '{{dump}}',
      `<script type="midscene_web_dump" type="application/json"></script>`,
    );
  } else if (typeof dumpData === 'string') {
    reportContent = replaceStringWithFirstAppearance(
      tpl,
      '{{dump}}',
      `<script type="midscene_web_dump" type="application/json">${dumpData}</script>`,
    );
  } else {
    const dumps = dumpData.map(({ dumpString, attributes }) => {
      const attributesArr = Object.keys(attributes || {}).map((key) => {
        return `${key}="${encodeURIComponent(attributes![key])}"`;
      });
      return `<script type="midscene_web_dump" type="application/json" ${attributesArr.join(
        ' ',
      )}\n>${dumpString}\n</script>`;
    });
    reportContent = replaceStringWithFirstAppearance(
      tpl,
      '{{dump}}',
      dumps.join('\n'),
    );
  }
  return reportContent;
}

export function writeDumpReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes[],
): string | null {
  if (ifInBrowser) {
    console.log('will not write report in browser');
    return null;
  }

  const midscenePkgInfo = getRunningPkgInfo(__dirname);
  if (!midscenePkgInfo) {
    console.warn('midscenePkgInfo not found, will not write report');
    return null;
  }

  const reportPath = join(getLogDirByType('report'), `${fileName}.html`);
  const reportContent = reportHTMLContent(dumpData);
  if (!reportContent) {
    console.warn('reportContent is empty, will not write report');
    return null;
  }
  writeFileSync(reportPath, reportContent);

  return reportPath;
}

export function writeLogFile(opts: {
  fileName: string;
  fileExt: string;
  fileContent: string;
  type: 'dump' | 'cache' | 'report' | 'tmp';
  generateReport?: boolean;
}) {
  if (ifInBrowser) {
    return '/mock/report.html';
  }
  const { fileName, fileExt, fileContent, type = 'dump' } = opts;
  const targetDir = getLogDirByType(type);
  // Ensure directory exists
  if (!logEnvReady) {
    assert(targetDir, 'logDir should be set before writing dump file');

    // gitIgnore in the parent directory
    const gitIgnorePath = join(targetDir, '../../.gitignore');
    let gitIgnoreContent = '';
    if (existsSync(gitIgnorePath)) {
      gitIgnoreContent = readFileSync(gitIgnorePath, 'utf-8');
    }

    // ignore the log folder
    const logDirName = basename(logDir);
    if (!gitIgnoreContent.includes(`${logDirName}/`)) {
      writeFileSync(
        gitIgnorePath,
        `${gitIgnoreContent}\n# Midscene.js dump files\n${logDirName}/report\n${logDirName}/tmp\n`,
        'utf-8',
      );
    }
    logEnvReady = true;
  }

  const filePath = join(targetDir, `${fileName}.${fileExt}`);

  if (type !== 'dump') {
    // do not write dump file any more
    const outputResourceDir = dirname(filePath);
    if (!existsSync(outputResourceDir)) {
      mkdirSync(outputResourceDir, { recursive: true });
    }

    writeFileSync(filePath, fileContent);
  }

  if (opts?.generateReport) {
    return writeDumpReport(fileName, fileContent);
  }

  return filePath;
}

export function getTmpDir(): string | null {
  if (ifInBrowser) {
    return null;
  }
  const runningPkgInfo = getRunningPkgInfo();
  if (!runningPkgInfo) {
    return null;
  }
  const { name } = runningPkgInfo;
  const path = join(tmpdir(), name);
  mkdirSync(path, { recursive: true });
  return path;
}

export function getTmpFile(fileExtWithoutDot: string): string | null {
  if (ifInBrowser) {
    return null;
  }
  const tmpDir = getTmpDir();
  const filename = `${uuid()}.${fileExtWithoutDot}`;
  return join(tmpDir!, filename);
}

export function overlapped(container: Rect, target: Rect) {
  // container and the target have some part overlapped
  return (
    container.left < target.left + target.width &&
    container.left + container.width > target.left &&
    container.top < target.top + target.height &&
    container.top + container.height > target.top
  );
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function replacerForPageObject(key: string, value: any) {
  if (value && value.constructor?.name === 'Page') {
    return '[Page object]';
  }
  if (value && value.constructor?.name === 'Browser') {
    return '[Browser object]';
  }
  return value;
}

export function stringifyDumpData(data: any, indents?: number) {
  return JSON.stringify(data, replacerForPageObject, indents);
}

declare const __VERSION__: string;

export function getVersion() {
  return __VERSION__;
}

function debugLog(...message: any[]) {
  const debugMode = getAIConfig(MIDSCENE_DEBUG_MODE);
  if (debugMode) {
    console.log('[Midscene]', ...message);
  }
}

let lastReportedRepoUrl = '';
export function uploadTestInfoToServer({ testUrl }: { testUrl: string }) {
  let repoUrl = '';
  let userEmail = '';

  const extraConfig = getAIConfigInJson(MIDSCENE_OPENAI_INIT_CONFIG_JSON);
  const serverUrl = extraConfig?.REPORT_SERVER_URL;

  try {
    repoUrl = execSync('git config --get remote.origin.url').toString().trim();
    userEmail = execSync('git config --get user.email').toString().trim();
  } catch (error) {
    debugLog('Failed to get git info:', error);
  }

  // Only upload test info if:
  // 1. Server URL is configured AND
  // 2. Either:
  //    - We have a repo URL that's different from last reported one (to avoid duplicate reports)
  //    - OR we don't have a repo URL but have a test URL (for non-git environments)
  if (
    serverUrl &&
    ((repoUrl && repoUrl !== lastReportedRepoUrl) || (!repoUrl && testUrl))
  ) {
    debugLog('Uploading test info to server', {
      serverUrl,
      repoUrl,
      testUrl,
      userEmail,
    });

    fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo_url: repoUrl,
        test_url: testUrl,
        user_email: userEmail,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        debugLog('Successfully uploaded test info to server:', data);
      })
      .catch((error) =>
        debugLog('Failed to upload test info to server:', error),
      );
    lastReportedRepoUrl = repoUrl;
  }
}
