import type { WebPage } from '@/common/page';
import {
  type AgentAssertOpt,
  type AgentDescribeElementAtPointResult,
  type AgentWaitForOpt,
  type DetailedLocateParam,
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
  type PlanningActionParamScroll,
  type Rect,
} from '@midscene/core';

import yaml from 'js-yaml';

import { ScriptPlayer, parseYamlScript } from '@/yaml/index';
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
import { getAIConfigInBoolean, vlLocateMode } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { PageTaskExecutor } from '../common/tasks';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';
import type { WebElementInfo } from '../web-element';
import type { AndroidDeviceInputOpt } from './page';
import { buildPlans } from './plan-builder';
import { TaskCache } from './task-cache';
import {
  locateParamStr,
  paramStr,
  scrollParamStr,
  taskTitleStr,
  typeStr,
} from './ui-utils';
import { getReportFileName, printReportMsg } from './utils';
import { type WebUIContext, parseContextFromWebPage } from './utils';
import { trimContextByViewport } from './utils';

const debug = getDebug('web-integration');

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
    this.reportFileName = getReportFileName(
      opts?.testId || this.page.pageType || 'web',
    );
  }

  async getUIContext(action?: InsightAction): Promise<WebUIContext> {
    if (action && (action === 'extract' || action === 'assert')) {
      return await parseContextFromWebPage(this.page, {
        ignoreMarker: true,
      });
    }
    return await parseContextFromWebPage(this.page, {
      ignoreMarker: !!vlLocateMode(),
    });
  }

  async setAIActionContext(prompt: string) {
    this.opts.aiActionContext = prompt;
  }

  resetDump() {
    this.dump = {
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
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
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
  }

  private buildDetailedLocateParam(
    locatePrompt: string,
    opt?: LocateOption,
  ): DetailedLocateParam {
    assert(locatePrompt, 'missing locate prompt');
    if (typeof opt === 'object') {
      const prompt = opt.prompt ?? locatePrompt;
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

  async aiTap(locatePrompt: string, opt?: LocateOption) {
    const detailedLocateParam = this.buildDetailedLocateParam(
      locatePrompt,
      opt,
    );
    const plans = buildPlans('Tap', detailedLocateParam);
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Tap', locateParamStr(detailedLocateParam)),
      plans,
      { cacheable: opt?.cacheable },
    );
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiRightClick(locatePrompt: string, opt?: LocateOption) {
    const detailedLocateParam = this.buildDetailedLocateParam(
      locatePrompt,
      opt,
    );
    const plans = buildPlans('RightClick', detailedLocateParam);
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('RightClick', locateParamStr(detailedLocateParam)),
      plans,
      { cacheable: opt?.cacheable },
    );
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiHover(locatePrompt: string, opt?: LocateOption) {
    const detailedLocateParam = this.buildDetailedLocateParam(
      locatePrompt,
      opt,
    );
    const plans = buildPlans('Hover', detailedLocateParam);
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Hover', locateParamStr(detailedLocateParam)),
      plans,
      { cacheable: opt?.cacheable },
    );
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiInput(
    value: string,
    locatePrompt: string,
    opt?: AndroidDeviceInputOpt & LocateOption,
  ) {
    assert(
      typeof value === 'string',
      'input value must be a string, use empty string if you want to clear the input',
    );
    assert(locatePrompt, 'missing locate prompt for input');
    const detailedLocateParam = this.buildDetailedLocateParam(
      locatePrompt,
      opt,
    );
    const plans = buildPlans('Input', detailedLocateParam, {
      value,
      autoDismissKeyboard: opt?.autoDismissKeyboard,
    });
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Input', locateParamStr(detailedLocateParam)),
      plans,
      {
        cacheable: opt?.cacheable,
      },
    );
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiKeyboardPress(
    keyName: string,
    locatePrompt?: string,
    opt?: LocateOption,
  ) {
    assert(keyName, 'missing keyName for keyboard press');
    const detailedLocateParam = locatePrompt
      ? this.buildDetailedLocateParam(locatePrompt, opt)
      : undefined;
    const plans = buildPlans('KeyboardPress', detailedLocateParam, {
      value: keyName,
    });
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('KeyboardPress', locateParamStr(detailedLocateParam)),
      plans,
      { cacheable: opt?.cacheable },
    );
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiScroll(
    scrollParam: PlanningActionParamScroll,
    locatePrompt?: string,
    opt?: LocateOption,
  ) {
    const detailedLocateParam = locatePrompt
      ? this.buildDetailedLocateParam(locatePrompt, opt)
      : undefined;
    const plans = buildPlans('Scroll', detailedLocateParam, scrollParam);
    const paramInTitle = locatePrompt
      ? `${locateParamStr(detailedLocateParam)} - ${scrollParamStr(scrollParam)}`
      : scrollParamStr(scrollParam);
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Scroll', paramInTitle),
      plans,
      { cacheable: opt?.cacheable },
    );
    await this.afterTaskRunning(executor);
    return output;
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
    prompt: string,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.boolean(prompt, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiNumber(
    prompt: string,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.number(prompt, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiString(
    prompt: string,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ) {
    const { output, executor } = await this.taskExecutor.string(prompt, opt);
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiAsk(
    prompt: string,
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

  async aiLocate(prompt: string, opt?: LocateOption) {
    const detailedLocateParam = this.buildDetailedLocateParam(prompt, opt);
    const plans = buildPlans('Locate', detailedLocateParam);
    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(detailedLocateParam)),
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

  async aiAssert(assertion: string, msg?: string, opt?: AgentAssertOpt) {
    const { output, executor } = await this.taskExecutor.assert(assertion);
    await this.afterTaskRunning(executor, true);

    if (output && opt?.keepRawResponse) {
      return output;
    }

    if (!output?.pass) {
      const errMsg = msg || `Assertion failed: ${assertion}`;
      const reasonMsg = `Reason: ${
        output?.thought || executor.latestErrorTask()?.error || '(no_reason)'
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
      model_name: '',
      model_description: '',
      name: `Log - ${title || 'untitled'}`,
      description: opt?.content || '',
      tasks: [task],
    };
    // 5. append to execution dump
    this.appendExecutionDump(executionDump);
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
}
