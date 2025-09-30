import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { TUserPrompt } from '@/ai-model';
import type { ElementCacheFeature } from '@/types';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
  globalConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';
import { generateHashId } from '@midscene/shared/utils';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';
import yaml from 'js-yaml';
import semver from 'semver';
import { getMidsceneVersion } from './utils';

const DEFAULT_CACHE_MAX_FILENAME_LENGTH = 200;

export const debug = getDebug('cache');

export interface PlanningCache {
  type: 'plan';
  prompt: string;
  yamlWorkflow: string;
}

export interface LocateCache {
  type: 'locate';
  prompt: TUserPrompt;
  cache?: ElementCacheFeature;
  /** @deprecated kept for backward compatibility */
  xpaths?: string[];
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
export const cacheFileExt = '.cache.yaml';

export class TaskCache {
  cacheId: string;

  cacheFilePath?: string;

  cache: CacheFileContent;

  isCacheResultUsed: boolean; // a flag to indicate if the cache result should be used
  cacheOriginalLength: number;

  readOnlyMode: boolean; // a flag to indicate if the cache is in read-only mode

  private matchedCacheIndices: Set<string> = new Set(); // Track matched records

  constructor(
    cacheId: string,
    isCacheResultUsed: boolean,
    cacheFilePath?: string,
    readOnlyMode = false,
  ) {
    assert(cacheId, 'cacheId is required');
    let safeCacheId = replaceIllegalPathCharsAndSpace(cacheId);
    const cacheMaxFilenameLength =
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ) || DEFAULT_CACHE_MAX_FILENAME_LENGTH;
    if (Buffer.byteLength(safeCacheId, 'utf8') > cacheMaxFilenameLength) {
      const prefix = safeCacheId.slice(0, 32);
      const hash = generateHashId(undefined, safeCacheId);
      safeCacheId = `${prefix}-${hash}`;
    }
    this.cacheId = safeCacheId;

    this.cacheFilePath =
      ifInBrowser || ifInWorker
        ? undefined
        : cacheFilePath ||
          join(getMidsceneRunSubDir('cache'), `${this.cacheId}${cacheFileExt}`);
    this.isCacheResultUsed = isCacheResultUsed;
    this.readOnlyMode = readOnlyMode;

    let cacheContent;
    if (this.cacheFilePath) {
      cacheContent = this.loadCacheFromFile();
    }
    if (!cacheContent) {
      cacheContent = {
        midsceneVersion: getMidsceneVersion(),
        cacheId: this.cacheId,
        caches: [],
      };
    }
    this.cache = cacheContent;
    this.cacheOriginalLength = this.cache.caches.length;
  }

  matchCache(
    prompt: TUserPrompt,
    type: 'plan' | 'locate',
  ): MatchCacheResult<PlanningCache | LocateCache> | undefined {
    // Find the first unused matching cache
    for (let i = 0; i < this.cacheOriginalLength; i++) {
      const item = this.cache.caches[i];
      const promptStr =
        typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      const key = `${type}:${promptStr}:${i}`;
      if (
        item.type === type &&
        isDeepStrictEqual(item.prompt, prompt) &&
        !this.matchedCacheIndices.has(key)
      ) {
        if (item.type === 'locate') {
          const locateItem = item as LocateCache;
          if (!locateItem.cache && Array.isArray(locateItem.xpaths)) {
            locateItem.cache = { xpaths: locateItem.xpaths };
          }
          if ('xpaths' in locateItem) {
            locateItem.xpaths = undefined;
          }
        }
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

            if (this.readOnlyMode) {
              debug(
                'read-only mode, cache updated in memory but not flushed to file',
              );
              return;
            }

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

  matchLocateCache(
    prompt: TUserPrompt,
  ): MatchCacheResult<LocateCache> | undefined {
    return this.matchCache(prompt, 'locate') as
      | MatchCacheResult<LocateCache>
      | undefined;
  }

  appendCache(cache: PlanningCache | LocateCache) {
    debug('will append cache', cache);
    this.cache.caches.push(cache);

    if (this.readOnlyMode) {
      debug('read-only mode, cache appended to memory but not flushed to file');
      return;
    }

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

      const version = getMidsceneVersion();
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
      jsonData.midsceneVersion = getMidsceneVersion(); // update the version
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
    const version = getMidsceneVersion();
    if (!version) {
      debug('no midscene version info, will not write cache to file');
      return;
    }

    if (!this.cacheFilePath) {
      debug('no cache file path, will not write cache to file');
      return;
    }

    try {
      const dir = dirname(this.cacheFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        debug('created cache directory: %s', dir);
      }

      // Sort caches to ensure plan entries come before locate entries for better readability
      const sortedCaches = [...this.cache.caches].sort((a, b) => {
        if (a.type === 'plan' && b.type === 'locate') return -1;
        if (a.type === 'locate' && b.type === 'plan') return 1;
        return 0;
      });

      const cacheToWrite = {
        ...this.cache,
        caches: sortedCaches,
      };

      const yamlData = yaml.dump(cacheToWrite);
      writeFileSync(this.cacheFilePath, yamlData);
      debug('cache flushed to file: %s', this.cacheFilePath);
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
          const locateCache = cache as LocateCache;
          locateCache.cache = newRecord.cache;
          if ('xpaths' in locateCache) {
            locateCache.xpaths = undefined;
          }
        });
      }
    } else {
      this.appendCache(newRecord);
    }
  }
}
