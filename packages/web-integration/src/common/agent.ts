import type { WebPage } from '@/common/page';
import {
  type AgentAssertOpt,
  type AgentDescribeElementAtPointResult,
  type AgentWaitForOpt,
  type DetailedLocateParam,
  type DeviceAction,
  type ExecutionDump,
  type ExecutionRecorderItem,
  type ExecutionTask,
  type ExecutionTaskLog,
  type Executor,
  type GroupedActionDump,
  Insight,
  type InsightAction,
  type InsightExtractOption,
  type InsightExtractParam,
  type LocateOption,
  type LocateResultElement,
  type LocateValidatorResult,
  type LocatorValidatorOption,
  type MidsceneYamlScript,
  type OnTaskStartTip,
  type PlanningAction,
  type PlanningLocateParam,
  type Rect,
  type ScrollParam,
  type TUserPrompt,
} from '@midscene/core';

import yaml from 'js-yaml';

import { ScriptPlayer, parseYamlScript } from '@/yaml/index';
import { getModelName } from '@midscene/core/ai-model';
import {
  groupedActionDumpFileExt,
  reportHTMLContent,
  stringifyDumpData,
  writeLogFile,
} from '@midscene/core/utils';
import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import {
  getAIConfigInBoolean,
  uiTarsModelVersion,
  vlLocateMode,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { PageTaskExecutor, locatePlanForLocate } from '../common/tasks';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';
import type { WebElementInfo, WebUIContext } from '../web-element';
import type { AndroidDeviceInputOpt } from './page';
import { TaskCache } from './task-cache';
import { locateParamStr, paramStr, taskTitleStr, typeStr } from './ui-utils';
import { getReportFileName, printReportMsg } from './utils';
import { parseContextFromWebPage } from './utils';
import { trimContextByViewport } from './utils';

const debug = getDebug('agent');

const distanceOfTwoPoints = (p1: [number, number], p2: [number, number]) => {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  return Math.round(Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2));
};

const includedInRect = (point: [number, number], rect: Rect) => {
  const [x, y] = point;
  const { left, top, width, height } = rect;
  return x >= left && x <= left + width && y >= top && y <= top + height;
};

const defaultInsightExtractOption: InsightExtractOption = {
  domIncluded: false,
  screenshotIncluded: true,
};

export interface PageAgentOpt {
  forceSameTabNavigation?: boolean /* if limit the new tab to the current page, default true */;
  testId?: string;
  cacheId?: string;
  groupName?: string;
  groupDescription?: string;
  /* if auto generate report, default true */
  generateReport?: boolean;
  /* if auto print report msg, default true */
  autoPrintReportMsg?: boolean;
  onTaskStartTip?: OnTaskStartTip;
  aiActionContext?: string;
  /* custom report file name */
  reportFileName?: string;
}

export type WebPageAgentOpt = PageAgentOpt & WebPageOpt;
export type WebPageOpt = {
  waitForNavigationTimeout?: number;
  waitForNetworkIdleTimeout?: number;
};

export class PageAgent<PageType extends WebPage = WebPage> {
  page: PageType;

  insight: Insight<WebElementInfo, WebUIContext>;

  dump: GroupedActionDump;

  reportFile?: string | null;

  reportFileName?: string;

  taskExecutor: PageTaskExecutor;

  opts: PageAgentOpt;

  /**
   * If true, the agent will not perform any actions
   */
  dryMode = false;

  onTaskStartTip?: OnTaskStartTip;

  taskCache?: TaskCache;

  onDumpUpdate?: (dump: string) => void;

  destroyed = false;

  /**
   * Frozen page context for consistent AI operations
   */
  private frozenPageContext?: WebUIContext;

  constructor(page: PageType, opts?: PageAgentOpt) {
    this.page = page;
    this.opts = Object.assign(
      {
        generateReport: true,
        autoPrintReportMsg: true,
        groupName: 'Midscene Report',
        groupDescription: '',
      },
      opts || {},
    );

    if (
      this.page.pageType === 'puppeteer' ||
      this.page.pageType === 'playwright'
    ) {
      (
        this.page as PuppeteerWebPage | PlaywrightWebPage
      ).waitForNavigationTimeout =
        (this.opts as WebPageAgentOpt).waitForNavigationTimeout ??
        DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT;
      (
        this.page as PuppeteerWebPage | PlaywrightWebPage
      ).waitForNetworkIdleTimeout =
        (this.opts as WebPageAgentOpt).waitForNetworkIdleTimeout ??
        DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT;
    }

    this.onTaskStartTip = this.opts.onTaskStartTip;
    // get the parent browser of the puppeteer page
    // const browser = (this.page as PuppeteerWebPage).browser();

    this.insight = new Insight<WebElementInfo, WebUIContext>(
      async (action: InsightAction) => {
        return this.getUIContext(action);
      },
    );

    if (opts?.cacheId && this.page.pageType !== 'android') {
      this.taskCache = new TaskCache(
        opts.cacheId,
        getAIConfigInBoolean('MIDSCENE_CACHE'), // if we should use cache to match the element
      );
    }

    this.taskExecutor = new PageTaskExecutor(this.page, this.insight, {
      taskCache: this.taskCache,
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
    });
    this.dump = this.resetDump();
    this.reportFileName =
      opts?.reportFileName ||
      getReportFileName(opts?.testId || this.page.pageType || 'web');
  }

  async getActionSpace(): Promise<DeviceAction[]> {
    return this.page.actionSpace();
  }

  async getUIContext(action?: InsightAction): Promise<WebUIContext> {
    // If page context is frozen, return the frozen context for all actions
    if (this.frozenPageContext) {
      debug('Using frozen page context for action:', action);
      return this.frozenPageContext;
    }

    // Otherwise, get fresh context based on the action type
    if (action && (action === 'extract' || action === 'assert')) {
      return await parseContextFromWebPage(this.page, {
        ignoreMarker: true,
      });
    }
    return await parseContextFromWebPage(this.page, {
      ignoreMarker: !!vlLocateMode(),
    });
  }

  async _snapshotContext(): Promise<WebUIContext> {
    return await this.getUIContext('locate');
  }

  async setAIActionContext(prompt: string) {
    this.opts.aiActionContext = prompt;
  }

  resetDump() {
    const modelDescription = (() => {
      if (vlLocateMode()) {
        const uiTarsModelVer = uiTarsModelVersion();
        if (uiTarsModelVer) {
          return `UI-TARS=${uiTarsModelVer}`;
        } else {
          return `${vlLocateMode()} mode`;
        }
      }
      return '';
    })();

    const modelName = getModelName();

    this.dump = {
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      modelName,
      modelDescription,
      executions: [],
    };

    return this.dump;
  }

  appendExecutionDump(execution: ExecutionDump) {
    // use trimContextByViewport to process execution
    const trimmedExecution = trimContextByViewport(execution);
    const currentDump = this.dump;
    currentDump.executions.push(trimmedExecution);
  }

  dumpDataString() {
    // update dump info
    this.dump.groupName = this.opts.groupName!;
    this.dump.groupDescription = this.opts.groupDescription;
    return stringifyDumpData(this.dump);
  }

  reportHTMLString() {
    return reportHTMLContent(this.dumpDataString());
  }

  writeOutActionDumps() {
    if (this.destroyed) {
      throw new Error(
        'PageAgent has been destroyed. Cannot update report file.',
      );
    }
    const { generateReport, autoPrintReportMsg } = this.opts;
    this.reportFile = writeLogFile({
      fileName: this.reportFileName!,
      fileExt: groupedActionDumpFileExt,
      fileContent: this.dumpDataString(),
      type: 'dump',
      generateReport,
    });
    debug('writeOutActionDumps', this.reportFile);
    if (generateReport && autoPrintReportMsg && this.reportFile) {
      printReportMsg(this.reportFile);
    }
  }

  private async callbackOnTaskStartTip(task: ExecutionTask) {
    const param = paramStr(task);
    const tip = param ? `${typeStr(task)} - ${param}` : typeStr(task);

    if (this.onTaskStartTip) {
      await this.onTaskStartTip(tip);
    }
  }

  private async afterTaskRunning(executor: Executor, doNotThrowError = false) {
    this.appendExecutionDump(executor.dump());

    try {
      await this.onDumpUpdate?.(this.dumpDataString());
    } catch (error) {
      console.error('Error in onDumpUpdate', error);
    }

    this.writeOutActionDumps();

    if (executor.isInErrorState() && !doNotThrowError) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.errorMessage}\n${errorTask?.errorStack}`, {
        cause: errorTask?.error,
      });
    }
  }

  private buildDetailedLocateParam(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): DetailedLocateParam {
    assert(locatePrompt, 'missing locate prompt');

    if (typeof opt === 'object' && opt !== null) {
      const prompt = locatePrompt;
      const deepThink = opt.deepThink ?? false;
      const cacheable = opt.cacheable ?? true;
      const xpath = opt.xpath;

      return {
        prompt,
        deepThink,
        cacheable,
        xpath,
      };
    }

    return {
      prompt: locatePrompt,
    };
  }

  async callActionInActionSpace<T = any>(
    type: string,
    locatePrompt?: TUserPrompt,
    opt?: LocateOption, // and all other action params
  ) {
    debug('callActionInActionSpace', type, ',', locatePrompt, ',', opt);

    const actionPlan: PlanningAction<T> = {
      type: type as any,
      param: opt as any,
      thought: '',
    };

    const plans: PlanningAction[] = [actionPlan].filter(
      Boolean,
    ) as PlanningAction[];

    // TODO: this should be a 'titleForTask' function
    const locateParam = locatePrompt
      ? this.buildDetailedLocateParam(locatePrompt, opt)
      : undefined;
    const title = taskTitleStr(type as any, locateParamStr(locateParam));

    const { executor } = await this.taskExecutor.runPlans(title, plans, {
      cacheable: opt?.cacheable,
    });
    await this.afterTaskRunning(executor);
  }

  async aiTap(locatePrompt: TUserPrompt, opt?: LocateOption) {
    return this.callActionInActionSpace('Tap', locatePrompt, opt);
  }

  async aiRightClick(locatePrompt: TUserPrompt, opt?: LocateOption) {
    return this.callActionInActionSpace('RightClick', locatePrompt, opt);
  }

  async aiHover(locatePrompt: TUserPrompt, opt?: LocateOption) {
    return this.callActionInActionSpace('Hover', locatePrompt, opt);
  }

  // New signature, always use locatePrompt as the first param
  async aiInput(
    locatePrompt: TUserPrompt,
    opt: AndroidDeviceInputOpt & LocateOption & { value: string },
  ): Promise<any>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiInput(locatePrompt, opt) instead where opt contains the value
   */
  async aiInput(
    value: string,
    locatePrompt: TUserPrompt,
    opt?: AndroidDeviceInputOpt & LocateOption,
  ): Promise<any>;

  // Implementation
  async aiInput(
    locatePromptOrValue: TUserPrompt | string,
    locatePromptOrOpt:
      | TUserPrompt
      | (AndroidDeviceInputOpt & LocateOption & { value: string })
      | undefined,
    optOrUndefined?: AndroidDeviceInputOpt & LocateOption,
  ) {
    let value: string;
    let locatePrompt: TUserPrompt;
    let opt:
      | (AndroidDeviceInputOpt & LocateOption & { value: string })
      | undefined;

    // Check if using new signature (first param is locatePrompt, second has value)
    if (
      typeof locatePromptOrOpt === 'object' &&
      locatePromptOrOpt !== null &&
      'value' in locatePromptOrOpt
    ) {
      // New signature: aiInput(locatePrompt, opt)
      locatePrompt = locatePromptOrValue as TUserPrompt;
      const optWithValue = locatePromptOrOpt as AndroidDeviceInputOpt &
        LocateOption & { value: string };
      value = optWithValue.value;
      opt = optWithValue;
    } else {
      // Legacy signature: aiInput(value, locatePrompt, opt)
      value = locatePromptOrValue as string;
      locatePrompt = locatePromptOrOpt as TUserPrompt;
      opt = {
        ...optOrUndefined,
        value,
      };
    }

    assert(
      typeof value === 'string',
      'input value must be a string, use empty string if you want to clear the input',
    );
    assert(locatePrompt, 'missing locate prompt for input');
    return this.callActionInActionSpace('Input', locatePrompt, opt);
  }

  // New signature
  async aiKeyboardPress(
    locatePrompt: TUserPrompt,
    opt: LocateOption & { keyName: string },
  ): Promise<any>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiKeyboardPress(locatePrompt, opt) instead where opt contains the keyName
   */
  async aiKeyboardPress(
    keyName: string,
    locatePrompt?: TUserPrompt,
    opt?: LocateOption,
  ): Promise<any>;

  // Implementation
  async aiKeyboardPress(
    locatePromptOrKeyName: TUserPrompt | string,
    locatePromptOrOpt:
      | TUserPrompt
      | (LocateOption & { keyName: string })
      | undefined,
    optOrUndefined?: LocateOption,
  ) {
    let keyName: string;
    let locatePrompt: TUserPrompt | undefined;
    let opt: (LocateOption & { keyName: string }) | undefined;

    // Check if using new signature (first param is locatePrompt, second has keyName)
    if (
      typeof locatePromptOrOpt === 'object' &&
      locatePromptOrOpt !== null &&
      'keyName' in locatePromptOrOpt
    ) {
      // New signature: aiKeyboardPress(locatePrompt, opt)
      locatePrompt = locatePromptOrKeyName as TUserPrompt;
      opt = locatePromptOrOpt as LocateOption & {
        keyName: string;
      };
    } else {
      // Legacy signature: aiKeyboardPress(keyName, locatePrompt, opt)
      keyName = locatePromptOrKeyName as string;
      locatePrompt = locatePromptOrOpt as TUserPrompt | undefined;
      opt = {
        ...(optOrUndefined || {}),
        keyName,
      };
    }

    assert(opt?.keyName, 'missing keyName for keyboard press');
    return this.callActionInActionSpace('KeyboardPress', locatePrompt, opt);
  }

  // New signature
  async aiScroll(
    locatePrompt: TUserPrompt | undefined,
    opt: LocateOption & ScrollParam,
  ): Promise<any>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiScroll(locatePrompt, opt) instead where opt contains the scroll parameters
   */
  async aiScroll(
    scrollParam: ScrollParam,
    locatePrompt?: TUserPrompt,
    opt?: LocateOption,
  ): Promise<any>;

  // Implementation
  async aiScroll(
    locatePromptOrScrollParam: TUserPrompt | ScrollParam | undefined,
    locatePromptOrOpt: TUserPrompt | (LocateOption & ScrollParam) | undefined,
    optOrUndefined?: LocateOption,
  ) {
    let scrollParam: ScrollParam;
    let locatePrompt: TUserPrompt | undefined;
    let opt: LocateOption | undefined;

    // Check if using new signature (first param is locatePrompt, second has scroll params)
    if (
      typeof locatePromptOrOpt === 'object' &&
      ('direction' in locatePromptOrOpt ||
        'scrollType' in locatePromptOrOpt ||
        'distance' in locatePromptOrOpt)
    ) {
      // New signature: aiScroll(locatePrompt, opt)
      locatePrompt = locatePromptOrScrollParam as TUserPrompt;
      opt = locatePromptOrOpt as LocateOption & ScrollParam;
    } else {
      // Legacy signature: aiScroll(scrollParam, locatePrompt, opt)
      scrollParam = locatePromptOrScrollParam as ScrollParam;
      locatePrompt = locatePromptOrOpt as TUserPrompt | undefined;
      opt = {
        ...(optOrUndefined || {}),
        ...(scrollParam || {}),
      };
    }

    return this.callActionInActionSpace('Scroll', locatePrompt, opt);
  }

  async aiAction(
    taskPrompt: string,
    opt?: {
      cacheable?: boolean;
    },
  ) {
    const cacheable = opt?.cacheable;
    // if vlm-ui-tars, plan cache is not used
    const isVlmUiTars = vlLocateMode() === 'vlm-ui-tars';
    const matchedCache =
      isVlmUiTars || cacheable === false
        ? undefined
        : this.taskCache?.matchPlanCache(taskPrompt);
    if (matchedCache && this.taskCache?.isCacheResultUsed) {
      // log into report file
      const { executor } = await this.taskExecutor.loadYamlFlowAsPlanning(
        taskPrompt,
        matchedCache.cacheContent?.yamlWorkflow,
      );

      await await this.afterTaskRunning(executor);

      debug('matched cache, will call .runYaml to run the action');
      const yaml = matchedCache.cacheContent?.yamlWorkflow;
      return this.runYaml(yaml);
    }

    const { output, executor } = await (isVlmUiTars
      ? this.taskExecutor.actionToGoal(taskPrompt, { cacheable })
      : this.taskExecutor.action(taskPrompt, this.opts.aiActionContext, {
          cacheable,
        }));

    // update cache
    if (this.taskCache && output?.yamlFlow && cacheable !== false) {
      const yamlContent: MidsceneYamlScript = {
        tasks: [
          {
            name: taskPrompt,
            flow: output.yamlFlow,
          },
        ],
      };
      const yamlFlowStr = yaml.dump(yamlContent);
      this.taskCache.updateOrAppendCacheRecord(
        {
          type: 'plan',
          prompt: taskPrompt,
          yamlWorkflow: yamlFlowStr,
        },
        matchedCache,
      );
    }

    await this.afterTaskRunning(executor);
    return output;
  }

  async aiQuery(
    demand: InsightExtractParam,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.query(demand, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.boolean(prompt, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiNumber(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.number(prompt, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiString(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.string(prompt, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiAsk(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    return this.aiString(prompt, opt);
  }

  async describeElementAtPoint(
    center: [number, number],
    opt?: {
      verifyPrompt?: boolean;
      retryLimit?: number;
      deepThink?: boolean;
    } & LocatorValidatorOption,
  ): Promise<AgentDescribeElementAtPointResult> {
    const { verifyPrompt = true, retryLimit = 3 } = opt || {};

    let success = false;
    let retryCount = 0;
    let resultPrompt = '';
    let deepThink = opt?.deepThink || false;
    let verifyResult: LocateValidatorResult | undefined;

    while (!success && retryCount < retryLimit) {
      if (retryCount >= 2) {
        deepThink = true;
      }
      debug(
        'aiDescribe',
        center,
        'verifyPrompt',
        verifyPrompt,
        'retryCount',
        retryCount,
        'deepThink',
        deepThink,
      );
      const text = await this.insight.describe(center, { deepThink });
      debug('aiDescribe text', text);
      assert(text.description, `failed to describe element at [${center}]`);
      resultPrompt = text.description;

      verifyResult = await this.verifyLocator(
        resultPrompt,
        deepThink ? { deepThink: true } : undefined,
        center,
        opt,
      );
      if (verifyResult.pass) {
        success = true;
      } else {
        retryCount++;
      }
    }

    return {
      prompt: resultPrompt,
      deepThink,
      verifyResult,
    };
  }

  async verifyLocator(
    prompt: string,
    locateOpt: LocateOption | undefined,
    expectCenter: [number, number],
    verifyLocateOption?: LocatorValidatorOption,
  ): Promise<LocateValidatorResult> {
    debug('verifyLocator', prompt, locateOpt, expectCenter, verifyLocateOption);

    const { center: verifyCenter, rect: verifyRect } = await this.aiLocate(
      prompt,
      locateOpt,
    );
    const distance = distanceOfTwoPoints(expectCenter, verifyCenter);
    const included = includedInRect(expectCenter, verifyRect);
    const pass =
      distance <= (verifyLocateOption?.centerDistanceThreshold || 20) ||
      included;
    const verifyResult = {
      pass,
      rect: verifyRect,
      center: verifyCenter,
      centerDistance: distance,
    };
    debug('aiDescribe verifyResult', verifyResult);
    return verifyResult;
  }

  async aiLocate(prompt: TUserPrompt, opt?: LocateOption) {
    const locateParam = this.buildDetailedLocateParam(prompt, opt);
    const locatePlan = locatePlanForLocate(locateParam);
    const plans = [locatePlan];
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(locateParam)),
      plans,
      { cacheable: opt?.cacheable },
    );
    await this.afterTaskRunning(executor);

    const { element } = output;

    return {
      rect: element?.rect,
      center: element?.center,
      scale: (await this.page.size()).dpr,
    } as Pick<LocateResultElement, 'rect' | 'center'> & {
      scale: number;
    };
  }

  async aiAssert(assertion: TUserPrompt, msg?: string, opt?: AgentAssertOpt) {
    const { output, executor, thought } = await this.taskExecutor.assert(
      assertion,
      {
        returnThought: true,
      },
    );
    await this.afterTaskRunning(executor, true);

    if (opt?.keepRawResponse) {
      return {
        pass: output,
        thought,
      };
    }

    if (!output) {
      const errMsg = msg || `Assertion failed: ${assertion}`;
      const reasonMsg = `Reason: ${
        thought || executor.latestErrorTask()?.error || '(no_reason)'
      }`;
      throw new Error(`${errMsg}\n${reasonMsg}`);
    }
  }

  async aiWaitFor(assertion: string, opt?: AgentWaitForOpt) {
    const { executor } = await this.taskExecutor.waitFor(assertion, {
      timeoutMs: opt?.timeoutMs || 15 * 1000,
      checkIntervalMs: opt?.checkIntervalMs || 3 * 1000,
      assertion,
    });
    await this.afterTaskRunning(executor, true);

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
  }

  async ai(taskPrompt: string, type = 'action') {
    if (type === 'action') {
      return this.aiAction(taskPrompt);
    }
    if (type === 'query') {
      return this.aiQuery(taskPrompt);
    }

    if (type === 'assert') {
      return this.aiAssert(taskPrompt);
    }

    if (type === 'tap') {
      return this.aiTap(taskPrompt);
    }

    if (type === 'rightClick') {
      return this.aiRightClick(taskPrompt);
    }

    throw new Error(
      `Unknown type: ${type}, only support 'action', 'query', 'assert', 'tap', 'rightClick'`,
    );
  }

  async runYaml(yamlScriptContent: string): Promise<{
    result: Record<string, any>;
  }> {
    const script = parseYamlScript(yamlScriptContent, 'yaml', true);
    const actionSpace = await this.page.actionSpace();
    const player = new ScriptPlayer(script, async (target) => {
      return { agent: this, freeFn: [] };
    });
    await player.run();

    if (player.status === 'error') {
      const errors = player.taskStatusList
        .filter((task) => task.status === 'error')
        .map((task) => {
          return `task - ${task.name}: ${task.error?.message}`;
        })
        .join('\n');
      throw new Error(`Error(s) occurred in running yaml script:\n${errors}`);
    }

    return {
      result: player.result,
    };
  }

  async evaluateJavaScript(script: string) {
    assert(
      this.page.evaluateJavaScript,
      'evaluateJavaScript is not supported in current agent',
    );
    return this.page.evaluateJavaScript(script);
  }

  async destroy() {
    await this.page.destroy();
    this.resetDump(); // reset dump to release memory
    this.destroyed = true;
  }

  async logScreenshot(
    title?: string,
    opt?: {
      content: string;
    },
  ) {
    // 1. screenshot
    const base64 = await this.page.screenshotBase64();
    const now = Date.now();
    // 2. build recorder
    const recorder: ExecutionRecorderItem[] = [
      {
        type: 'screenshot',
        ts: now,
        screenshot: base64,
      },
    ];
    // 3. build ExecutionTaskLog
    const task: ExecutionTaskLog = {
      type: 'Log',
      subType: 'Screenshot',
      status: 'finished',
      recorder,
      timing: {
        start: now,
        end: now,
        cost: 0,
      },
      param: {
        content: opt?.content || '',
      },
      executor: async () => {},
    };
    // 4. build ExecutionDump
    const executionDump: ExecutionDump = {
      sdkVersion: '',
      logTime: now,
      name: `Log - ${title || 'untitled'}`,
      description: opt?.content || '',
      tasks: [task],
    };
    // 5. append to execution dump
    this.appendExecutionDump(executionDump);

    try {
      this.onDumpUpdate?.(this.dumpDataString());
    } catch (error) {
      console.error('Failed to update dump', error);
    }

    this.writeOutActionDumps();
  }

  _unstableLogContent() {
    const { groupName, groupDescription, executions } = this.dump;
    const newExecutions = Array.isArray(executions)
      ? executions.map((execution: any) => {
          const { tasks, ...restExecution } = execution;
          let newTasks = tasks;
          if (Array.isArray(tasks)) {
            newTasks = tasks.map((task: any) => {
              // only remove pageContext and log from task
              const { pageContext, log, ...restTask } = task;
              return restTask;
            });
          }
          return { ...restExecution, ...(newTasks ? { tasks: newTasks } : {}) };
        })
      : [];
    return {
      groupName,
      groupDescription,
      executions: newExecutions,
    };
  }

  /**
   * Freezes the current page context to be reused in subsequent AI operations
   * This avoids recalculating page context for each operation
   */
  async freezePageContext(): Promise<void> {
    debug('Freezing page context');
    const context = await this._snapshotContext();
    // Mark the context as frozen
    context._isFrozen = true;
    this.frozenPageContext = context;
    debug('Page context frozen successfully');
  }

  /**
   * Unfreezes the page context, allowing AI operations to calculate context dynamically
   */
  async unfreezePageContext(): Promise<void> {
    debug('Unfreezing page context');
    this.frozenPageContext = undefined;
    debug('Page context unfrozen successfully');
  }
}
