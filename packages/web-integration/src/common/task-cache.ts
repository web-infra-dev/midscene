import Insight, { DumpSubscriber, InsightDump, PlanningAction, UIContext, plan } from '@midscene/core';
import { WebElementInfo } from '../web-element';

type PlanTask = {
  type: 'plan';
  prompt: string;
  pageContext: {
    url: string;
    width: number;
    height: number;
  };
  response: { plans: PlanningAction[] };
};

export type LocateTask = {
  type: 'locate';
  prompt: string;
  pageContext: {
    url: string;
    width: number;
    height: number;
  };
  response: {
    output: {
      element: WebElementInfo | null;
    };
    log: {
      dump: InsightDump | undefined;
    };
  };
};

export type AiTasks = Array<PlanTask | LocateTask>;

export type AiTaskCache = {
  aiTasks: AiTasks;
};

export class TaskCache {
  insight: Insight<WebElementInfo>;

  cache: AiTaskCache | undefined;

  newCache: AiTaskCache;

  constructor(insight: Insight<WebElementInfo>, opts?: { cache: AiTaskCache }) {
    this.insight = insight;
    this.cache = opts?.cache;
    this.newCache = {
      aiTasks: [],
    };
  }

  /**
   * Plan based on user prompts and page context
   *
   * This function is used to plan based on user prompts and page context.
   * It first retrieves the page context and then attempts to read the cache based on the context and user prompts.
   * If the cache is valid and contains the 'plans' key, it returns the cached result.
   * Otherwise, it calls the 'plan' function to obtain a new planning result and caches this result.
   * Finally, it returns the planning result.
   *
   * @param userPrompt - The prompt information provided by the user
   * @return A Promise that resolves to an object containing the planning result
   */
  async plan(userPrompt: string): Promise<{ plans: PlanningAction[] }> {
    const pageContext = await this.insight.contextRetrieverFn();
    const planCache = await this.readCache(pageContext, 'plan', userPrompt);
    let planResult: { plans: PlanningAction[] };
    // If the cache is valid, return the cache
    if (planCache && 'plans' in planCache) {
      planResult = planCache;
    } else {
      planResult = await plan(pageContext, userPrompt);
    }

    this.newCache?.aiTasks.push({
      type: 'plan',
      prompt: userPrompt,
      pageContext: { url: '', width: pageContext.size.width, height: pageContext.size.height },
      response: planResult,
    });
    return planResult;
  }

  /**
   * Asynchronously locate a web element based on user prompt and page context
   *
   * This function uses an asynchronous approach to locate a web element.
   * It first retrieves the page context, then attempts to read from the cache based on the context and user prompt.
   * If there is no valid cache or the cache does not match the requirements, it will execute the `locate` method of the `insight` object.
   * Finally, it updates the cache with the latest location results and returns the located web element information or `null` if not found.
   *
   * @param userPrompt - The prompt information provided by the user
   * @return A Promise that resolves to the found WebElementInfo object or null if not found
   */
  async locate(userPrompt: string): Promise<LocateTask['response']> {
    const pageContext = await this.insight.contextRetrieverFn();
    const locateCache = await this.readCache(pageContext, 'locate', userPrompt);
    let locateResult: LocateTask['response'];
    // If the cache is valid, return the cache
    if (locateCache && !('plans' in locateCache)) {
      locateResult = locateCache;
    } else {
      let insightDump: InsightDump | undefined;
      const dumpCollector: DumpSubscriber = (dump) => {
        insightDump = dump;
      };
      this.insight.onceDumpUpdatedFn = dumpCollector;
      const element = await this.insight.locate(userPrompt);
      locateResult = {
        output: {
          element,
        },
        log: {
          dump: insightDump,
        },
      };
    }

    this.newCache?.aiTasks.push({
      type: 'locate',
      prompt: userPrompt,
      pageContext: { url: '', width: pageContext.size.width, height: pageContext.size.height },
      response: locateResult,
    });
    return locateResult;
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
  async readCache(pageContext: UIContext<WebElementInfo>, type: 'plan' | 'locate', userPrompt: string) {
    if (this.cache) {
      const { aiTasks } = this.cache;
      const taskRes = aiTasks.shift();
      // The corresponding element cannot be found in the new context
      if (
        taskRes?.type === 'locate' &&
        !pageContext.content.find((e) => e.id === taskRes.response?.output.element?.id)
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

  pageContextEqual(taskPageContext: LocateTask['pageContext'], pageContext: UIContext<WebElementInfo>) {
    return (
      taskPageContext.width === pageContext.size.width && taskPageContext.height === pageContext.size.height
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
