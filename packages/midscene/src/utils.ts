import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Rect } from './types';

interface PkgInfo {
  name: string;
  version: string;
  dir: string;
}

let pkg: PkgInfo | undefined;
export function getPkgInfo(): PkgInfo {
  if (pkg) {
    return pkg;
  }

  let pkgJsonFile = '';
  let pkgDir = '';
  if (existsSync(join(__dirname, '../package.json'))) {
    pkgJsonFile = join(__dirname, '../package.json');
    pkgDir = join(__dirname, '../');
  } else if (existsSync(join(__dirname, '../../package.json'))) {
    pkgJsonFile = join(__dirname, '../../package.json');
    pkgDir = join(__dirname, '../../');
  } else if (existsSync(join(__dirname, '../../../package.json'))) {
    pkgJsonFile = join(__dirname, '../../../package.json');
    pkgDir = join(__dirname, '../../../');
  }

  if (pkgJsonFile) {
    const { name, version } = JSON.parse(readFileSync(pkgJsonFile, 'utf-8'));
    pkg = { name, version, dir: pkgDir };
    return pkg;
  }
  return {
    name: 'midscene-unknown-page-name',
    version: '0.0.0',
    dir: pkgDir,
  };
}

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

export function writeDumpReport(fileName: string, data: string) {
  const { dir } = getPkgInfo();
  const reportTplPath = join(dir, './report/index.html');
  existsSync(reportTplPath) ||
    assert(false, `report template not found: ${reportTplPath}`);
  const reportPath = join(getLogDirByType('report'), `${fileName}.html`);
  const reportContent = readFileSync(reportTplPath, 'utf-8').replace(
    '{{dump}}',
    `<script type="midscene_web_dump" type="application/json">${data}</script>`,
  );
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
  writeFileSync(filePath, fileContent);

  if (opts?.generateReport) {
    return writeDumpReport(fileName, fileContent);
  }

  return filePath;
}

export function getTmpDir() {
  const path = join(tmpdir(), getPkgInfo().name);
  mkdirSync(path, { recursive: true });
  return path;
}

export function getTmpFile(fileExtWithoutDot: string) {
  const filename = `${randomUUID()}.${fileExtWithoutDot}`;
  return join(getTmpDir(), filename);
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

export const commonScreenshotParam = { type: 'jpeg', quality: 75 } as any;

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
