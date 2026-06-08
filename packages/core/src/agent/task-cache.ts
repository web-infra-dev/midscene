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
const warn = getDebug('cache', { console: true });

export interface PlanningCache {
  type: 'plan';
  prompt: TUserPrompt;
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
  cacheUsable: boolean;
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

  writeOnlyMode: boolean; // a flag to indicate if the cache is in write-only mode

  private matchedCacheIndices: Set<string> = new Set(); // Track matched records

  // Per `${type}:${promptStr}`, the in-memory indices of cache entries consumed
  // by matchCache this run (most recent last). markLocateCacheStale() drains
  // from here into staleCacheIndices when the consumed entry's element is
  // rejected by a failed action.
  private consumedCacheIndices: Map<string, number[]> = new Map();

  // Per `${type}:${promptStr}`, indices of consumed entries whose backing
  // element was rejected (the action using it failed and the run replanned).
  // Only these are replaced in place on the re-locate; every other write
  // appends, so legitimately repeated prompts keep one entry per occurrence.
  private staleCacheIndices: Map<string, number[]> = new Map();

  constructor(
    cacheId: string,
    isCacheResultUsed: boolean,
    cacheFilePath?: string,
    options: {
      readOnly?: boolean;
      writeOnly?: boolean;
      cacheDir?: string;
    } = {},
  ) {
    assert(cacheId, 'cacheId is required');
    if (
      options.cacheDir !== undefined &&
      (typeof options.cacheDir !== 'string' || !options.cacheDir.trim())
    ) {
      throw new Error('cacheDir must be a non-empty string when provided');
    }
    const cacheDir = options.cacheDir?.trim();
    let safeCacheId = replaceIllegalPathCharsAndSpace(cacheId);
    const cacheMaxFilenameLength =
      globalConfigManager.getEnvConfigValueAsNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ) ?? DEFAULT_CACHE_MAX_FILENAME_LENGTH;
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
          join(
            cacheDir || getMidsceneRunSubDir('cache'),
            `${this.cacheId}${cacheFileExt}`,
          );
    const readOnlyMode = Boolean(options?.readOnly);
    const writeOnlyMode = Boolean(options?.writeOnly);

    if (readOnlyMode && writeOnlyMode) {
      throw new Error('TaskCache cannot be both read-only and write-only');
    }

    this.isCacheResultUsed = writeOnlyMode ? false : isCacheResultUsed;
    this.readOnlyMode = readOnlyMode;
    this.writeOnlyMode = writeOnlyMode;

    let cacheContent;
    if (this.cacheFilePath && !this.writeOnlyMode) {
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
    this.cacheOriginalLength = this.isCacheResultUsed
      ? this.cache.caches.length
      : 0;
  }

  matchCache(
    prompt: TUserPrompt,
    type: 'plan' | 'locate',
  ): MatchCacheResult<PlanningCache | LocateCache> | undefined {
    if (!this.isCacheResultUsed) {
      return undefined;
    }
    // Find the first unused matching cache
    const promptStr = this.promptKey(prompt);
    for (let i = 0; i < this.cacheOriginalLength; i++) {
      const item = this.cache.caches[i];
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
        const consumeKey = `${type}:${promptStr}`;
        const consumed = this.consumedCacheIndices.get(consumeKey) ?? [];
        consumed.push(i);
        this.consumedCacheIndices.set(consumeKey, consumed);
        debug(
          'cache found and marked as used, type: %s, prompt: %s, index: %d',
          type,
          prompt,
          i,
        );
        return {
          cacheContent: item,
          cacheUsable: true,
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

  matchPlanCache(
    prompt: TUserPrompt,
  ): MatchCacheResult<PlanningCache> | undefined {
    const result = this.matchCache(prompt, 'plan') as
      | MatchCacheResult<PlanningCache>
      | undefined;
    if (!result) return undefined;
    // Guard against stale cache files written before the write-side fix
    const yamlWorkflow = result.cacheContent.yamlWorkflow;
    if (!yamlWorkflow?.trim()) {
      debug(
        'plan cache matched but yamlWorkflow is empty, treat as cache miss',
      );
      return {
        ...result,
        cacheUsable: false,
      };
    }
    try {
      const parsed = yaml.load(yamlWorkflow) as any;
      const hasNonEmptyFlow = parsed?.tasks?.some(
        (task: any) => Array.isArray(task.flow) && task.flow.length > 0,
      );
      if (!hasNonEmptyFlow) {
        debug('plan cache matched but flow is empty, treat as cache miss');
        return {
          ...result,
          cacheUsable: false,
        };
      }
    } catch {
      debug(
        'plan cache matched but yamlWorkflow is invalid, treat as cache miss',
      );
      return {
        ...result,
        cacheUsable: false,
      };
    }
    return result;
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

  flushCacheToFile(options?: { cleanUnused?: boolean }) {
    const version = getMidsceneVersion();
    if (!version) {
      debug('no midscene version info, will not write cache to file');
      return;
    }

    if (!this.cacheFilePath) {
      debug('no cache file path, will not write cache to file');
      return;
    }

    // Clean unused caches if requested
    if (options?.cleanUnused) {
      // Skip cleaning in write-only mode or when cache is not used
      if (this.isCacheResultUsed) {
        const originalLength = this.cache.caches.length;

        // Collect indices of used caches
        const usedIndices = new Set<number>();
        for (const key of this.matchedCacheIndices) {
          // key format: "type:prompt:index"
          const parts = key.split(':');
          const index = Number.parseInt(parts[parts.length - 1], 10);
          if (!Number.isNaN(index)) {
            usedIndices.add(index);
          }
        }

        // Filter: keep used caches and newly added caches
        this.cache.caches = this.cache.caches.filter((_, index) => {
          const isUsed = usedIndices.has(index);
          const isNew = index >= this.cacheOriginalLength;
          return isUsed || isNew;
        });

        const removedCount = originalLength - this.cache.caches.length;
        if (removedCount > 0) {
          debug('cleaned %d unused cache record(s)', removedCount);
        } else {
          debug('no unused cache to clean');
        }
      } else {
        debug('skip cleaning: cache is not used for reading');
      }
    }

    try {
      const dir = dirname(this.cacheFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        debug('created cache directory: %s', dir);
      }

      // Sort caches to ensure plan entries come before locate entries for better readability
      // Create a sorted copy for writing to disk while keeping in-memory order unchanged
      const sortedCaches = [...this.cache.caches].sort((a, b) => {
        if (a.type === 'plan' && b.type === 'locate') return -1;
        if (a.type === 'locate' && b.type === 'plan') return 1;
        return 0;
      });

      const cacheToWrite = {
        ...this.cache,
        caches: sortedCaches,
      };

      const yamlData = yaml.dump(cacheToWrite, { lineWidth: -1 });
      writeFileSync(this.cacheFilePath, yamlData);
      debug('cache flushed to file: %s', this.cacheFilePath);
    } catch (err) {
      warn(
        `write cache to file failed, path: ${this.cacheFilePath}, error: ${err}`,
      );
    }
  }

  // Single source of truth for turning a prompt into a stable string key.
  // matchCache and updateOrAppendCacheRecord must agree on this, otherwise a
  // consumed entry can never be found again for in-place replacement.
  private promptKey(prompt: TUserPrompt): string {
    return typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  }

  // Copy the mutable payload of `newRecord` into an existing cache entry.
  // Shared by the live-record update path and replaceCacheRecord so the field
  // list lives in exactly one place. Caller guarantees same `type`.
  private applyRecordInto(
    target: PlanningCache | LocateCache,
    newRecord: PlanningCache | LocateCache,
  ) {
    if (newRecord.type === 'plan') {
      (target as PlanningCache).yamlWorkflow = newRecord.yamlWorkflow;
    } else {
      const locateCache = target as LocateCache;
      locateCache.cache = newRecord.cache;
      if ('xpaths' in locateCache) {
        locateCache.xpaths = undefined;
      }
    }
  }

  updateOrAppendCacheRecord(
    newRecord: PlanningCache | LocateCache,
    cachedRecord?: MatchCacheResult<PlanningCache | LocateCache>,
  ) {
    if (cachedRecord) {
      // update existing record
      cachedRecord.updateFn((cache) => {
        this.applyRecordInto(cache, newRecord);
      });
    } else {
      // No live MatchCacheResult was passed. This is either a genuine first-time
      // miss or a replanning re-locate after the previously matched entry was
      // rejected. Only replace an entry that was explicitly marked stale (its
      // element caused a failed action); otherwise append. Without this gate a
      // legitimately repeated prompt — located more times than it has cached
      // entries — would overwrite a still-valid entry instead of appending.
      const consumeKey = `${newRecord.type}:${this.promptKey(newRecord.prompt)}`;
      const staleIndex = this.staleCacheIndices.get(consumeKey)?.pop();
      if (staleIndex !== undefined && this.cache.caches[staleIndex]) {
        debug(
          'replacing stale cache entry in place, type: %s, prompt: %s, index: %d',
          newRecord.type,
          newRecord.prompt,
          staleIndex,
        );
        this.replaceCacheRecord(staleIndex, newRecord);
      } else {
        this.appendCache(newRecord);
      }
    }
  }

  /**
   * Mark the most recently consumed locate cache entry for `prompt` as stale.
   * Call this when an action that used the cache-hit element failed and the run
   * is about to replan: the subsequent re-locate then replaces this entry in
   * place instead of appending a duplicate, which would otherwise be matched
   * first on the next run and re-trigger replanning forever (#2529).
   *
   * No-op when nothing was consumed for the prompt, so a plain first-time miss
   * (and any repeated prompt that never failed) still appends normally.
   */
  markLocateCacheStale(prompt: TUserPrompt) {
    const consumeKey = `locate:${this.promptKey(prompt)}`;
    const index = this.consumedCacheIndices.get(consumeKey)?.pop();
    if (index === undefined) {
      return;
    }
    const stale = this.staleCacheIndices.get(consumeKey) ?? [];
    stale.push(index);
    this.staleCacheIndices.set(consumeKey, stale);
    debug(
      'marked locate cache entry as stale, prompt: %s, index: %d',
      prompt,
      index,
    );
  }

  private replaceCacheRecord(
    index: number,
    newRecord: PlanningCache | LocateCache,
  ) {
    const target = this.cache.caches[index];
    // Consumed indices are recorded per `${type}:${prompt}` in matchCache, which
    // only stores entries whose `item.type === type`, so the target must share
    // newRecord's type. Assert it to make the invariant explicit and fail fast.
    assert(
      target.type === newRecord.type,
      `cache record type mismatch on replace: expected ${newRecord.type}, got ${target.type}`,
    );
    this.applyRecordInto(target, newRecord);

    if (this.readOnlyMode) {
      debug('read-only mode, cache replaced in memory but not flushed to file');
      return;
    }

    this.flushCacheToFile();
  }
}
