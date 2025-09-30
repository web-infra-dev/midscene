import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  defaultRunDirName,
  getMidsceneRunSubDir,
} from '@midscene/shared/common';
import { MIDSCENE_DEBUG_MODE } from '@midscene/shared/env';
import { getRunningPkgInfo } from '@midscene/shared/node';
import { assert, logMsg } from '@midscene/shared/utils';
import {
  escapeScriptTag,
  ifInBrowser,
  ifInWorker,
  uuid,
} from '@midscene/shared/utils';
import type { Cache, Rect, ReportDumpWithAttributes } from './types';

let logEnvReady = false;

export { appendFileSync } from 'fs'

export const groupedActionDumpFileExt = 'web-dump.json';

/**
 * Process cache configuration, auto-generating ID if cache is enabled but no ID is provided.
 *
 * @param cache - The original cache configuration
 * @param fallbackId - The fallback ID to use when cache is enabled but no ID is specified
 * @returns Processed cache configuration
 */
export function processCacheConfig(
  cache: Cache | undefined,
  fallbackId: string,
): Cache | undefined {
  if (!cache) return undefined;

  // Use type assertion to handle TypeScript type checking issue
  const cacheValue = cache as Cache;

  if (cacheValue === false) return false;

  if (cacheValue === true) {
    // Auto-generate ID using fallback
    return { id: fallbackId };
  }

  if (typeof cacheValue === 'object' && cacheValue !== null) {
    if (!cacheValue.id) {
      // Auto-generate ID using fallback when missing
      return { ...cacheValue, id: fallbackId };
    }
    return cacheValue;
  }

  return undefined;
}

const reportInitializedMap = new Map<string, boolean>();

declare const __DEV_REPORT_PATH__: string;

function getReportTpl() {
  if (typeof __DEV_REPORT_PATH__ === 'string' && __DEV_REPORT_PATH__) {
    return fs.readFileSync(__DEV_REPORT_PATH__, 'utf-8');
  }
  const reportTpl = 'REPLACE_ME_WITH_REPORT_HTML';

  return reportTpl;
}

/**
 * high performance, insert script before </html> in HTML file
 * only truncate and append, no temporary file
 */
export function insertScriptBeforeClosingHtml(
  filePath: string,
  scriptContent: string,
): void {
  const htmlEndTag = '</html>';
  const stat = fs.statSync(filePath);

  const readSize = Math.min(stat.size, 4096);
  const start = Math.max(0, stat.size - readSize);
  const buffer = Buffer.alloc(stat.size - start);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, buffer.length, start);
  fs.closeSync(fd);

  const tailStr = buffer.toString('utf8');
  const htmlEndIdx = tailStr.lastIndexOf(htmlEndTag);
  if (htmlEndIdx === -1) {
    throw new Error(`No </html> found in file：${filePath}`);
  }

  // calculate the correct byte position: char position to byte position
  const beforeHtmlInTail = tailStr.slice(0, htmlEndIdx);
  const htmlEndPos = start + Buffer.byteLength(beforeHtmlInTail, 'utf8');

  // truncate to </html> before
  fs.truncateSync(filePath, htmlEndPos);
  // append script and </html>
  fs.appendFileSync(filePath, `${scriptContent}\n${htmlEndTag}\n`);
}

export function reportHTMLContent(
  dumpData: string | ReportDumpWithAttributes,
  reportPath?: string,
  appendReport?: boolean,
): string {
  const tpl = getReportTpl();

  if (!tpl) {
    console.warn('reportTpl is not set, will not write report');
    return '';
  }

  // if reportPath is set, it means we are in write to file mode
  const writeToFile = reportPath && !ifInBrowser;
  let dumpContent = '';

  if (typeof dumpData === 'string') {
    // do not use template string here, will cause bundle error
    dumpContent =
      // biome-ignore lint/style/useTemplate: <explanation>
      '<script type="midscene_web_dump" type="application/json">\n' +
      escapeScriptTag(dumpData) +
      '\n</script>';
  } else {
    const { dumpString, attributes } = dumpData;
    const attributesArr = Object.keys(attributes || {}).map((key) => {
      return `${key}="${encodeURIComponent(attributes![key])}"`;
    });

    dumpContent =
      // do not use template string here, will cause bundle error
      // biome-ignore lint/style/useTemplate: <explanation>
      '<script type="midscene_web_dump" type="application/json" ' +
      attributesArr.join(' ') +
      '>\n' +
      escapeScriptTag(dumpString) +
      '\n</script>';
  }

  if (writeToFile) {
    if (!appendReport) {
      writeFileSync(reportPath!, tpl + dumpContent, { flag: 'w' });
      return reportPath!;
    }

    if (!reportInitializedMap.get(reportPath!)) {
      writeFileSync(reportPath!, tpl, { flag: 'w' });
      reportInitializedMap.set(reportPath!, true);
    }

    insertScriptBeforeClosingHtml(reportPath!, dumpContent);
    return reportPath!;
  }

  return tpl + dumpContent;
}

export function getHtmlScripts(
  dumpData: ReportDumpWithAttributes,
): string {

  // if reportPath is set, it means we are in write to file mode
  let dumpContent = '';

  if (typeof dumpData === 'string') {
    // do not use template string here, will cause bundle error
    dumpContent =
      // biome-ignore lint/style/useTemplate: <explanation>
      '<script type="midscene_web_dump" type="application/json">\n' +
      escapeScriptTag(dumpData) +
      '\n</script>';
  } else {
    const { dumpString, attributes } = dumpData;
    const attributesArr = Object.keys(attributes || {}).map((key) => {
      return `${key}="${encodeURIComponent(attributes![key])}"`;
    });

    dumpContent =
      // do not use template string here, will cause bundle error
      // biome-ignore lint/style/useTemplate: <explanation>
      '<script type="midscene_web_dump" type="application/json" ' +
      attributesArr.join(' ') +
      '>\n' +
      escapeScriptTag(dumpString) +
      '\n</script>';
  }

  return dumpContent;
}

export function writeDumpReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes,
  appendReport?: boolean,
): string | null {
  if (ifInBrowser || ifInWorker) {
    console.log('will not write report in browser');
    return null;
  }

  const reportPath = path.join(
    getMidsceneRunSubDir('report'),
    `${fileName}.html`,
  );

  reportHTMLContent(dumpData, reportPath, appendReport);

  if (process.env.MIDSCENE_DEBUG_LOG_JSON) {
    const jsonPath = `${reportPath}.json`;
    let data;

    if (typeof dumpData === 'string') {
      data = JSON.parse(dumpData) as ReportDumpWithAttributes;
    } else {
      data = dumpData;
    }

    writeFileSync(jsonPath, JSON.stringify(data, null, 2), {
      flag: appendReport ? 'a' : 'w',
    });

    logMsg(`Midscene - dump file written: ${jsonPath}`);
  }

  return reportPath;
}

export function writeLogFile(opts: {
  fileName: string;
  fileExt: string;
  fileContent: string | ReportDumpWithAttributes;
  type: 'dump' | 'cache' | 'report' | 'tmp';
  generateReport?: boolean;
  appendReport?: boolean;
}) {
  if (ifInBrowser || ifInWorker) {
    return '/mock/report.html';
  }
  const { fileName, fileExt, fileContent, type = 'dump' } = opts;
  const targetDir = getMidsceneRunSubDir(type);
  // Ensure directory exists
  if (!logEnvReady) {
    assert(targetDir, 'logDir should be set before writing dump file');

    // gitIgnore in the parent directory
    const gitIgnorePath = path.join(targetDir, '../../.gitignore');
    const gitPath = path.join(targetDir, '../../.git');
    let gitIgnoreContent = '';

    if (existsSync(gitPath)) {
      // if the git path exists, we need to add the log folder to the git ignore file
      if (existsSync(gitIgnorePath)) {
        gitIgnoreContent = readFileSync(gitIgnorePath, 'utf-8');
      }

      // ignore the log folder
      if (!gitIgnoreContent.includes(`${defaultRunDirName}/`)) {
        writeFileSync(
          gitIgnorePath,
          `${gitIgnoreContent}\n# Midscene.js dump files\n${defaultRunDirName}/dump\n${defaultRunDirName}/report\n${defaultRunDirName}/tmp\n${defaultRunDirName}/log\n`,
          'utf-8',
        );
      }
    }

    logEnvReady = true;
  }

  const filePath = path.join(targetDir, `${fileName}.${fileExt}`);

  if (type !== 'dump') {
    // do not write dump file any more
    writeFileSync(filePath, JSON.stringify(fileContent));
  }

  if (opts?.generateReport) {
    return writeDumpReport(fileName, fileContent, opts.appendReport);
  }

  return filePath;
}

export function getTmpDir(): string | null {
  try {
    const runningPkgInfo = getRunningPkgInfo();
    if (!runningPkgInfo) {
      return null;
    }
    const { name } = runningPkgInfo;
    const tmpPath = path.join(tmpdir(), name);
    mkdirSync(tmpPath, { recursive: true });
    return tmpPath;
  } catch (e) {
    return null;
  }
}

export function getTmpFile(fileExtWithoutDot: string): string | null {
  if (ifInBrowser || ifInWorker) {
    return null;
  }
  const tmpDir = getTmpDir();
  const filename = `${uuid()}.${fileExtWithoutDot}`;
  return path.join(tmpDir!, filename);
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
  // always read from process.env, and cannot be override by modelConfig, overrideAIConfig, etc.
  // also avoid circular dependency
  const debugMode = process.env[MIDSCENE_DEBUG_MODE];
  if (debugMode) {
    console.log('[Midscene]', ...message);
  }
}

let lastReportedRepoUrl = '';
export function uploadTestInfoToServer({
  testUrl,
  serverUrl,
}: { testUrl: string; serverUrl?: string }) {
  let repoUrl = '';
  let userEmail = '';

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
