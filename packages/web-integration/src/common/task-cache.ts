import type { AIElementParseResponse, PlanningAction } from '@midscene/core';
import type { WebUIContext } from './utils';

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
  response: { plans: PlanningAction[] };
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
  response: AIElementParseResponse;
};

export type AiTasks = Array<PlanTask | LocateTask>;

export type AiTaskCache = {
  aiTasks: AiTasks;
};

export class TaskCache {
  cache: AiTaskCache | undefined;

  newCache: AiTaskCache;

  constructor(opts?: { cache: AiTaskCache }) {
    this.cache = opts?.cache;
    this.newCache = {
      aiTasks: [],
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
  ): PlanTask['response'];
  readCache(
    pageContext: WebUIContext,
    type: 'locate',
    userPrompt: string,
  ): LocateTask['response'];
  readCache(
    pageContext: WebUIContext,
    type: 'plan' | 'locate',
    userPrompt: string,
  ): PlanTask['response'] | LocateTask['response'] | false {
    if (this.cache) {
      const { aiTasks } = this.cache;
      const index = aiTasks.findIndex((item) => item.prompt === userPrompt);

      if (index === -1) {
        return false;
      }

      const taskRes = aiTasks.splice(index, 1)[0];

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

  saveCache(cache: PlanTask | LocateTask) {
    if (cache) {
      this.newCache?.aiTasks.push(cache);
    }
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
}
