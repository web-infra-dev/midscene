import {
  type AgentAssertOpt,
  type AgentDescribeElementAtPointResult,
  type AgentWaitForOpt,
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
  type Rect,
  type ScrollParam,
  type TUserPrompt,
  type UIContext,
} from '../index';

import yaml from 'js-yaml';

import {
  groupedActionDumpFileExt,
  reportHTMLContent,
  stringifyDumpData,
  writeLogFile,
} from '@/utils';
import {
  ScriptPlayer,
  buildDetailedLocateParam,
  parseYamlScript,
} from '../yaml/index';

import type { AbstractInterface } from '@/device';
import type { AgentOpt } from '@/types';
import {
  MIDSCENE_CACHE,
  ModelConfigManager,
  globalConfigManager,
  globalModelConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
// import type { AndroidDeviceInputOpt } from '../device';
import { TaskCache } from './task-cache';
import { TaskExecutor, locatePlanForLocate } from './tasks';
import { locateParamStr, paramStr, taskTitleStr, typeStr } from './ui-utils';
import {
  commonContextParser,
  getReportFileName,
  parsePrompt,
  printReportMsg,
} from './utils';
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

export class Agent<
  InterfaceType extends AbstractInterface = AbstractInterface,
> {
  interface: InterfaceType;

  insight: Insight;

  dump: GroupedActionDump;

  reportFile?: string | null;

  reportFileName?: string;

  taskExecutor: TaskExecutor;

  opts: AgentOpt;

  /**
   * If true, the agent will not perform any actions
   */
  dryMode = false;

  onTaskStartTip?: OnTaskStartTip;

  taskCache?: TaskCache;

  onDumpUpdate?: (dump: string) => void;

  destroyed = false;

  modelConfigManager: ModelConfigManager;

  /**
   * Frozen page context for consistent AI operations
   */
  private frozenUIContext?: UIContext;

  /**
   * Flag to track if VL model warning has been shown
   */
  private hasWarnedNonVLModel = false;

  // @deprecated use .interface instead
  get page() {
    return this.interface;
  }

  /**
   * Ensures VL model warning is shown once when needed
   */
  private ensureVLModelWarning() {
    if (
      !this.hasWarnedNonVLModel &&
      this.interface.interfaceType !== 'puppeteer' &&
      this.interface.interfaceType !== 'playwright' &&
      this.interface.interfaceType !== 'static' &&
      this.interface.interfaceType !== 'chrome-extension-proxy'
    ) {
      this.modelConfigManager.throwErrorIfNonVLModel();
      this.hasWarnedNonVLModel = true;
    }
  }

  constructor(interfaceInstance: InterfaceType, opts?: AgentOpt) {
    this.interface = interfaceInstance;
    this.opts = Object.assign(
      {
        generateReport: true,
        autoPrintReportMsg: true,
        groupName: 'Midscene Report',
        groupDescription: '',
      },
      opts || {},
    );

    if (opts?.modelConfig && typeof opts?.modelConfig !== 'function') {
      throw new Error(
        `opts.modelConfig must be one of function or undefined, but got ${typeof opts?.modelConfig}`,
      );
    }
    this.modelConfigManager = opts?.modelConfig
      ? new ModelConfigManager(opts.modelConfig)
      : globalModelConfigManager;

    this.onTaskStartTip = this.opts.onTaskStartTip;

    this.insight = new Insight(async (action: InsightAction) => {
      return this.getUIContext(action);
    });

    // Process cache configuration
    const cacheConfig = this.processCacheConfig(opts || {});
    if (cacheConfig) {
      this.taskCache = new TaskCache(
        cacheConfig.id,
        cacheConfig.enabled,
        undefined, // cacheFilePath
        cacheConfig.readOnly,
      );
    }

    this.taskExecutor = new TaskExecutor(this.interface, this.insight, {
      taskCache: this.taskCache,
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
      replanningCycleLimit: this.opts.replanningCycleLimit,
    });
    this.dump = this.resetDump();
    this.reportFileName =
      opts?.reportFileName ||
      getReportFileName(opts?.testId || this.interface.interfaceType || 'web');
  }

  async getActionSpace(): Promise<DeviceAction[]> {
    return this.interface.actionSpace();
  }

  async getUIContext(action?: InsightAction): Promise<UIContext> {
    // Check VL model configuration when UI context is first needed
    this.ensureVLModelWarning();

    // If page context is frozen, return the frozen context for all actions
    if (this.frozenUIContext) {
      debug('Using frozen page context for action:', action);
      return this.frozenUIContext;
    }

    if (this.interface.getContext) {
      debug('Using page.getContext for action:', action);
      return await this.interface.getContext();
    } else {
      debug('Using commonContextParser for action:', action);
      return await commonContextParser(this.interface, {
        uploadServerUrl: this.modelConfigManager.getUploadTestServerUrl(),
      });
    }
  }

  async _snapshotContext(): Promise<UIContext> {
    return await this.getUIContext('locate');
  }

  async setAIActionContext(prompt: string) {
    if (this.opts.aiActionContext) {
      console.warn(
        'aiActionContext is already set, and it is called again, will override the previous setting',
      );
    }
    this.opts.aiActionContext = prompt;
  }

  resetDump() {
    this.dump = {
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      executions: [],
      modelBriefs: [],
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
      if (this.onDumpUpdate) {
        this.onDumpUpdate(this.dumpDataString());
      }
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

  async callActionInActionSpace<T = any>(
    type: string,
    opt?: T, // and all other action params
  ) {
    debug('callActionInActionSpace', type, ',', opt);

    const actionPlan: PlanningAction<T> = {
      type: type as any,
      param: (opt as any) || {},
      thought: '',
    };
    debug('actionPlan', actionPlan); // , ', in which the locateParam is', locateParam);

    const plans: PlanningAction[] = [actionPlan].filter(
      Boolean,
    ) as PlanningAction[];

    const title = taskTitleStr(
      type as any,
      locateParamStr((opt as any)?.locate || {}),
    );

    // assume all operation in action space is related to locating
    const modelConfig = this.modelConfigManager.getModelConfig('grounding');

    const { output, executor } = await this.taskExecutor.runPlans(
      title,
      plans,
      modelConfig,
    );
    await this.afterTaskRunning(executor);
    return output;
  }

  async aiTap(locatePrompt: TUserPrompt, opt?: LocateOption) {
    assert(locatePrompt, 'missing locate prompt for tap');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    return this.callActionInActionSpace('Tap', {
      locate: detailedLocateParam,
    });
  }

  async aiRightClick(locatePrompt: TUserPrompt, opt?: LocateOption) {
    assert(locatePrompt, 'missing locate prompt for right click');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    return this.callActionInActionSpace('RightClick', {
      locate: detailedLocateParam,
    });
  }

  async aiDoubleClick(locatePrompt: TUserPrompt, opt?: LocateOption) {
    assert(locatePrompt, 'missing locate prompt for double click');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    return this.callActionInActionSpace('DoubleClick', {
      locate: detailedLocateParam,
    });
  }

  async aiHover(locatePrompt: TUserPrompt, opt?: LocateOption) {
    assert(locatePrompt, 'missing locate prompt for hover');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    return this.callActionInActionSpace('Hover', {
      locate: detailedLocateParam,
    });
  }

  // New signature, always use locatePrompt as the first param
  async aiInput(
    locatePrompt: TUserPrompt,
    opt: LocateOption & { value: string } & {
      autoDismissKeyboard?: boolean;
      duplicatePaste?: boolean;
    },
  ): Promise<any>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiInput(locatePrompt, opt) instead where opt contains the value
   */
  async aiInput(
    value: string,
    locatePrompt: TUserPrompt,
    opt?: LocateOption & {
      autoDismissKeyboard?: boolean;
      duplicatePaste?: boolean;
    }, // AndroidDeviceInputOpt &
  ): Promise<any>;

  // Implementation
  async aiInput(
    locatePromptOrValue: TUserPrompt | string,
    locatePromptOrOpt:
      | TUserPrompt
      | (LocateOption & { value: string } & {
          autoDismissKeyboard?: boolean;
          duplicatePaste?: boolean;
        }) // AndroidDeviceInputOpt &
      | undefined,
    optOrUndefined?: LocateOption, // AndroidDeviceInputOpt &
  ) {
    let value: string;
    let locatePrompt: TUserPrompt;
    let opt:
      | (LocateOption & { value: string } & {
          autoDismissKeyboard?: boolean;
          duplicatePaste?: boolean;
        }) // AndroidDeviceInputOpt &
      | undefined;

    // Check if using new signature (first param is locatePrompt, second has value)
    if (
      typeof locatePromptOrOpt === 'object' &&
      locatePromptOrOpt !== null &&
      'value' in locatePromptOrOpt
    ) {
      // New signature: aiInput(locatePrompt, opt)
      locatePrompt = locatePromptOrValue as TUserPrompt;
      const optWithValue = locatePromptOrOpt as LocateOption & {
        // AndroidDeviceInputOpt &
        value: string;
        autoDismissKeyboard?: boolean;
        duplicatePaste?: boolean;
      };
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

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    return this.callActionInActionSpace('Input', {
      ...(opt || {}),
      locate: detailedLocateParam,
    });
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

    const detailedLocateParam = locatePrompt
      ? buildDetailedLocateParam(locatePrompt, opt)
      : undefined;

    return this.callActionInActionSpace('KeyboardPress', {
      ...(opt || {}),
      locate: detailedLocateParam,
    });
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

    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt || '',
      opt,
    );

    return this.callActionInActionSpace('Scroll', {
      ...(opt || {}),
      locate: detailedLocateParam,
    });
  }

  async aiAction(
    taskPrompt: string,
    opt?: {
      cacheable?: boolean;
    },
  ) {
    const modelConfig = this.modelConfigManager.getModelConfig('planning');

    const cacheable = opt?.cacheable;
    // if vlm-ui-tars, plan cache is not used
    const isVlmUiTars = modelConfig.vlMode === 'vlm-ui-tars';
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

      await this.afterTaskRunning(executor);

      debug('matched cache, will call .runYaml to run the action');
      const yaml = matchedCache.cacheContent?.yamlWorkflow;
      return this.runYaml(yaml);
    }

    const { output, executor } = await this.taskExecutor.action(
      taskPrompt,
      modelConfig,
      this.opts.aiActionContext,
    );

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

  async aiQuery<ReturnType = any>(
    demand: InsightExtractParam,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ): Promise<ReturnType> {
    const modelConfig = this.modelConfigManager.getModelConfig('VQA');
    const { output, executor } =
      await this.taskExecutor.createTypeQueryExecution(
        'Query',
        demand,
        modelConfig,
        opt,
      );
    await this.afterTaskRunning(executor);
    return output as ReturnType;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ): Promise<boolean> {
    const modelConfig = this.modelConfigManager.getModelConfig('VQA');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output, executor } =
      await this.taskExecutor.createTypeQueryExecution(
        'Boolean',
        textPrompt,
        modelConfig,
        opt,
        multimodalPrompt,
      );
    await this.afterTaskRunning(executor);
    return output as boolean;
  }

  async aiNumber(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ): Promise<number> {
    const modelConfig = this.modelConfigManager.getModelConfig('VQA');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output, executor } =
      await this.taskExecutor.createTypeQueryExecution(
        'Number',
        textPrompt,
        modelConfig,
        opt,
        multimodalPrompt,
      );
    await this.afterTaskRunning(executor);
    return output as number;
  }

  async aiString(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ): Promise<string> {
    const modelConfig = this.modelConfigManager.getModelConfig('VQA');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output, executor } =
      await this.taskExecutor.createTypeQueryExecution(
        'String',
        textPrompt,
        modelConfig,
        opt,
        multimodalPrompt,
      );
    await this.afterTaskRunning(executor);
    return output as string;
  }

  async aiAsk(
    prompt: TUserPrompt,
    opt: InsightExtractOption = defaultInsightExtractOption,
  ): Promise<string> {
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
      // use same intent as aiLocate
      const modelConfig = this.modelConfigManager.getModelConfig('grounding');

      const text = await this.insight.describe(center, modelConfig, {
        deepThink,
      });
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
    const locateParam = buildDetailedLocateParam(prompt, opt);
    assert(locateParam, 'cannot get locate param for aiLocate');
    const locatePlan = locatePlanForLocate(locateParam);
    const plans = [locatePlan];
    const modelConfig = this.modelConfigManager.getModelConfig('grounding');

    const { executor, output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(locateParam)),
      plans,
      modelConfig,
    );
    await this.afterTaskRunning(executor);

    const { element } = output;

    return {
      rect: element?.rect,
      center: element?.center,
      scale: (await this.interface.size()).dpr,
    } as Pick<LocateResultElement, 'rect' | 'center'> & {
      scale: number;
    };
  }

  async aiAssert(
    assertion: TUserPrompt,
    msg?: string,
    opt?: AgentAssertOpt & InsightExtractOption,
  ) {
    const modelConfig = this.modelConfigManager.getModelConfig('VQA');

    const insightOpt: InsightExtractOption = {
      domIncluded: opt?.domIncluded ?? defaultInsightExtractOption.domIncluded,
      screenshotIncluded:
        opt?.screenshotIncluded ??
        defaultInsightExtractOption.screenshotIncluded,
      isWaitForAssert: opt?.isWaitForAssert,
      doNotThrowError: opt?.doNotThrowError,
    };

    const { output, executor, thought } = await this.taskExecutor.assert(
      assertion,
      modelConfig,
      insightOpt,
    );
    await this.afterTaskRunning(executor, true);

    const message = output
      ? undefined
      : `Assertion failed: ${msg || (typeof assertion === 'string' ? assertion : assertion.prompt)}\nReason: ${
          thought || executor.latestErrorTask()?.error || '(no_reason)'
        }`;

    if (opt?.keepRawResponse) {
      return {
        pass: output,
        thought,
        message,
      };
    }

    if (!output) {
      throw new Error(message);
    }
  }

  async aiWaitFor(assertion: TUserPrompt, opt?: AgentWaitForOpt) {
    const modelConfig = this.modelConfigManager.getModelConfig('VQA');
    const { executor } = await this.taskExecutor.waitFor(
      assertion,
      {
        timeoutMs: opt?.timeoutMs || 15 * 1000,
        checkIntervalMs: opt?.checkIntervalMs || 3 * 1000,
      },
      modelConfig,
    );
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

    if (type === 'doubleClick') {
      return this.aiDoubleClick(taskPrompt);
    }

    throw new Error(
      `Unknown type: ${type}, only support 'action', 'query', 'assert', 'tap', 'rightClick', 'doubleClick'`,
    );
  }

  async runYaml(yamlScriptContent: string): Promise<{
    result: Record<string, any>;
  }> {
    const script = parseYamlScript(yamlScriptContent, 'yaml');
    const player = new ScriptPlayer(script, async () => {
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
      this.interface.evaluateJavaScript,
      'evaluateJavaScript is not supported in current agent',
    );
    return this.interface.evaluateJavaScript(script);
  }

  async destroy() {
    await this.interface.destroy?.();
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
    const base64 = await this.interface.screenshotBase64();
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
              // only remove uiContext and log from task
              const { uiContext, log, ...restTask } = task;
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
    this.frozenUIContext = context;
    debug('Page context frozen successfully');
  }

  /**
   * Unfreezes the page context, allowing AI operations to calculate context dynamically
   */
  async unfreezePageContext(): Promise<void> {
    debug('Unfreezing page context');
    this.frozenUIContext = undefined;
    debug('Page context unfrozen successfully');
  }

  /**
   * Process cache configuration and return normalized cache settings
   */
  private processCacheConfig(
    opts: AgentOpt,
  ): { id: string; enabled: boolean; readOnly: boolean } | null {
    // 1. New cache object configuration (highest priority)
    if (opts.cache !== undefined) {
      if (opts.cache === false) {
        return null; // Completely disable cache
      }

      if (opts.cache === true) {
        throw new Error(
          'cache: true requires an explicit cache ID. Please provide:\n' +
            'Example: cache: { id: "my-cache-id" }',
        );
      }

      // cache is object configuration
      if (typeof opts.cache === 'object') {
        const config = opts.cache;
        if (!config.id) {
          throw new Error(
            'cache configuration requires an explicit id. Please provide:\n' +
              'Example: cache: { id: "my-cache-id" }',
          );
        }
        const id = config.id;
        const isReadOnly = config.strategy === 'read-only';

        return {
          id,
          enabled: true,
          readOnly: isReadOnly,
        };
      }
    }

    // 2. Backward compatibility: support old cacheId (requires environment variable)
    if (opts.cacheId) {
      const envEnabled =
        globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE);
      if (envEnabled) {
        return {
          id: opts.cacheId,
          enabled: true,
          readOnly: false,
        };
      }
    }

    // 3. No cache configuration
    return null;
  }

  /**
   * Manually flush cache to file
   * Only meaningful in read-only mode, other modes will throw error
   */
  async flushCache(): Promise<void> {
    if (!this.taskCache) {
      throw new Error('Cache is not configured');
    }

    this.taskCache.flushCacheToFile();
  }
}

export const createAgent = (
  interfaceInstance: AbstractInterface,
  opts?: AgentOpt,
) => {
  return new Agent(interfaceInstance, opts);
};
