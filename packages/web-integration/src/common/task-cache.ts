import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AIElementLocatorResponse,
  PlanningAIResponse,
} from '@midscene/core';
import type { vlmPlanning } from '@midscene/core/ai-model';
import { getAIConfig, getAIConfigInBoolean } from '@midscene/core/env';
import {
  getLogDirByType,
  stringifyDumpData,
  writeLogFile,
} from '@midscene/core/utils';
import { getRunningPkgInfo } from '@midscene/shared/fs';
import { getDebug, ifInBrowser } from '@midscene/shared/utils';
import type { WebUIContext } from './utils';

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
  response: AIElementLocatorResponse;
};

export type AiTasks = Array<PlanTask | LocateTask | UITarsPlanTask>;

export type AiTaskCache = {
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
  ) => T extends 'plan'
    ? PlanTask['response']
    : T extends 'locate'
      ? LocateTask['response']
      : UITarsPlanTask['response'];
  saveCache: (cache: UITarsPlanTask | PlanTask | LocateTask) => void;
};

export class TaskCache {
  cache: AiTaskCache;

  cacheId: string;

  newCache: AiTaskCache;

  midscenePkgInfo: ReturnType<typeof getRunningPkgInfo> | null;

  constructor(opts?: { cacheId?: string }) {
    this.midscenePkgInfo = getRunningPkgInfo();
    this.cacheId = opts?.cacheId || '';
    this.cache = this.readCacheFromFile() || {
      aiTasks: [],
    };
    this.newCache = {
      aiTasks: [],
    };
  }

  getCacheGroupByPrompt(aiActionPrompt: string): CacheGroup {
    const { aiTasks = [] } = this.cache || { aiTasks: [] };
    const index = aiTasks.findIndex((item) => item.prompt === aiActionPrompt);
    const newCacheGroup: AiTasks = [];
    this.newCache.aiTasks.push({
      prompt: aiActionPrompt,
      tasks: newCacheGroup,
    });
    return {
      matchCache: <T extends 'plan' | 'locate' | 'ui-tars-plan'>(
        pageContext: WebUIContext,
        type: T,
        actionPrompt: string,
      ) => {
        if (index === -1) {
          return false as any;
        }
        if (type === 'plan') {
          return this.matchCache(
            pageContext,
            type,
            actionPrompt,
            aiTasks[index].tasks,
          ) as PlanTask['response'];
        }
        if (type === 'ui-tars-plan') {
          return this.matchCache(
            pageContext,
            type,
            actionPrompt,
            aiTasks[index].tasks,
          ) as UITarsPlanTask['response'];
        }

        return this.matchCache(
          pageContext,
          type,
          actionPrompt,
          aiTasks[index].tasks,
        ) as T extends 'plan'
          ? PlanTask['response']
          : T extends 'locate'
            ? LocateTask['response']
            : UITarsPlanTask['response'];
      },
      saveCache: (cache: PlanTask | LocateTask | UITarsPlanTask) => {
        newCacheGroup.push(cache);
        debug(
          'saving cache to file, type: %s, cacheId: %s',
          cache.type,
          this.cacheId,
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
  matchCache(
    pageContext: WebUIContext,
    type: 'plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): PlanTask['response'];
  matchCache(
    pageContext: WebUIContext,
    type: 'ui-tars-plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): UITarsPlanTask['response'];
  matchCache(
    pageContext: WebUIContext,
    type: 'locate',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): LocateTask['response'];
  matchCache(
    pageContext: WebUIContext,
    type: 'plan' | 'locate' | 'ui-tars-plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ):
    | PlanTask['response']
    | LocateTask['response']
    | UITarsPlanTask['response']
    | false {
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

      const taskRes = cacheGroup.splice(index, 1)[0];
      debug(
        'found cache with same prompt, type: %s, prompt: %s, cached response is %j',
        type,
        userPrompt,
        taskRes?.response,
      );

      // The corresponding element cannot be found in the new context
      if (taskRes?.type === 'locate') {
        const id = taskRes.response?.elements[0].id;
        if (!id) {
          debug('no id in cached response');
          return false;
        }

        const foundInContext = pageContext.content.find(
          (contentElement) => contentElement.id === id,
        );
        if (!foundInContext) {
          debug('cannot match element with same id in current page');
          return false;
        }

        return taskRes.response;
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
    const cacheFile = join(getLogDirByType('cache'), `${this.cacheId}.json`);
    if (!getAIConfigInBoolean('MIDSCENE_CACHE')) {
      return undefined;
    }

    if (existsSync(cacheFile)) {
      try {
        const data = readFileSync(cacheFile, 'utf8');
        const jsonData = JSON.parse(data);
        if (!this.midscenePkgInfo) {
          return undefined;
        }
        const jsonDataPkgVersion = jsonData.pkgVersion.split('.');
        const midscenePkgInfoPkgVersion =
          this.midscenePkgInfo.version.split('.');
        if (
          jsonDataPkgVersion[0] !== midscenePkgInfoPkgVersion[0] ||
          jsonDataPkgVersion[1] !== midscenePkgInfoPkgVersion[1]
        ) {
          return undefined;
        }
        debug('read cache from file: %s', cacheFile);
        return jsonData as AiTaskCache;
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
        fileContent: stringifyDumpData(
          {
            pkgName: midscenePkgInfo.name,
            pkgVersion: midscenePkgInfo.version,
            cacheId: this.cacheId,
            ...this.newCache,
          },
          2,
        ),
        type: 'cache',
      });
    }
  }
}
