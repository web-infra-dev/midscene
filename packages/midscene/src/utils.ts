import { tmpdir } from 'os';
import { basename, join } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import assert from 'assert';
import { Rect } from './types';

interface PkgInfo {
  name: string;
  version: string;
}

let pkg: PkgInfo | undefined;
export function getPkgInfo(): PkgInfo {
  if (pkg) {
    return pkg;
  }

  let pkgJsonFile = '';
  if (existsSync(join(__dirname, '../package.json'))) {
    pkgJsonFile = join(__dirname, '../package.json');
  } else if (existsSync(join(__dirname, '../../../package.json'))) {
    pkgJsonFile = join(__dirname, '../../../package.json');
  }

  if (pkgJsonFile) {
    const { name, version } = JSON.parse(readFileSync(pkgJsonFile, 'utf-8'));
    pkg = { name, version };
    return pkg;
  } else {
    return {
      name: 'midscene-unknown-page-name',
      version: '0.0.0',
    };
  }
}

let logDir = join(process.cwd(), './midscene_run/');
let logEnvReady = false;
export const insightDumpFileExt = 'insight-dump.json';
export const actionDumpFileExt = 'action-dump.json';
export const groupedActionDumpFileExt = 'all-logs.json';

export function getDumpDir() {
  return logDir;
}
export function setDumpDir(dir: string) {
  logDir = dir;
}

export function writeDumpFile(fileName: string, fileExt: string, fileContent: string) {
  // Ensure directory exists
  if (!logEnvReady) {
    assert(logDir, 'logDir should be set before writing dump file');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // gitIgnore in the parent directory
    const gitIgnorePath = join(logDir, '../.gitignore');
    let gitIgnoreContent = '';
    if (existsSync(gitIgnorePath)) {
      gitIgnoreContent = readFileSync(gitIgnorePath, 'utf-8');
    }

    // ignore the log folder
    const logDirName = basename(logDir);
    if (!gitIgnoreContent.includes(`${logDirName}/`)) {
      writeFileSync(
        gitIgnorePath,
        `${gitIgnoreContent}\n# MidScene.js dump files\n${logDirName}/\n`,
        'utf-8',
      );
    }
    logEnvReady = true;
  }

  const filePath = join(getDumpDir(), `${fileName}.${fileExt}`);
  writeFileSync(filePath, fileContent);
  copyFileSync(filePath, join(getDumpDir(), `latest.${fileExt}`));

  return filePath;
}

export function getTmpDir() {
  const path = join(tmpdir(), getPkgInfo().name);
  mkdirSync(path, { recursive: true });
  return path;
}

export function getTmpFile(fileExt: string) {
  const filename = `${randomUUID()}.${fileExt}`;
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
