import {
  type ActionParam,
  type ActionReturn,
  type AgentAssertOpt,
  type AgentDescribeElementAtPointResult,
  type AgentOpt,
  type AgentWaitForOpt,
  type CacheConfig,
  type DeepThinkOption,
  type DeviceAction,
  type ExecutionDump,
  type ExecutionRecorderItem,
  type ExecutionTask,
  type ExecutionTaskLog,
  type ExecutionTaskPlanning,
  type GroupedActionDump,
  type LocateOption,
  type LocateResultElement,
  type LocateValidatorResult,
  type LocatorValidatorOption,
  type MidsceneYamlScript,
  type OnTaskStartTip,
  type PlanningAction,
  type Rect,
  type ScrollParam,
  Service,
  type ServiceAction,
  type ServiceExtractOption,
  type ServiceExtractParam,
  type TUserPrompt,
  type UIContext,
} from '../index';
export type TestStatus =
  | 'passed'
  | 'failed'
  | 'timedOut'
  | 'skipped'
  | 'interrupted';
import yaml from 'js-yaml';

import {
  getVersion,
  groupedActionDumpFileExt,
  processCacheConfig,
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
import type { TaskRunner } from '@/task-runner';
import {
  type IModelConfig,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  ModelConfigManager,
  globalConfigManager,
  globalModelConfigManager,
} from '@midscene/shared/env';
import { imageInfoOfBase64, resizeImgBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { defineActionAssert } from '../device';
// import type { AndroidDeviceInputOpt } from '../device';
import { TaskCache } from './task-cache';
import { TaskExecutionError, TaskExecutor, locatePlanForLocate } from './tasks';
import { locateParamStr, paramStr, taskTitleStr, typeStr } from './ui-utils';
import {
  commonContextParser,
  getReportFileName,
  parsePrompt,
  printReportMsg,
} from './utils';

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

const defaultServiceExtractOption: ServiceExtractOption = {
  domIncluded: false,
  screenshotIncluded: true,
};

type CacheStrategy = NonNullable<CacheConfig['strategy']>;

const CACHE_STRATEGIES: readonly CacheStrategy[] = [
  'read-only',
  'read-write',
  'write-only',
];

const isValidCacheStrategy = (strategy: string): strategy is CacheStrategy =>
  CACHE_STRATEGIES.some((value) => value === strategy);

const CACHE_STRATEGY_VALUES = CACHE_STRATEGIES.map(
  (value) => `"${value}"`,
).join(', ');

const legacyScrollTypeMap = {
  once: 'singleAction',
  untilBottom: 'scrollToBottom',
  untilTop: 'scrollToTop',
  untilRight: 'scrollToRight',
  untilLeft: 'scrollToLeft',
} as const;

type LegacyScrollType = keyof typeof legacyScrollTypeMap;

const normalizeScrollType = (
  scrollType: ScrollParam['scrollType'] | LegacyScrollType | undefined,
): ScrollParam['scrollType'] | undefined => {
  if (!scrollType) {
    return scrollType;
  }

  if (scrollType in legacyScrollTypeMap) {
    return legacyScrollTypeMap[scrollType as LegacyScrollType];
  }

  return scrollType as ScrollParam['scrollType'];
};

const defaultReplanningCycleLimit = 20;
const defaultVlmUiTarsReplanningCycleLimit = 40;

export type AiActOptions = {
  cacheable?: boolean;
  deepThink?: DeepThinkOption;
};

export class Agent<
  InterfaceType extends AbstractInterface = AbstractInterface,
> {
  interface: InterfaceType;

  service: Service;

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

  private dumpUpdateListeners: Array<
    (dump: string, executionDump?: ExecutionDump) => void
  > = [];

  get onDumpUpdate():
    | ((dump: string, executionDump?: ExecutionDump) => void)
    | undefined {
    return this.dumpUpdateListeners[0];
  }

  set onDumpUpdate(callback:
    | ((dump: string, executionDump?: ExecutionDump) => void)
    | undefined) {
    // Clear existing listeners
    this.dumpUpdateListeners = [];
    // Add callback to array if provided
    if (callback) {
      this.dumpUpdateListeners.push(callback);
    }
  }

  destroyed = false;

  modelConfigManager: ModelConfigManager;

  /**
   * Frozen page context for consistent AI operations
   */
  private frozenUIContext?: UIContext;

  private get aiActContext(): string | undefined {
    return this.opts.aiActContext ?? this.opts.aiActionContext;
  }

  /**
   * Flag to track if VL model warning has been shown
   */
  private hasWarnedNonVLModel = false;

  /**
   * Screenshot scale factor derived from actual screenshot dimensions
   */
  private screenshotScale?: number;

  /**
   * Internal promise to deduplicate screenshot scale computation
   */
  private screenshotScalePromise?: Promise<number>;

  private executionDumpIndexByRunner = new WeakMap<TaskRunner, number>();

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
      this.interface.interfaceType !== 'chrome-extension-proxy' &&
      this.interface.interfaceType !== 'page-over-chrome-extension-bridge'
    ) {
      this.modelConfigManager.throwErrorIfNonVLModel();
      this.hasWarnedNonVLModel = true;
    }
  }

  /**
   * Lazily compute the ratio between the physical screenshot width and the logical page width
   */
  private async getScreenshotScale(context: UIContext): Promise<number> {
    if (this.screenshotScale !== undefined) {
      return this.screenshotScale;
    }

    if (!this.screenshotScalePromise) {
      this.screenshotScalePromise = (async () => {
        const pageWidth = context.size?.width;
        assert(
          pageWidth && pageWidth > 0,
          `Invalid page width when computing screenshot scale: ${pageWidth}`,
        );

        debug('will get image info of base64');
        const { width: screenshotWidth } = await imageInfoOfBase64(
          context.screenshotBase64,
        );
        debug('image info of base64 done');

        assert(
          Number.isFinite(screenshotWidth) && screenshotWidth > 0,
          `Invalid screenshot width when computing screenshot scale: ${screenshotWidth}`,
        );

        const computedScale = screenshotWidth / pageWidth;
        assert(
          Number.isFinite(computedScale) && computedScale > 0,
          `Invalid computed screenshot scale: ${computedScale}`,
        );

        debug(
          `Computed screenshot scale ${computedScale} from screenshot width ${screenshotWidth} and page width ${pageWidth}`,
        );
        return computedScale;
      })();
    }

    try {
      this.screenshotScale = await this.screenshotScalePromise;
      return this.screenshotScale;
    } finally {
      this.screenshotScalePromise = undefined;
    }
  }

  private resolveReplanningCycleLimit(
    modelConfigForPlanning: IModelConfig,
  ): number {
    if (this.opts.replanningCycleLimit !== undefined) {
      return this.opts.replanningCycleLimit;
    }

    return modelConfigForPlanning.vlMode === 'vlm-ui-tars'
      ? defaultVlmUiTarsReplanningCycleLimit
      : defaultReplanningCycleLimit;
  }

  constructor(interfaceInstance: InterfaceType, opts?: AgentOpt) {
    this.interface = interfaceInstance;

    const envConfig = globalConfigManager.getAllEnvConfig();
    const envReplanningCycleLimitRaw =
      envConfig[MIDSCENE_REPLANNING_CYCLE_LIMIT];
    const envReplanningCycleLimit =
      envReplanningCycleLimitRaw !== undefined
        ? Number(envReplanningCycleLimitRaw)
        : undefined;

    this.opts = Object.assign(
      {
        generateReport: true,
        autoPrintReportMsg: true,
        groupName: 'Midscene Report',
        groupDescription: '',
      },
      opts || {},
      opts?.replanningCycleLimit === undefined &&
        envReplanningCycleLimit !== undefined &&
        !Number.isNaN(envReplanningCycleLimit)
        ? { replanningCycleLimit: envReplanningCycleLimit }
        : {},
    );

    const resolvedAiActContext =
      this.opts.aiActContext ?? this.opts.aiActionContext;
    if (resolvedAiActContext !== undefined) {
      this.opts.aiActContext = resolvedAiActContext;
      this.opts.aiActionContext ??= resolvedAiActContext;
    }

    if (
      opts?.modelConfig &&
      (typeof opts?.modelConfig !== 'object' || Array.isArray(opts.modelConfig))
    ) {
      throw new Error(
        `opts.modelConfig must be a plain object map of env keys to values, but got ${typeof opts?.modelConfig}`,
      );
    }
    // Create ModelConfigManager if modelConfig or createOpenAIClient is provided
    // Otherwise, use the global config manager
    const hasCustomConfig = opts?.modelConfig || opts?.createOpenAIClient;
    this.modelConfigManager = hasCustomConfig
      ? new ModelConfigManager(opts?.modelConfig, opts?.createOpenAIClient)
      : globalModelConfigManager;

    this.onTaskStartTip = this.opts.onTaskStartTip;

    this.service = new Service(async () => {
      return this.getUIContext();
    });

    // Process cache configuration
    const cacheConfigObj = this.processCacheConfig(opts || {});
    if (cacheConfigObj) {
      this.taskCache = new TaskCache(
        cacheConfigObj.id,
        cacheConfigObj.enabled,
        undefined, // cacheFilePath
        {
          readOnly: cacheConfigObj.readOnly,
          writeOnly: cacheConfigObj.writeOnly,
        },
      );
    }

    const baseActionSpace = this.interface.actionSpace();
    const fullActionSpace = [...baseActionSpace, defineActionAssert()];

    this.taskExecutor = new TaskExecutor(this.interface, this.service, {
      taskCache: this.taskCache,
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
      replanningCycleLimit: this.opts.replanningCycleLimit,
      actionSpace: fullActionSpace,
      hooks: {
        onTaskUpdate: (runner) => {
          const executionDump = runner.dump();
          this.appendExecutionDump(executionDump, runner);

          // Call all registered dump update listeners
          const dumpString = this.dumpDataString();
          for (const listener of this.dumpUpdateListeners) {
            try {
              listener(dumpString, executionDump);
            } catch (error) {
              console.error('Error in onDumpUpdate listener', error);
            }
          }

          this.writeOutActionDumps();
        },
      },
    });
    this.dump = this.resetDump();
    this.reportFileName =
      opts?.reportFileName ||
      getReportFileName(opts?.testId || this.interface.interfaceType || 'web');
  }

  async getActionSpace(): Promise<DeviceAction[]> {
    const commonAssertionAction = defineActionAssert();

    return [...this.interface.actionSpace(), commonAssertionAction];
  }

  async getUIContext(action?: ServiceAction): Promise<UIContext> {
    // Check VL model configuration when UI context is first needed
    this.ensureVLModelWarning();

    // If page context is frozen, return the frozen context for all actions
    if (this.frozenUIContext) {
      debug('Using frozen page context for action:', action);
      return this.frozenUIContext;
    }

    // Get original context
    let context: UIContext;
    if (this.interface.getContext) {
      debug('Using page.getContext for action:', action);
      context = await this.interface.getContext();
    } else {
      debug('Using commonContextParser');
      context = await commonContextParser(this.interface, {
        uploadServerUrl: this.modelConfigManager.getUploadTestServerUrl(),
      });
    }

    debug('will get screenshot scale');
    const computedScreenshotScale = await this.getScreenshotScale(context);
    debug('computedScreenshotScale', computedScreenshotScale);

    if (computedScreenshotScale !== 1) {
      const scaleForLog = Number.parseFloat(computedScreenshotScale.toFixed(4));
      debug(
        `Applying computed screenshot scale: ${scaleForLog} (resize to logical size)`,
      );
      const targetWidth = Math.round(context.size.width);
      const targetHeight = Math.round(context.size.height);
      debug(`Resizing screenshot to ${targetWidth}x${targetHeight}`);
      context.screenshotBase64 = await resizeImgBase64(
        context.screenshotBase64,
        { width: targetWidth, height: targetHeight },
      );
    } else {
      debug(`screenshot scale=${computedScreenshotScale}`);
    }

    return context;
  }

  async _snapshotContext(): Promise<UIContext> {
    return await this.getUIContext('locate');
  }

  /**
   * @deprecated Use {@link setAIActContext} instead.
   */
  async setAIActionContext(prompt: string) {
    await this.setAIActContext(prompt);
  }

  async setAIActContext(prompt: string) {
    if (this.aiActContext) {
      console.warn(
        'aiActContext is already set, and it is called again, will override the previous setting',
      );
    }
    this.opts.aiActContext = prompt;
    this.opts.aiActionContext = prompt;
  }

  resetDump() {
    this.dump = {
      sdkVersion: getVersion(),
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      executions: [],
      modelBriefs: [],
    };
    this.executionDumpIndexByRunner = new WeakMap<TaskRunner, number>();

    return this.dump;
  }

  appendExecutionDump(execution: ExecutionDump, runner?: TaskRunner) {
    const currentDump = this.dump;
    if (runner) {
      const existingIndex = this.executionDumpIndexByRunner.get(runner);
      if (existingIndex !== undefined) {
        currentDump.executions[existingIndex] = execution;
        return;
      }
      currentDump.executions.push(execution);
      this.executionDumpIndexByRunner.set(
        runner,
        currentDump.executions.length - 1,
      );
      return;
    }
    currentDump.executions.push(execution);
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

  wrapActionInActionSpace<T extends DeviceAction>(
    name: string,
  ): (param: ActionParam<T>) => Promise<ActionReturn<T>> {
    return async (param: ActionParam<T>) => {
      return await this.callActionInActionSpace<ActionReturn<T>>(name, param);
    };
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
    const defaultIntentModelConfig =
      this.modelConfigManager.getModelConfig('default');
    const modelConfigForPlanning =
      this.modelConfigManager.getModelConfig('planning');

    const { output } = await this.taskExecutor.runPlans(
      title,
      plans,
      modelConfigForPlanning,
      defaultIntentModelConfig,
    );
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
    opt: LocateOption & { value: string | number } & {
      autoDismissKeyboard?: boolean;
    } & { mode?: 'replace' | 'clear' | 'append' },
  ): Promise<any>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiInput(locatePrompt, opt) instead where opt contains the value
   */
  async aiInput(
    value: string | number,
    locatePrompt: TUserPrompt,
    opt?: LocateOption & { autoDismissKeyboard?: boolean } & {
      mode?: 'replace' | 'clear' | 'append';
    }, // AndroidDeviceInputOpt &
  ): Promise<any>;

  // Implementation
  async aiInput(
    locatePromptOrValue: TUserPrompt | string | number,
    locatePromptOrOpt:
      | TUserPrompt
      | (LocateOption & { value: string | number } & {
          autoDismissKeyboard?: boolean;
        } & { mode?: 'replace' | 'clear' | 'append' }) // AndroidDeviceInputOpt &
      | undefined,
    optOrUndefined?: LocateOption, // AndroidDeviceInputOpt &
  ) {
    let value: string | number;
    let locatePrompt: TUserPrompt;
    let opt:
      | (LocateOption & { value: string | number } & {
          autoDismissKeyboard?: boolean;
        } & { mode?: 'replace' | 'clear' | 'append' }) // AndroidDeviceInputOpt &
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
        value: string | number;
        autoDismissKeyboard?: boolean;
      };
      value = optWithValue.value;
      opt = optWithValue;
    } else {
      // Legacy signature: aiInput(value, locatePrompt, opt)
      value = locatePromptOrValue as string | number;
      locatePrompt = locatePromptOrOpt as TUserPrompt;
      opt = {
        ...optOrUndefined,
        value,
      };
    }

    assert(
      typeof value === 'string' || typeof value === 'number',
      'input value must be a string or number, use empty string if you want to clear the input',
    );
    assert(locatePrompt, 'missing locate prompt for input');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    // Convert value to string to ensure consistency
    const stringValue = typeof value === 'number' ? String(value) : value;

    return this.callActionInActionSpace('Input', {
      ...(opt || {}),
      value: stringValue,
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

    if (opt) {
      const normalizedScrollType = normalizeScrollType(
        (opt as ScrollParam).scrollType as
          | ScrollParam['scrollType']
          | LegacyScrollType
          | undefined,
      );

      if (normalizedScrollType !== (opt as ScrollParam).scrollType) {
        (opt as ScrollParam) = {
          ...(opt || {}),
          scrollType: normalizedScrollType as ScrollParam['scrollType'],
        };
      }
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

  async aiAct(taskPrompt: string, opt?: AiActOptions) {
    const modelConfigForPlanning =
      this.modelConfigManager.getModelConfig('planning');
    const defaultIntentModelConfig =
      this.modelConfigManager.getModelConfig('default');

    const includeBboxInPlanning =
      modelConfigForPlanning.modelName === defaultIntentModelConfig.modelName &&
      modelConfigForPlanning.openaiBaseURL ===
        defaultIntentModelConfig.openaiBaseURL;
    debug('setting includeBboxInPlanning to', includeBboxInPlanning);

    const cacheable = opt?.cacheable;
    const deepThink = opt?.deepThink === 'unset' ? undefined : opt?.deepThink;
    const replanningCycleLimit = this.resolveReplanningCycleLimit(
      modelConfigForPlanning,
    );
    // if vlm-ui-tars, plan cache is not used
    const isVlmUiTars = modelConfigForPlanning.vlMode === 'vlm-ui-tars';
    const matchedCache =
      isVlmUiTars || cacheable === false
        ? undefined
        : this.taskCache?.matchPlanCache(taskPrompt);
    if (
      matchedCache &&
      this.taskCache?.isCacheResultUsed &&
      matchedCache.cacheContent?.yamlWorkflow?.trim()
    ) {
      // log into report file
      await this.taskExecutor.loadYamlFlowAsPlanning(
        taskPrompt,
        matchedCache.cacheContent.yamlWorkflow,
      );

      debug('matched cache, will call .runYaml to run the action');
      const yaml = matchedCache.cacheContent.yamlWorkflow;
      return this.runYaml(yaml);
    }

    // If cache matched but yamlWorkflow is empty, fall through to normal execution

    const imagesIncludeCount: number | undefined = 2;
    const { output } = await this.taskExecutor.action(
      taskPrompt,
      modelConfigForPlanning,
      defaultIntentModelConfig,
      includeBboxInPlanning,
      this.aiActContext,
      cacheable,
      replanningCycleLimit,
      imagesIncludeCount,
      deepThink,
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

    return output;
  }

  /**
   * @deprecated Use {@link Agent.aiAct} instead.
   */
  async aiAction(taskPrompt: string, opt?: AiActOptions) {
    return this.aiAct(taskPrompt, opt);
  }

  async aiQuery<ReturnType = any>(
    demand: ServiceExtractParam,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<ReturnType> {
    const modelConfig = this.modelConfigManager.getModelConfig('insight');
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Query',
      demand,
      modelConfig,
      opt,
    );
    return output as ReturnType;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<boolean> {
    const modelConfig = this.modelConfigManager.getModelConfig('insight');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Boolean',
      textPrompt,
      modelConfig,
      opt,
      multimodalPrompt,
    );
    return output as boolean;
  }

  async aiNumber(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<number> {
    const modelConfig = this.modelConfigManager.getModelConfig('insight');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Number',
      textPrompt,
      modelConfig,
      opt,
      multimodalPrompt,
    );
    return output as number;
  }

  async aiString(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<string> {
    const modelConfig = this.modelConfigManager.getModelConfig('insight');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'String',
      textPrompt,
      modelConfig,
      opt,
      multimodalPrompt,
    );
    return output as string;
  }

  async aiAsk(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
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
      const modelConfig = this.modelConfigManager.getModelConfig('insight');

      const text = await this.service.describe(center, modelConfig, {
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
    const defaultIntentModelConfig =
      this.modelConfigManager.getModelConfig('default');
    const modelConfigForPlanning =
      this.modelConfigManager.getModelConfig('planning');

    const { output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(locateParam)),
      plans,
      modelConfigForPlanning,
      defaultIntentModelConfig,
    );

    const { element } = output;

    const dprValue = await (this.interface.size() as any).dpr;
    const dprEntry = dprValue
      ? {
          dpr: dprValue,
        }
      : {};
    return {
      rect: element?.rect,
      center: element?.center,
      ...dprEntry,
    } as Pick<LocateResultElement, 'rect' | 'center'> & {
      dpr?: number; // this field is deprecated
    };
  }

  async aiAssert(
    assertion: TUserPrompt,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ) {
    const modelConfig = this.modelConfigManager.getModelConfig('insight');

    const serviceOpt: ServiceExtractOption = {
      domIncluded: opt?.domIncluded ?? defaultServiceExtractOption.domIncluded,
      screenshotIncluded:
        opt?.screenshotIncluded ??
        defaultServiceExtractOption.screenshotIncluded,
    };

    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);
    const assertionText =
      typeof assertion === 'string' ? assertion : assertion.prompt;

    try {
      const { output, thought } =
        await this.taskExecutor.createTypeQueryExecution<boolean>(
          'Assert',
          textPrompt,
          modelConfig,
          serviceOpt,
          multimodalPrompt,
        );

      const pass = Boolean(output);
      const message = pass
        ? undefined
        : `Assertion failed: ${msg || assertionText}\nReason: ${thought || '(no_reason)'}`;

      if (opt?.keepRawResponse) {
        return {
          pass,
          thought,
          message,
        };
      }

      if (!pass) {
        throw new Error(message);
      }
    } catch (error) {
      if (error instanceof TaskExecutionError) {
        const errorTask = error.errorTask;
        const thought = errorTask?.thought;
        const rawError = errorTask?.error;
        const rawMessage =
          errorTask?.errorMessage ||
          (rawError instanceof Error
            ? rawError.message
            : rawError
              ? String(rawError)
              : undefined);
        const reason = thought || rawMessage || '(no_reason)';
        const message = `Assertion failed: ${msg || assertionText}\nReason: ${reason}`;

        if (opt?.keepRawResponse) {
          return {
            pass: false,
            thought,
            message,
          };
        }

        throw new Error(message, {
          cause: rawError ?? error,
        });
      }

      throw error;
    }
  }

  async aiWaitFor(assertion: TUserPrompt, opt?: AgentWaitForOpt) {
    const modelConfig = this.modelConfigManager.getModelConfig('insight');
    await this.taskExecutor.waitFor(
      assertion,
      {
        timeoutMs: opt?.timeoutMs || 15 * 1000,
        checkIntervalMs: opt?.checkIntervalMs || 3 * 1000,
      },
      modelConfig,
    );
  }

  async ai(...args: Parameters<typeof this.aiAct>) {
    return this.aiAct(...args);
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

  /**
   * Add a dump update listener
   * @param listener Listener function
   * @returns A remove function that can be called to remove this listener
   */
  addDumpUpdateListener(
    listener: (dump: string, executionDump?: ExecutionDump) => void,
  ): () => void {
    this.dumpUpdateListeners.push(listener);

    // Return remove function
    return () => {
      this.removeDumpUpdateListener(listener);
    };
  }

  /**
   * Remove a dump update listener
   * @param listener The listener function to remove
   */
  removeDumpUpdateListener(
    listener: (dump: string, executionDump?: ExecutionDump) => void,
  ): void {
    const index = this.dumpUpdateListeners.indexOf(listener);
    if (index > -1) {
      this.dumpUpdateListeners.splice(index, 1);
    }
  }

  /**
   * Clear all dump update listeners
   */
  clearDumpUpdateListeners(): void {
    this.dumpUpdateListeners = [];
  }

  async destroy() {
    // Early return if already destroyed
    if (this.destroyed) {
      return;
    }

    await this.interface.destroy?.();
    this.resetDump(); // reset dump to release memory
    this.destroyed = true;
  }

  async recordToReport(
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
      logTime: now,
      name: `Log - ${title || 'untitled'}`,
      description: opt?.content || '',
      tasks: [task],
    };
    // 5. append to execution dump
    this.appendExecutionDump(executionDump);

    // Call all registered dump update listeners
    const dumpString = this.dumpDataString();
    for (const listener of this.dumpUpdateListeners) {
      try {
        listener(dumpString);
      } catch (error) {
        console.error('Error in onDumpUpdate listener', error);
      }
    }

    this.writeOutActionDumps();
  }

  /**
   * @deprecated Use {@link Agent.recordToReport} instead.
   */
  async logScreenshot(
    title?: string,
    opt?: {
      content: string;
    },
  ) {
    await this.recordToReport(title, opt);
  }

  _unstableLogContent() {
    const { groupName, groupDescription, executions } = this.dump;
    return {
      groupName,
      groupDescription,
      executions: executions || [],
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
  private processCacheConfig(opts: AgentOpt): {
    id: string;
    enabled: boolean;
    readOnly: boolean;
    writeOnly: boolean;
  } | null {
    // Validate original cache config before processing
    // Agent requires explicit IDs - don't allow auto-generation
    if (opts.cache === true) {
      throw new Error(
        'cache: true requires an explicit cache ID. Please provide:\n' +
          'Example: cache: { id: "my-cache-id" }',
      );
    }

    // Check if cache config object is missing ID
    if (
      opts.cache &&
      typeof opts.cache === 'object' &&
      opts.cache !== null &&
      !opts.cache.id
    ) {
      throw new Error(
        'cache configuration requires an explicit id.\n' +
          'Example: cache: { id: "my-cache-id" }',
      );
    }

    // Use the unified utils function to process cache configuration
    const cacheConfig = processCacheConfig(
      opts.cache,
      opts.cacheId || opts.testId || 'default',
    );

    if (!cacheConfig) {
      return null;
    }

    // Handle cache configuration object
    if (typeof cacheConfig === 'object' && cacheConfig !== null) {
      const id = cacheConfig.id;
      const rawStrategy = cacheConfig.strategy as unknown;
      let strategyValue: string;

      if (rawStrategy === undefined) {
        strategyValue = 'read-write';
      } else if (typeof rawStrategy === 'string') {
        strategyValue = rawStrategy;
      } else {
        throw new Error(
          `cache.strategy must be a string when provided, but received type ${typeof rawStrategy}`,
        );
      }

      if (!isValidCacheStrategy(strategyValue)) {
        throw new Error(
          `cache.strategy must be one of ${CACHE_STRATEGY_VALUES}, but received "${strategyValue}"`,
        );
      }

      const isReadOnly = strategyValue === 'read-only';
      const isWriteOnly = strategyValue === 'write-only';

      return {
        id,
        enabled: !isWriteOnly,
        readOnly: isReadOnly,
        writeOnly: isWriteOnly,
      };
    }

    return null;
  }

  /**
   * Manually flush cache to file
   * @param options - Optional configuration
   * @param options.cleanUnused - If true, removes unused cache records before flushing
   */
  async flushCache(options?: { cleanUnused?: boolean }): Promise<void> {
    if (!this.taskCache) {
      throw new Error('Cache is not configured');
    }

    this.taskCache.flushCacheToFile(options);
  }
}

export const createAgent = (
  interfaceInstance: AbstractInterface,
  opts?: AgentOpt,
) => {
  return new Agent(interfaceInstance, opts);
};
