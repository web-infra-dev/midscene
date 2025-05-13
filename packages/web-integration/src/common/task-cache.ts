import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanningAIResponse } from '@midscene/core';
import type { vlmPlanning } from '@midscene/core/ai-model';
import { stringifyDumpData, writeLogFile } from '@midscene/core/utils';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getRunningPkgInfo } from '@midscene/shared/fs';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';
import semver from 'semver';
import { version } from '../../package.json';
import type { WebPage } from './page';
import {
  type WebUIContext,
  checkElementExistsByXPath,
  replaceIllegalPathCharsAndSpace,
} from './utils';

const debug = getDebug('cache');

export type PlanTask = {
  type: 'plan';
  prompt: string;
  pageContext: {
    url: string;
    size: {
      width: number;
      height: number;
    };
  };
  response: PlanningAIResponse;
};

export type UITarsPlanTask = {
  type: 'ui-tars-plan';
  prompt: string;
  pageContext: {
    url: string;
    size: {
      width: number;
      height: number;
    };
  };
  response: Awaited<ReturnType<typeof vlmPlanning>>;
};

export type LocateTask = {
  type: 'locate';
  prompt: string;
  pageContext: {
    url: string;
    size: {
      width: number;
      height: number;
    };
  };
  response: {
    xpaths: string[];
  };
};

export type AiTasks = Array<PlanTask | LocateTask | UITarsPlanTask>;

export type AiTaskCache = {
  midsceneVersion: string;
  pkgName: string;
  pkgVersion: string;
  cacheId: string;
  aiTasks: Array<{
    prompt: string;
    tasks: AiTasks;
  }>;
};

export type CacheGroup = {
  matchCache: <T extends 'plan' | 'locate' | 'ui-tars-plan'>(
    pageContext: WebUIContext,
    type: T,
    actionPrompt: string,
  ) => Promise<
    T extends 'plan'
      ? PlanTask['response']
      : T extends 'locate'
        ? LocateTask['response']
        : UITarsPlanTask['response']
  >;
  saveCache: (cache: UITarsPlanTask | PlanTask | LocateTask) => void;
};

export class TaskCache {
  page: WebPage;

  cache: AiTaskCache;

  cacheId: string;

  newCache: AiTaskCache;

  midscenePkgInfo: ReturnType<typeof getRunningPkgInfo> | null;

  private usedCacheItems: Map<string, Set<number>> = new Map();

  private currentCycleCacheState: Map<
    string,
    { count: number; usedIndices: number[] }
  > = new Map();

  constructor(page: WebPage, opts?: { cacheId?: string }) {
    this.midscenePkgInfo = getRunningPkgInfo();
    this.cacheId = replaceIllegalPathCharsAndSpace(opts?.cacheId || '');
    this.page = page;
    this.cache = this.readCacheFromFile() || {
      midsceneVersion: '',
      pkgName: '',
      pkgVersion: '',
      cacheId: '',
      aiTasks: [],
    };
    this.newCache = {
      midsceneVersion: version,
      pkgName: this.midscenePkgInfo?.name || '',
      pkgVersion: this.midscenePkgInfo?.version || '',
      cacheId: this.cacheId,
      aiTasks: JSON.parse(JSON.stringify(this.cache.aiTasks || [])),
    };
  }

  getCacheGroupByPrompt(aiActionPrompt: string): CacheGroup {
    if (!this.usedCacheItems.has(aiActionPrompt)) {
      this.usedCacheItems.set(aiActionPrompt, new Set());
    }

    const usedIndices = this.usedCacheItems.get(aiActionPrompt)!;
    const { aiTasks = [] } = this.cache || { aiTasks: [] };

    // 初始化或获取当前循环状态
    if (!this.currentCycleCacheState.has(aiActionPrompt)) {
      this.currentCycleCacheState.set(aiActionPrompt, {
        count: 0,
        usedIndices: [],
      });
    }

    // 获取并更新计数
    const cacheState = this.currentCycleCacheState.get(aiActionPrompt)!;
    const currentCount = cacheState.count;
    cacheState.count++;

    debug('current prompt [%s] count: %d', aiActionPrompt, currentCount + 1);

    let matchIndex = -1;
    let matchItem = null;

    // find unused cache item in order
    for (let i = 0; i < aiTasks.length; i++) {
      const item = aiTasks[i];
      if (item.prompt === aiActionPrompt) {
        if (!usedIndices.has(i) && item.tasks && item.tasks.length > 0) {
          matchIndex = i;
          matchItem = item;
          usedIndices.add(i);
          debug('find unused cache item: %s, index: %d', aiActionPrompt, i);
          break;
        }
      }
    }

    // get all cache groups with same prompt in new cache
    const promptGroups = this.newCache.aiTasks.filter(
      (item) => item.prompt === aiActionPrompt,
    );

    const usedGroupIndices = cacheState.usedIndices;
    let targetGroupIndex: number;
    let newCacheGroup: AiTasks;

    // if current count is less than the number of existing cache groups, use the corresponding index cache group
    if (currentCount < promptGroups.length) {
      // find the index of promptGroups[currentCount] in newCache.aiTasks
      targetGroupIndex = this.newCache.aiTasks.findIndex(
        (item, index) =>
          item.prompt === aiActionPrompt &&
          !usedGroupIndices.includes(index) && // if the index is not used
          usedGroupIndices.length === currentCount, // if the index is the index in current cycle, ensure the order of used cache groups
      );

      if (targetGroupIndex === -1) {
        debug(
          'no suitable cache group, create new cache group: prompt [%s], current count: %d',
          aiActionPrompt,
          currentCount + 1,
        );
        this.newCache.aiTasks.push({
          prompt: aiActionPrompt,
          tasks: [],
        });
        targetGroupIndex = this.newCache.aiTasks.length - 1;
        usedGroupIndices.push(targetGroupIndex);
        newCacheGroup = this.newCache.aiTasks[targetGroupIndex].tasks;
        debug(
          'create new cache group as fallback: prompt [%s], index: %d, current count: %d',
          aiActionPrompt,
          targetGroupIndex,
          currentCount + 1,
        );
      } else {
        usedGroupIndices.push(targetGroupIndex);
        newCacheGroup = this.newCache.aiTasks[targetGroupIndex].tasks;
        debug(
          'use existing cache group: prompt [%s], index: %d, current count: %d',
          aiActionPrompt,
          targetGroupIndex,
          currentCount + 1,
        );
      }
    } else {
      // if current count is greater than the number of existing cache groups, create a new cache group
      this.newCache.aiTasks.push({
        prompt: aiActionPrompt,
        tasks: [],
      });
      targetGroupIndex = this.newCache.aiTasks.length - 1;
      usedGroupIndices.push(targetGroupIndex);
      newCacheGroup = this.newCache.aiTasks[targetGroupIndex].tasks;
      debug(
        'create new cache group: prompt [%s], index: %d, current count: %d',
        aiActionPrompt,
        targetGroupIndex,
        currentCount + 1,
      );
    }

    return {
      matchCache: async <T extends 'plan' | 'locate' | 'ui-tars-plan'>(
        pageContext: WebUIContext,
        type: T,
        actionPrompt: string,
      ) => {
        if (matchIndex === -1 || !matchItem) {
          return false as any;
        }

        if (type === 'plan') {
          return this.matchCache(
            pageContext,
            type,
            actionPrompt,
            matchItem.tasks,
          ) as Promise<PlanTask['response']>;
        }
        if (type === 'ui-tars-plan') {
          return this.matchCache(
            pageContext,
            type,
            actionPrompt,
            matchItem.tasks,
          ) as Promise<UITarsPlanTask['response']>;
        }

        return this.matchCache(
          pageContext,
          type,
          actionPrompt,
          matchItem.tasks,
        ) as Promise<
          T extends 'plan'
            ? PlanTask['response']
            : T extends 'locate'
              ? LocateTask['response']
              : UITarsPlanTask['response']
        >;
      },
      saveCache: (cache: PlanTask | LocateTask | UITarsPlanTask) => {
        newCacheGroup.push(cache);
        debug(
          'save cache to file, type: %s, cacheId: %s, prompt index: %d, current count: %d',
          cache.type,
          this.cacheId,
          targetGroupIndex,
          currentCount + 1,
        );
        this.writeCacheToFile();
      },
    };
  }

  /**
   * Read and return cached responses asynchronously based on specific criteria
   * This function is mainly used to read cached responses from a certain storage medium.
   * It accepts three parameters: the page context information, the task type, and the user's prompt information.
   * In the function, it first checks whether there is cached data. If there is, it retrieves the first task response from the cache.
   * It then checks whether the task type is 'locate' and whether the corresponding element can be found in the new context.
   * If the element cannot be found, it returns false, indicating that the cache is invalid.
   * If the task type is correct and the user prompt matches, it checks whether the page context is the same.
   * If the page context is the same, it returns the cached response, indicating that the cache hit is successful.
   * If there is no cached data or the conditions are not met, the function returns false, indicating that no cache is available or the cache is not hit.
   *
   * @param pageContext UIContext<WebElementInfo> type, representing the context information of the current page
   * @param type String type, specifying the task type, can be 'plan' or 'locate'
   * @param userPrompt String type, representing user prompt information
   * @return Returns a Promise object that resolves to a boolean or object
   */
  async matchCache(
    pageContext: WebUIContext,
    type: 'plan' | 'locate' | 'ui-tars-plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): Promise<
    | PlanTask['response']
    | LocateTask['response']
    | UITarsPlanTask['response']
    | false
  > {
    debug(
      'will read cache, type: %s, prompt: %s, cacheGroupLength: %s',
      type,
      userPrompt,
      cacheGroup.length,
    );
    if (cacheGroup.length > 0) {
      const index = cacheGroup.findIndex((item) => item.prompt === userPrompt);

      if (index === -1) {
        debug('cannot find any cache matching prompt: %s', userPrompt);
        return false;
      }

      const taskRes = cacheGroup[index];
      debug(
        'found cache with same prompt, type: %s, prompt: %s, cached response is %j',
        type,
        userPrompt,
        taskRes?.response,
      );

      // The corresponding element cannot be found in the new context
      if (taskRes?.type === 'locate') {
        const xpaths = taskRes.response?.xpaths;

        if (!xpaths || !xpaths.length) {
          debug('no xpaths in cached response');
          return false;
        }

        const elementExists = await checkElementExistsByXPath(
          this.page,
          xpaths,
          { type, userPrompt, debug },
        );

        if (elementExists) {
          return taskRes.response;
        }

        return false;
      }

      if (taskRes && taskRes.type === type && taskRes.prompt === userPrompt) {
        const contextEqual = this.pageContextEqual(
          taskRes.pageContext,
          pageContext,
        );
        if (!contextEqual) {
          debug(
            'cache almost hit, type: %s, prompt: %s, but context not equal, will not use cache',
            type,
            userPrompt,
          );
          return false;
        }
        debug('cache hit, type: %s, prompt: %s', type, userPrompt);
        return taskRes.response;
      }
    }
    debug('no cache hit, type: %s, prompt: %s', type, userPrompt);
    return false;
  }

  pageContextEqual(
    taskPageContext: LocateTask['pageContext'],
    pageContext: WebUIContext,
  ) {
    debug(
      'comparing page context size: %s x %s, %s x %s',
      taskPageContext.size.width,
      taskPageContext.size.height,
      pageContext.size.width,
      pageContext.size.height,
    );
    return (
      taskPageContext.size.width === pageContext.size.width &&
      taskPageContext.size.height === pageContext.size.height
    );
  }

  /**
   * Generate task cache data.
   * This method is mainly used to create or obtain some cached data for tasks, and it returns a new cache object.
   * In the cache object, it may contain task-related information, states, or other necessary data.
   * It is assumed that the `newCache` property already exists in the current class or object and is a data structure used to store task cache.
   * @returns {Object} Returns a new cache object, which may include task cache data.
   */
  generateTaskCache() {
    return this.newCache;
  }

  readCacheFromFile() {
    if (ifInBrowser || !this.cacheId) {
      return undefined;
    }
    const cacheFile = join(
      getMidsceneRunSubDir('cache'),
      `${this.cacheId}.json`,
    );

    if (existsSync(cacheFile)) {
      try {
        const data = readFileSync(cacheFile, 'utf8');
        const jsonData = JSON.parse(data) as AiTaskCache;

        if (!this.midscenePkgInfo) {
          debug('no midscene pkg info, will not read cache from file');
          return undefined;
        }

        if (
          semver.lt(jsonData.midsceneVersion, '0.17.0') &&
          !jsonData.midsceneVersion.includes('beta') // for internal test
        ) {
          console.warn(
            `You are using an old version of Midscene cache file, and we cannot match any info from it. Starting from Midscene v0.17, we changed our strategy to use xpath for cache info, providing better performance. Please delete the existing cache and rebuild it. Sorry for the inconvenience.\ncache file: ${cacheFile}`,
          );
          return undefined;
        }

        debug('read cache from file: %s', cacheFile);
        return jsonData;
      } catch (err) {
        debug(
          'cache file exists but parse failed, path: %s, error: %s',
          cacheFile,
          err,
        );
        return undefined;
      }
    }
    debug('no cache file found, path: %s', cacheFile);
    return undefined;
  }

  writeCacheToFile() {
    const midscenePkgInfo = getRunningPkgInfo();
    if (!midscenePkgInfo) {
      debug('no midscene pkg info, will not write cache to file');
      return;
    }

    if (!this.cacheId) {
      debug('no cache id, will not write cache to file');
      return;
    }

    if (!ifInBrowser) {
      writeLogFile({
        fileName: `${this.cacheId}`,
        fileExt: 'json',
        fileContent: stringifyDumpData(this.newCache, 2),
        type: 'cache',
      });
    }
  }
}
