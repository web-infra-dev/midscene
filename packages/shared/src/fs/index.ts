import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface PkgInfo {
  name: string;
  version: string;
  dir: string;
}

const pkgCacheMap: Record<string, PkgInfo> = {};
const ifInBrowser = typeof window !== 'undefined';
export function getRunningPkgInfo(dir?: string): PkgInfo | null {
  if (ifInBrowser) {
    return null;
  }
  const dirToCheck = dir || process.cwd();
  if (pkgCacheMap[dirToCheck]) {
    return pkgCacheMap[dirToCheck];
  }

  const pkgDir = findNearestPackageJson(dirToCheck);
  const pkgJsonFile = pkgDir ? join(pkgDir, 'package.json') : null;

  if (pkgDir && pkgJsonFile) {
    const { name, version } = JSON.parse(readFileSync(pkgJsonFile, 'utf-8'));
    pkgCacheMap[dirToCheck] = { name, version, dir: pkgDir };
    return pkgCacheMap[dirToCheck];
  }
  return {
    name: 'midscene-unknown-package-name',
    version: '0.0.0',
    dir: dirToCheck,
  };
}

/**
 * Find the nearest package.json file recursively
 * @param {string} dir - Home directory
 * @returns {string|null} - The most recent package.json file path or null
 */
export function findNearestPackageJson(dir: string): string | null {
  const packageJsonPath = join(dir, 'package.json');
  if (existsSync(packageJsonPath)) {
    return dir;
  }

  const parentDir = dirname(dir);

  // Return null if the root directory has been reached
  if (parentDir === dir) {
    return null;
  }

  return findNearestPackageJson(parentDir);
}
