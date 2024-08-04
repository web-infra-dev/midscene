import fs from 'node:fs';
import path, { join } from 'node:path';
import type { AiTaskCache } from '@/common/task-cache';
import { findNearestPackageJson } from '@/common/utils';
import { getDumpDirPath, writeDumpFile } from '@midscene/core/utils';

export function writeTestCache(
  taskFile: string,
  taskTitle: string,
  taskCacheJson: AiTaskCache,
) {
  const packageJson = getPkgInfo();
  writeDumpFile({
    fileName: `${taskFile}(${taskTitle})`,
    fileExt: 'json',
    fileContent: JSON.stringify(
      {
        pkgName: packageJson.name,
        pkgVersion: packageJson.version,
        taskFile,
        taskTitle,
        ...taskCacheJson,
      },
      null,
      2,
    ),
    type: 'cache',
  });
}

export function readTestCache(taskFile: string, taskTitle: string) {
  const cacheFile = join(
    getDumpDirPath('cache'),
    `${taskFile}(${taskTitle}).json`,
  );
  const pkgInfo = getPkgInfo();
  if (process.env.MIDSCENE_CACHE === 'true' && fs.existsSync(cacheFile)) {
    try {
      const data = fs.readFileSync(cacheFile, 'utf8');
      const jsonData = JSON.parse(data);
      if (
        jsonData.pkgName !== pkgInfo.name ||
        jsonData.pkgVersion !== pkgInfo.version
      ) {
        return undefined;
      }
      return jsonData as AiTaskCache;
    } catch (err) {
      return undefined;
    }
  }
  return undefined;
}

function getPkgInfo(): { name: string; version: string } {
  const packageJsonDir = findNearestPackageJson(__dirname);
  if (!packageJsonDir) {
    console.error('Cannot find package.json directory: ', __dirname);
    return {
      name: '@midscene/web',
      version: '0.0.0',
    };
  }

  const packageJsonPath = path.join(packageJsonDir, 'package.json');
  const data = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(data);

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}
