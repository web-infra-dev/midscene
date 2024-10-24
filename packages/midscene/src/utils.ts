import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { getRunningPkgInfo } from '@midscene/shared/fs';
import { ifInBrowser, uuid } from '@midscene/shared/utils';
import { version } from '../package.json';
import type { Rect, ReportDumpWithAttributes } from './types';

let logDir = join(process.cwd(), './midscene_run/');
let logEnvReady = false;
export const insightDumpFileExt = 'insight-dump.json';
export const groupedActionDumpFileExt = 'web-dump.json';

export function getLogDir() {
  return logDir;
}

export function setLogDir(dir: string) {
  logDir = dir;
}

export function getLogDirByType(type: 'dump' | 'cache' | 'report') {
  const dir = join(getLogDir(), type);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
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

  const { dir } = midscenePkgInfo;
  const reportTplPath = join(dir, './report/index.html');
  existsSync(reportTplPath) ||
    assert(false, `report template not found: ${reportTplPath}`);
  const reportPath = join(getLogDirByType('report'), `${fileName}.html`);
  const tpl = readFileSync(reportTplPath, 'utf-8');
  let reportContent: string;
  if (
    (Array.isArray(dumpData) && dumpData.length === 0) ||
    typeof dumpData === 'undefined'
  ) {
    reportContent = tpl.replace(
      /\s+{{dump}}\s+/,
      '<script type="midscene_web_dump" type="application/json"></script>',
    );
  } else if (typeof dumpData === 'string') {
    reportContent = tpl.replace(
      /\s+{{dump}}\s+/,
      `<script type="midscene_web_dump" type="application/json">${dumpData}</script>`,
    );
  } else {
    const dumps = dumpData.map(({ dumpString, attributes }) => {
      const attributesArr = Object.keys(attributes || {}).map((key) => {
        return `${key}="${encodeURIComponent(attributes![key])}"`;
      });
      return `<script type="midscene_web_dump" type="application/json" ${attributesArr.join(' ')}>\n${dumpString}\n</script>`;
    });
    reportContent = tpl.replace(/\s+{{dump}}\s+/, dumps.join('\n'));
  }
  writeFileSync(reportPath, reportContent);

  return reportPath;
}

export function writeLogFile(opts: {
  fileName: string;
  fileExt: string;
  fileContent: string;
  type: 'dump' | 'cache' | 'report';
  generateReport?: boolean;
}) {
  if (ifInBrowser) {
    console.log('will not generate report in browser');
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
        `${gitIgnoreContent}\n# Midscene.js dump files\n${logDirName}/report\n${logDirName}/dump\n`,
        'utf-8',
      );
    }
    logEnvReady = true;
  }

  const filePath = join(targetDir, `${fileName}.${fileExt}`);

  const outputResourceDir = dirname(filePath);
  if (!existsSync(outputResourceDir)) {
    mkdirSync(outputResourceDir, { recursive: true });
  }

  writeFileSync(filePath, fileContent);

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

export function getVersion() {
  return version;
}
