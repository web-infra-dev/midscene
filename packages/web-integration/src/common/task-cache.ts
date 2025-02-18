import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AIElementIdResponse, PlanningAIResponse } from '@midscene/core';
import type { vlmPlanning } from '@midscene/core/ai-model';
import { getAIConfig } from '@midscene/core/env';
import {
  getLogDirByType,
  stringifyDumpData,
  writeLogFile,
} from '@midscene/core/utils';
import { getRunningPkgInfo } from '@midscene/shared/fs';
import { ifInBrowser } from '@midscene/shared/utils';
import { type WebUIContext, generateCacheId } from './utils';

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
  response: AIElementIdResponse;
};

export type AiTasks = Array<PlanTask | LocateTask | UITarsPlanTask>;

export type AiTaskCache = {
  aiTasks: Array<{
    prompt: string;
    tasks: AiTasks;
  }>;
};

export type CacheGroup = {
  readCache: <T extends 'plan' | 'locate' | 'ui-tars-plan'>(
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
      readCache: <T extends 'plan' | 'locate' | 'ui-tars-plan'>(
        pageContext: WebUIContext,
        type: T,
        actionPrompt: string,
      ) => {
        if (index === -1) {
          return false as any;
        }
        if (type === 'plan') {
          return this.readCache(
            pageContext,
            type,
            actionPrompt,
            aiTasks[index].tasks,
          ) as PlanTask['response'];
        }
        if (type === 'ui-tars-plan') {
          return this.readCache(
            pageContext,
            type,
            actionPrompt,
            aiTasks[index].tasks,
          ) as UITarsPlanTask['response'];
        }

        return this.readCache(
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
  readCache(
    pageContext: WebUIContext,
    type: 'plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): PlanTask['response'];
  readCache(
    pageContext: WebUIContext,
    type: 'ui-tars-plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): UITarsPlanTask['response'];
  readCache(
    pageContext: WebUIContext,
    type: 'locate',
    userPrompt: string,
    cacheGroup: AiTasks,
  ): LocateTask['response'];
  readCache(
    pageContext: WebUIContext,
    type: 'plan' | 'locate' | 'ui-tars-plan',
    userPrompt: string,
    cacheGroup: AiTasks,
  ):
    | PlanTask['response']
    | LocateTask['response']
    | UITarsPlanTask['response']
    | false {
    if (cacheGroup.length > 0) {
      const index = cacheGroup.findIndex((item) => item.prompt === userPrompt);

      if (index === -1) {
        return false;
      }

      const taskRes = cacheGroup.splice(index, 1)[0];

      // The corresponding element cannot be found in the new context
      if (
        taskRes?.type === 'locate' &&
        !taskRes.response?.elements.every((element) => {
          const findIndex = pageContext.content.findIndex(
            (contentElement) => contentElement.id === element.id,
          );
          if (findIndex === -1) {
            return false;
          }
          return true;
        })
      ) {
        return false;
      }
      if (
        taskRes &&
        taskRes.type === type &&
        taskRes.prompt === userPrompt &&
        this.pageContextEqual(taskRes.pageContext, pageContext)
      ) {
        return taskRes.response;
      }
    }
    return false;
  }

  pageContextEqual(
    taskPageContext: LocateTask['pageContext'],
    pageContext: WebUIContext,
  ) {
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
    if (getAIConfig('MIDSCENE_CACHE') === 'true' && existsSync(cacheFile)) {
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
        return jsonData as AiTaskCache;
      } catch (err) {
        return undefined;
      }
    }
    return undefined;
  }

  writeCacheToFile() {
    const midscenePkgInfo = getRunningPkgInfo();
    if (!midscenePkgInfo || !this.cacheId) {
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
