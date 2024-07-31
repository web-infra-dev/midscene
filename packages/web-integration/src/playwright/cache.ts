import { join } from 'path';
import fs from 'fs';
import { writeDumpFile, getDumpDirPath, getPkgInfo } from '@midscene/core/utils';
import { AiTaskCache } from '@/common/task-cache';

export function writeTestCache(taskFile: string, taskTitle: string, taskCacheJson: AiTaskCache) {
  const pkgInfo = getPkgInfo();
  writeDumpFile({
    fileName: `${taskFile}(${taskTitle})`,
    fileExt: 'json',
    fileContent: JSON.stringify(
      {
        pkgName: pkgInfo.name,
        pkgVersion: pkgInfo.version,
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
  const cacheFile = join(getDumpDirPath('cache'), `${taskFile}(${taskTitle}).json`);
  const pkgInfo = getPkgInfo();
  if (process.env.MIDSCENE_CACHE === 'true' && fs.existsSync(cacheFile)) {
    try {
      const data = fs.readFileSync(cacheFile, 'utf8');
      const jsonData = JSON.parse(data);
      if (jsonData.pkgName !== pkgInfo.name || jsonData.pkgVersion !== pkgInfo.version) {
        return undefined;
      }
      return jsonData as AiTaskCache;
    } catch (err) {
      return undefined;
    }
  }
  return undefined;
}
