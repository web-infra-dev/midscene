import { join } from 'path';
import fs from 'fs';
import { writeDumpFile, getDumpDirPath } from '@midscene/core/utils';
import { AiTaskCache } from '@/common/task-cache';

export function writeTestCache(taskFile: string, taskTitle: string, taskCacheJson: AiTaskCache) {
  writeDumpFile({
    fileName: `${taskFile}(${taskTitle})`,
    fileExt: 'json',
    fileContent: JSON.stringify(
      {
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
  if (process.env.MIDSCENE_CACHE === 'true' && fs.existsSync(cacheFile)) {
    try {
      const data = fs.readFileSync(cacheFile, 'utf8');
      const jsonData = JSON.parse(data);
      return jsonData as AiTaskCache;
    } catch (err) {
      return undefined;
    }
  }
  return undefined;
}
