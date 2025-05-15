import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';
import yaml from 'js-yaml';
import semver from 'semver';
import { version } from '../../package.json';
import { replaceIllegalPathCharsAndSpace } from './utils';

const debug = getDebug('cache');

export interface PlanningCache {
  type: 'plan';
  prompt: string;
  yamlWorkflow: string;
}

export interface LocateCache {
  type: 'locate';
  prompt: string;
  xpaths: string[];
}

export interface MatchCacheResult<T extends PlanningCache | LocateCache> {
  cacheContent: T;
  updateFn: (cb: (cache: T) => void) => void;
}

export type CacheFileContent = {
  midsceneVersion: string;
  cacheId: string;
  caches: Array<PlanningCache | LocateCache>;
};

const lowestSupportedMidsceneVersion = '0.16.10';
const cacheFileExt = '.cache.yaml';

export class TaskCache {
  cacheId: string;

  cacheFilePath?: string;

  cache: CacheFileContent;

  isCacheResultUsed: boolean; // a flag to indicate if the cache result should be used

  private matchedCacheIndices: Set<string> = new Set(); // Track matched records

  constructor(
    cacheId: string,
    isCacheResultUsed: boolean,
    cacheFilePath?: string,
  ) {
    assert(cacheId, 'cacheId is required');
    this.cacheId = replaceIllegalPathCharsAndSpace(cacheId);

    this.cacheFilePath = ifInBrowser
      ? undefined
      : cacheFilePath ||
        join(getMidsceneRunSubDir('cache'), `${this.cacheId}${cacheFileExt}`);

    this.isCacheResultUsed = isCacheResultUsed;

    let cacheContent;
    if (this.cacheFilePath) {
      cacheContent = this.loadCacheFromFile();
    }
    if (!cacheContent) {
      cacheContent = {
        midsceneVersion: version,
        cacheId: this.cacheId,
        caches: [],
      };
    }
    this.cache = cacheContent;
  }

  matchCache(
    prompt: string,
    type: 'plan' | 'locate',
  ): MatchCacheResult<PlanningCache | LocateCache> | undefined {
    // Find the first unused matching cache
    for (let i = 0; i < this.cache.caches.length; i++) {
      const item = this.cache.caches[i];
      const key = `${type}:${prompt}:${i}`;
      if (
        item.type === type &&
        item.prompt === prompt &&
        !this.matchedCacheIndices.has(key)
      ) {
        this.matchedCacheIndices.add(key);
        debug(
          'cache found and marked as used, type: %s, prompt: %s, index: %d',
          type,
          prompt,
          i,
        );
        return {
          cacheContent: item,
          updateFn: (cb: (cache: PlanningCache | LocateCache) => void) => {
            debug(
              'will call updateFn to update cache, type: %s, prompt: %s, index: %d',
              type,
              prompt,
              i,
            );
            cb(item);
            debug(
              'cache updated, will flush to file, type: %s, prompt: %s, index: %d',
              type,
              prompt,
              i,
            );
            this.flushCacheToFile();
          },
        };
      }
    }
    debug('no unused cache found, type: %s, prompt: %s', type, prompt);
    return undefined;
  }

  matchPlanCache(prompt: string): MatchCacheResult<PlanningCache> | undefined {
    return this.matchCache(prompt, 'plan') as
      | MatchCacheResult<PlanningCache>
      | undefined;
  }

  matchLocateCache(prompt: string): MatchCacheResult<LocateCache> | undefined {
    return this.matchCache(prompt, 'locate') as
      | MatchCacheResult<LocateCache>
      | undefined;
  }

  appendCache(cache: PlanningCache | LocateCache) {
    debug('will append cache', cache);
    this.cache.caches.push(cache);
    this.flushCacheToFile();
  }

  loadCacheFromFile() {
    const cacheFile = this.cacheFilePath;
    assert(cacheFile, 'cache file path is required');

    if (!existsSync(cacheFile)) {
      debug('no cache file found, path: %s', cacheFile);
      return undefined;
    }

    // detect old cache file
    const jsonTypeCacheFile = cacheFile.replace(cacheFileExt, '.json');
    if (existsSync(jsonTypeCacheFile) && this.isCacheResultUsed) {
      console.warn(
        `An outdated cache file from an earlier version of Midscene has been detected. Since version 0.17, we have implemented an improved caching strategy. Please delete the old file located at: ${jsonTypeCacheFile}.`,
      );
      return undefined;
    }

    try {
      const data = readFileSync(cacheFile, 'utf8');
      const jsonData = yaml.load(data) as CacheFileContent;

      if (!version) {
        debug('no midscene version info, will not read cache from file');
        return undefined;
      }

      if (
        semver.lt(jsonData.midsceneVersion, lowestSupportedMidsceneVersion) &&
        !jsonData.midsceneVersion.includes('beta') // for internal test
      ) {
        console.warn(
          `You are using an old version of Midscene cache file, and we cannot match any info from it. Starting from Midscene v0.17, we changed our strategy to use xpath for cache info, providing better performance.\nPlease delete the existing cache and rebuild it. Sorry for the inconvenience.\ncache file: ${cacheFile}`,
        );
        return undefined;
      }

      debug(
        'cache loaded from file, path: %s, cache version: %s, record length: %s',
        cacheFile,
        jsonData.midsceneVersion,
        jsonData.caches.length,
      );
      jsonData.midsceneVersion = version; // update the version
      return jsonData;
    } catch (err) {
      debug(
        'cache file exists but load failed, path: %s, error: %s',
        cacheFile,
        err,
      );
      return undefined;
    }
  }

  flushCacheToFile() {
    if (!version) {
      debug('no midscene version info, will not write cache to file');
      return;
    }

    if (!this.cacheFilePath) {
      debug('no cache file path, will not write cache to file');
      return;
    }

    try {
      const yamlData = yaml.dump(this.cache);
      writeFileSync(this.cacheFilePath, yamlData);
    } catch (err) {
      debug(
        'write cache to file failed, path: %s, error: %s',
        this.cacheFilePath,
        err,
      );
    }
  }

  updateOrAppendCacheRecord(
    newRecord: PlanningCache | LocateCache,
    cachedRecord?: MatchCacheResult<PlanningCache | LocateCache>,
  ) {
    if (cachedRecord) {
      // update existing record
      if (newRecord.type === 'plan') {
        cachedRecord.updateFn((cache) => {
          (cache as PlanningCache).yamlWorkflow = newRecord.yamlWorkflow;
        });
      } else {
        cachedRecord.updateFn((cache) => {
          (cache as LocateCache).xpaths = newRecord.xpaths;
        });
      }
    } else {
      this.appendCache(newRecord);
    }
  }
}
