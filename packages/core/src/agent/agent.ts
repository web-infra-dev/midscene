import { type ModelRuntime, getModelRuntime } from '@/ai-model/models';
import { INTERNAL_CALL_ID_FIELD } from '@/ai-model/service-caller';
import yaml from 'js-yaml';
import type { TUserPrompt } from '../ai-model/index';
import { ScreenshotItem } from '../screenshot-item';
import Service from '../service/index';
// Import types and values directly from their source files to avoid circular dependency
// DO NOT import from '../index' as it creates a circular dependency:
// index.ts -> agent/index.ts -> agent/agent.ts -> index.ts
import {
  type AIUsageInfo,
  type ActionParam,
  type ActionReturn,
  type AgentAssertOpt,
  type AgentOpt,
  type AgentProgressListener,
  type AgentWaitForOpt,
  type DeepThinkOption,
  type DeviceAction,
  ExecutionDump,
  type ExecutionRecorderItem,
  type ExecutionTask,
  type ExecutionTaskLog,
  type LocateOption,
  type LocateResultElement,
  type OnTaskStartTip,
  type PlanningAction,
  type RecordToReportOptions,
  type RecordToReportScreenshot,
  ReportActionDump,
  type ReportMeta,
  type ScrollParam,
  type ServiceAction,
  type ServiceExtractOption,
  type ServiceExtractParam,
  type TestStatus,
  type UIContext,
} from '../types';
import type { MidsceneYamlScript } from '../yaml';

import type { IReportGenerator } from '@/report-generator';
import {
  ReportGenerator,
  assertReportGenerationOptions,
} from '@/report-generator';
import { getVersion, processCacheConfig, reportHTMLContent } from '@/utils';
import {
  ScriptPlayer,
  buildDetailedLocateParam,
  parseYamlScript,
} from '../yaml/index';

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AbstractInterface } from '@/device';
import type { TaskRunner } from '@/task-runner';
import {
  type IModelConfig,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  ModelConfigManager,
  type TIntent,
  globalConfigManager,
  globalModelConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert, ifInBrowser, uuid } from '@midscene/shared/utils';
import { defineActionSleep } from '../device';
import { validateAgentCacheInput } from './cache-config';
import { MetricsCollector, type MidsceneUsageMetrics } from './metrics';
import { AgentProgressBus } from './progress';
import { buildPromptWithContext } from './prompt-context';
import { normalizeRecordToReportScreenshot } from './record-to-report';
import {
  type RunGherkinScenarioOptions,
  runGherkinScenario,
} from './run-gherkin-scenario';
import { markdownToAiActPrompt } from './run-markdown';
import { TaskCache } from './task-cache';
import {
  TaskExecutionError,
  TaskExecutor,
  locatePlanForLocate,
  locatePlanForLocateAll,
  withFileChooser,
} from './tasks';
import { UIObserver, type UIObserverOption } from './ui-observer';
import {
  type TaskTitleType,
  locateParamStr,
  paramStr,
  taskTitleStr,
  typeStr,
} from './ui-utils';
import {
  commonContextParser,
  getReportFileName,
  normalizeFilePaths,
  normalizeScrollType,
  parsePrompt,
} from './utils';

const debug = getDebug('agent');
const warn = getDebug('agent', { console: true });

const defaultServiceExtractOption: ServiceExtractOption = {
  domIncluded: false,
  screenshotIncluded: true,
};

export type AiActOptions = {
  cacheable?: boolean;
  fileChooserAccept?: string | string[];
  deepThink?: DeepThinkOption;
  deepLocate?: boolean;
  abortSignal?: AbortSignal;
  context?: string;
};

type AiActInternalOptions = AiActOptions & {
  _internalReportDisplay?: {
    type?: TaskTitleType;
    prompt?: string;
  };
};

/**
 * Shared input option type for aiInput(), used consistently across
 * overload signatures and the implementation so fields don't drift.
 */
type AgentInputOption = LocateOption & {
  autoDismissKeyboard?: boolean;
  keyboardTypeDelay?: number;
  mode?: 'replace' | 'clear' | 'typeOnly' | 'append';
};

export class Agent<
  InterfaceType extends AbstractInterface = AbstractInterface,
> {
  interface: InterfaceType;

  service: Service;

  dump: ReportActionDump;

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

  private readonly metricsCollector = new MetricsCollector();

  // Monotonic counter for generating unique dedup keys when a usage has no
  // request_id (e.g. estimated streaming usage).
  private usageCallCounter = 0;

  // Usage values already folded into `metricsCollector`, keyed by
  // `${taskId}:${field}` so re-emitted snapshots never double-count.
  private readonly countedUsageKeys = new Set<string>();

  private dumpUpdateListeners: Array<
    (dump: string, executionDump?: ExecutionDump) => void
  > = [];

  // Generic progress bus: every producer (aiAct today, more later) broadcasts
  // through here. Consumers narrow by `event.scope`.
  private readonly progressBus = new AgentProgressBus();

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

  /**
   * Currently active UIObserver (from startObserving). Only one observer may
   * be active at a time since frame sources are device-level singletons.
   */
  private activeObserver: UIObserver | null = null;

  private get aiActContext(): string | undefined {
    return this.opts.aiActContext ?? this.opts.aiActionContext;
  }

  private executionDumpIndexByRunner = new WeakMap<TaskRunner, number>();

  private fullActionSpace: DeviceAction[];

  private reportGenerator: IReportGenerator;

  // @deprecated use .interface instead
  get page() {
    return this.interface;
  }

  /**
   * Fails fast for non-web interfaces when the model family is missing.
   *
   * Early Midscene web usage allowed running without `modelFamily` and falling
   * back to a default bbox parser. Non-web users do not have that compatibility
   * path, so this check helps surface configuration problems before spending a
   * model call.
   *
   * Web flows validate missing locate model family at workflow boundaries:
   * `Service.locate` throws when aiTap/aiType fallback to the default model for
   * direct locate, and generic planning throws when aiAct asks a planning model
   * to return inline locate coordinates. Those checks are intentionally placed
   * where Midscene knows which model role should provide coordinate parsing.
   */
  private assertModelFamilyForNonWebContext() {
    if (
      this.interface.interfaceType !== 'puppeteer' &&
      this.interface.interfaceType !== 'playwright' &&
      this.interface.interfaceType !== 'static' &&
      this.interface.interfaceType !== 'chrome-extension-proxy' &&
      this.interface.interfaceType !== 'page-over-chrome-extension-bridge'
    ) {
      this.modelConfigManager.throwErrorIfNonVLModel();
    }
  }

  private resolveReplanningCycleLimit(planningModel: ModelRuntime): number {
    return (
      this.opts.replanningCycleLimit ??
      globalConfigManager.getEnvConfigValueAsNumber(
        MIDSCENE_REPLANNING_CYCLE_LIMIT,
      ) ??
      planningModel.adapter.planning.defaultReplanningCycleLimit
    );
  }

  private resolveModelRuntime(intent: TIntent): ModelRuntime {
    const runtime = getModelRuntime(
      this.modelConfigManager.getModelConfig(intent),
    );
    return {
      ...runtime,
      onUsage: (usage) => {
        this.usageCallCounter += 1;
        // buildUsageInfo leaves intent undefined; fill it from the model
        // config slot so metrics.byIntent has a meaningful category.
        const enriched = usage.intent
          ? usage
          : { ...usage, intent: usage.slot };
        this.consumeUsage(
          enriched,
          `callai:${usage.request_id ?? this.usageCallCounter}`,
        );
      },
    };
  }

  constructor(interfaceInstance: InterfaceType, opts?: AgentOpt) {
    this.interface = interfaceInstance;

    this.opts = Object.assign(
      {
        generateReport: true,
        persistExecutionDump: false,
        autoPrintReportMsg: true,
        groupName: 'Midscene Report',
        groupDescription: '',
      },
      opts || {},
    );
    assertReportGenerationOptions(this.opts);

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
          cacheDir: cacheConfigObj.cacheDir,
        },
      );
    }

    const baseActionSpace = this.interface.actionSpace();
    this.fullActionSpace = [...baseActionSpace, defineActionSleep()];

    this.taskExecutor = new TaskExecutor(this.interface, this.service, {
      taskCache: this.taskCache,
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
      replanningCycleLimit: this.opts.replanningCycleLimit,
      waitAfterAction: this.opts.waitAfterAction,
      useDeviceTime: this.opts.useDeviceTime,
      actionSpace: this.fullActionSpace,
      hooks: {
        onSnapshotChange: async (runner) => {
          const executionDump = runner.dump();
          this.appendExecutionDump(executionDump, runner);
          this.collectUsageMetrics(executionDump);

          // Persist report updates before notifying listeners so screenshot
          // payloads can be released from memory and serialized as references.
          this.writeOutActionDumps(executionDump);
          await this.reportGenerator.flush();

          // Call all registered dump update listeners
          const dumpString = this.dumpDataString();
          for (const listener of this.dumpUpdateListeners) {
            try {
              listener(dumpString, executionDump);
            } catch (error) {
              console.error('Error in onDumpUpdate listener', error);
            }
          }
        },
        onProgress: this.progressBus.publish,
      },
    });
    this.dump = this.resetDump();
    this.reportFileName =
      opts?.reportFileName ??
      // Keep deprecated testId behavior for generated report names until it is
      // fully removed from the public API.
      getReportFileName(opts?.testId || this.interface.interfaceType || 'web');

    this.reportGenerator = ReportGenerator.create(this.reportFileName!, {
      generateReport: this.opts.generateReport,
      persistExecutionDump: this.opts.persistExecutionDump,
      outputFormat: this.opts.outputFormat,
      autoPrintReportMsg: this.opts.autoPrintReportMsg,
      reuseExistingReport:
        this.opts.reportAttributes?.['data-group-id'] === this.reportFileName,
    });
  }

  async getActionSpace(): Promise<DeviceAction[]> {
    return this.fullActionSpace;
  }

  private static readonly CONTEXT_RETRY_MAX = 3;
  private static readonly CONTEXT_RETRY_DELAY_MS = 1500;

  /**
   * Override in subclasses to indicate which errors are transient and should
   * trigger an automatic retry when building the UI context.
   * Returns `false` by default (no retry).
   */
  protected isRetryableContextError(_error: unknown): boolean {
    return false;
  }

  async getUIContext(action?: ServiceAction): Promise<UIContext> {
    // Some non-web flows, such as Android, need an Agent instance before they
    // can call device methods via ADB, so defer missing modelFamily errors
    // until UI context is actually requested.
    this.assertModelFamilyForNonWebContext();

    // If page context is frozen, return the frozen context for all actions
    if (this.frozenUIContext) {
      debug('Using frozen page context for action:', action);
      return this.frozenUIContext;
    }

    const maxRetries = Agent.CONTEXT_RETRY_MAX;
    for (let attempt = 0; ; attempt++) {
      try {
        return await commonContextParser(this.interface, {
          uploadServerUrl: this.modelConfigManager.getUploadTestServerUrl(),
          screenshotShrinkFactor: this.opts.screenshotShrinkFactor,
        });
      } catch (error) {
        if (attempt < maxRetries && this.isRetryableContextError(error)) {
          debug(
            `retryable context error (attempt ${attempt + 1}/${maxRetries}), retrying in ${Agent.CONTEXT_RETRY_DELAY_MS}ms: ${error}`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Agent.CONTEXT_RETRY_DELAY_MS),
          );
          continue;
        }
        throw error;
      }
    }
  }

  async _snapshotContext(): Promise<UIContext> {
    return await this.getUIContext('locate');
  }

  /**
   * Start observing the screen in the background so a later assertion can
   * judge everything that happened while other agent calls ran — including
   * transient UI (toasts, banners, transitions) that appears mid-action:
   *
   * ```ts
   * const observer = await agent.startObserving();
   * await agent.aiAct('submit the form');
   * await observer.stop();
   * await observer.aiAssert('a success toast appeared during the process');
   * ```
   *
   * Frames come from the device's continuous frame source when available
   * (scrcpy on Android, WDA MJPEG on iOS — both opt-in; CDP screencast on
   * web) and fall back to plain screenshots otherwise. Sampling is capped at
   * 5fps, the buffer is bounded and self-thinning, decoding is deferred to
   * the end, and all buffered frames (up to `maxFrames`) are sent to
   * the model at assert time. To control token cost for long windows,
   * increase `intervalMs` or decrease `maxFrames`.
   * Awaiting `startObserving()` guarantees one baseline frame is captured
   * before your next action.
   */
  async startObserving(opt?: UIObserverOption): Promise<UIObserver> {
    // A frozen context pins perception to a single snapshot; observing a
    // window of frames contradicts that. Fail fast instead of silently
    // producing an all-identical sequence.
    assert(
      !this.frozenUIContext,
      'startObserving() cannot be used while the UI context is frozen (call unfreezePageContext() first)',
    );
    // Frame sources are device-level singletons — two concurrent observers
    // would conflict (scrcpy stream, WDA MJPEG port, CDP screencast).
    assert(
      !this.activeObserver,
      'An observation window is already active on this agent. ' +
        'Stop the existing observer first (await observer.stop()) before starting a new one.',
    );
    const observer = new UIObserver(
      {
        openFrameSource: async () =>
          (await this.interface.openFrameSource?.()) ?? undefined,
        // Fallback single-frame capture. Deliberately bypasses getUIContext so
        // the observation loop never pollutes the TaskRunner context cache.
        screenshot: () => this.interface.screenshotBase64(),
        captureRepresentative: () => this.getUIContext('assert'),
        runAssert: (assertion, uiContext, msg, assertOpt) =>
          this.aiAssertWithContext(assertion, uiContext, msg, assertOpt),
        runBoolean: (prompt, uiContext, boolOpt) =>
          this.aiBooleanWithContext(prompt, uiContext, boolOpt),
        onStopped: () => {
          this.activeObserver = null;
        },
        screenshotShrinkFactor: this.opts.screenshotShrinkFactor,
      },
      opt,
    );
    // Mark as active BEFORE the async start() so concurrent calls hit the
    // assert guard above. If start() throws, clear the reference below.
    this.activeObserver = observer;
    try {
      await observer.start();
    } catch (error) {
      this.activeObserver = null;
      throw error;
    }
    return observer;
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
    this.dump = new ReportActionDump({
      sdkVersion: getVersion(),
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      executions: [],
      modelBriefs: [],
      deviceType: this.interface.interfaceType,
    });
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

  /**
   * Fold any not-yet-counted task usage from an execution dump into the
   * instance metrics. Snapshots are re-emitted as tasks progress, so each
   * usage value is keyed by `${taskId}:${field}` and counted at most once.
   */
  private collectUsageMetrics(execution: ExecutionDump) {
    for (const task of execution.tasks) {
      this.consumeUsage(task.usage, `${task.taskId}:usage`);
      this.consumeUsage(task.searchAreaUsage, `${task.taskId}:searchAreaUsage`);
    }
  }

  private consumeUsage(usage: AIUsageInfo | undefined, key: string) {
    if (!usage) {
      return;
    }
    // Dedup key priority:
    // 1. request_id — provider-issued, stable across onUsage and task dump paths
    // 2. INTERNAL_CALL_ID_FIELD — callAI-generated internal id, covers
    //    providers that don't return a request_id
    // 3. caller-provided key (taskId:field or callai:counter)
    let dedupKey: string;
    if (usage.request_id) {
      dedupKey = `req:${usage.request_id}`;
    } else if ((usage as any)[INTERNAL_CALL_ID_FIELD]) {
      dedupKey = `int:${(usage as any)[INTERNAL_CALL_ID_FIELD]}`;
    } else {
      dedupKey = key;
    }
    if (this.countedUsageKeys.has(dedupKey)) {
      return;
    }
    this.countedUsageKeys.add(dedupKey);
    this.metricsCollector.add(usage);
    if (this.opts.onLLMUsage) {
      try {
        this.opts.onLLMUsage(usage);
      } catch (error) {
        warn(`onLLMUsage listener threw, ignoring: ${error}`);
      }
    }
  }

  /**
   * Aggregated LLM usage accumulated by this agent since it was created.
   */
  get metrics(): MidsceneUsageMetrics {
    return this.metricsCollector.snapshot();
  }

  dumpDataString(opt?: { inlineScreenshots?: boolean }) {
    // update dump info
    this.dump.groupName = this.opts.groupName!;
    this.dump.groupDescription = this.opts.groupDescription;
    // In browser environment, use inline screenshots since file system is not available
    if (ifInBrowser || opt?.inlineScreenshots) {
      return this.dump.serializeWithInlineScreenshots();
    }
    return this.dump.serialize();
  }

  reportHTMLString(opt?: { inlineScreenshots?: boolean }) {
    // dumpDataString() handles browser environment with inline screenshots
    return reportHTMLContent(this.dumpDataString(opt));
  }

  private lastExecutionDump?: ExecutionDump;

  writeOutActionDumps(executionDump?: ExecutionDump) {
    const exec = executionDump || this.lastExecutionDump;
    if (exec) {
      this.lastExecutionDump = exec;
      this.reportGenerator.onExecutionUpdate(
        exec,
        this.getReportMeta(),
        this.opts.reportAttributes,
      );
    }
    this.reportFile = this.reportGenerator.getReportPath();
  }

  private getReportMeta(): ReportMeta {
    return {
      groupName: this.dump.groupName,
      groupDescription: this.dump.groupDescription,
      sdkVersion: this.dump.sdkVersion,
      modelBriefs: this.dump.modelBriefs,
      deviceType: this.dump.deviceType,
    };
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
    const defaultModel = this.resolveModelRuntime('default');
    const planningModel = this.resolveModelRuntime('planning');

    const { output } = await this.taskExecutor.runPlans(
      title,
      plans,
      planningModel,
      defaultModel,
    );
    return output;
  }

  async aiTap(
    locatePrompt: TUserPrompt,
    opt?: LocateOption & { fileChooserAccept?: string | string[] },
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for tap');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    const fileChooserAccept = opt?.fileChooserAccept
      ? this.normalizeFileInput(opt.fileChooserAccept)
      : undefined;

    await withFileChooser(this.interface, fileChooserAccept, async () => {
      await this.callActionInActionSpace('Tap', {
        locate: detailedLocateParam,
      });
    });
  }

  async aiRightClick(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for right click');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    await this.callActionInActionSpace('RightClick', {
      locate: detailedLocateParam,
    });
  }

  async aiDoubleClick(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for double click');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    await this.callActionInActionSpace('DoubleClick', {
      locate: detailedLocateParam,
    });
  }

  async aiHover(locatePrompt: TUserPrompt, opt?: LocateOption): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for hover');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    await this.callActionInActionSpace('Hover', {
      locate: detailedLocateParam,
    });
  }

  // New signature, always use locatePrompt as the first param
  async aiInput(
    locatePrompt: TUserPrompt,
    opt: AgentInputOption & { value: string | number },
  ): Promise<void>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiInput(locatePrompt, opt) instead where opt contains the value
   */
  async aiInput(
    value: string | number,
    locatePrompt: TUserPrompt,
    opt?: AgentInputOption,
  ): Promise<void>;

  // Implementation
  async aiInput(
    locatePromptOrValue: TUserPrompt | string | number,
    locatePromptOrOpt:
      | TUserPrompt
      | (AgentInputOption & { value: string | number })
      | undefined,
    optOrUndefined?: AgentInputOption,
  ) {
    let value: string | number;
    let locatePrompt: TUserPrompt;
    let opt: (AgentInputOption & { value: string | number }) | undefined;

    // Check if using new signature (first param is locatePrompt, second has value)
    if (
      typeof locatePromptOrOpt === 'object' &&
      locatePromptOrOpt !== null &&
      'value' in locatePromptOrOpt
    ) {
      // New signature: aiInput(locatePrompt, opt)
      locatePrompt = locatePromptOrValue as TUserPrompt;
      const optWithValue = locatePromptOrOpt as AgentInputOption & {
        value: string | number;
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

    // backward compat: convert deprecated 'append' to 'typeOnly'
    const mode = opt?.mode === 'append' ? 'typeOnly' : opt?.mode;

    await this.callActionInActionSpace('Input', {
      ...(opt || {}),
      value: stringValue,
      locate: detailedLocateParam,
      mode,
    });
  }

  // New signature
  async aiKeyboardPress(
    locatePrompt: TUserPrompt,
    opt: LocateOption & { keyName: string },
  ): Promise<void>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiKeyboardPress(locatePrompt, opt) instead where opt contains the keyName
   */
  async aiKeyboardPress(
    keyName: string,
    locatePrompt?: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void>;

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

    await this.callActionInActionSpace('KeyboardPress', {
      ...(opt || {}),
      locate: detailedLocateParam,
    });
  }

  // New signature
  async aiScroll(
    locatePrompt: TUserPrompt | undefined,
    opt: LocateOption & ScrollParam,
  ): Promise<void>;

  // Legacy signature - deprecated
  /**
   * @deprecated Use aiScroll(locatePrompt, opt) instead where opt contains the scroll parameters
   */
  async aiScroll(
    scrollParam: ScrollParam,
    locatePrompt?: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void>;

  // Implementation
  async aiScroll(
    locatePromptOrScrollParam: TUserPrompt | ScrollParam | undefined,
    locatePromptOrOpt: TUserPrompt | (LocateOption & ScrollParam) | undefined,
    optOrUndefined?: LocateOption,
  ) {
    let scrollParam: ScrollParam;
    let locatePrompt: TUserPrompt | undefined;
    let opt: LocateOption | undefined;

    const isLocatePromptLike = (value: unknown): value is TUserPrompt => {
      if (
        typeof value === 'string' ||
        typeof value === 'undefined' ||
        value === null
      ) {
        return true;
      }

      return typeof value === 'object' && value !== null && 'prompt' in value;
    };

    // Check if using new signature (first param is locatePrompt, second is options)
    if (
      isLocatePromptLike(locatePromptOrScrollParam) &&
      typeof locatePromptOrOpt === 'object' &&
      locatePromptOrOpt !== null
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
        (opt as ScrollParam).scrollType,
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

    await this.callActionInActionSpace('Scroll', {
      ...(opt || {}),
      locate: detailedLocateParam,
    });
  }

  async aiPinch(
    locatePrompt: TUserPrompt | undefined,
    opt: LocateOption & {
      direction: 'in' | 'out';
      distance?: number;
      duration?: number;
    },
  ): Promise<void> {
    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt || '',
      opt,
    );

    await this.callActionInActionSpace('Pinch', {
      ...opt,
      locate: detailedLocateParam,
    });
  }

  async aiLongPress(
    locatePrompt: TUserPrompt,
    opt?: LocateOption & { duration?: number },
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for long press');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    await this.callActionInActionSpace('LongPress', {
      ...(opt || {}),
      locate: detailedLocateParam,
    });
  }

  async aiClearInput(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for clear input');

    const detailedLocateParam = buildDetailedLocateParam(locatePrompt, opt);

    await this.callActionInActionSpace('ClearInput', {
      locate: detailedLocateParam,
    });
  }

  async aiAct(
    taskPrompt: TUserPrompt,
    opt?: AiActOptions,
  ): Promise<string | undefined> {
    const internalReportDisplay = (opt as AiActInternalOptions | undefined)
      ?._internalReportDisplay;
    const taskPromptText =
      typeof taskPrompt === 'string' ? taskPrompt : taskPrompt.prompt;
    const reportPrompt = internalReportDisplay?.prompt || taskPromptText;
    const fileChooserAccept = opt?.fileChooserAccept
      ? this.normalizeFileInput(opt.fileChooserAccept)
      : undefined;

    const abortSignal = opt?.abortSignal;
    if (abortSignal?.aborted) {
      throw new Error(
        `aiAct aborted: ${abortSignal.reason || 'signal already aborted'}`,
      );
    }

    const runAiAct = async () => {
      const planningModel = this.resolveModelRuntime('planning');
      const defaultModel = this.resolveModelRuntime('default');
      const aiActContext =
        opt?.context !== undefined ? opt.context : this.aiActContext;
      const cachePrompt = buildPromptWithContext(taskPrompt, aiActContext);
      // Controls the aiAct planning mode, such as sub-goal prompts and locate result strategy.
      let deepThink = opt?.deepThink === true;
      if (deepThink && planningModel.adapter.planning.kind === 'custom') {
        warn(
          `The "deepThink" option is not supported for aiAct with custom planning adapters (modelFamily: ${planningModel.config.modelFamily ?? 'unknown'}). It will be ignored.`,
        );
        deepThink = false;
      }

      let deepLocate = opt?.deepLocate;
      if (
        deepLocate &&
        !planningModel.adapter.planning.supportsActionDeepLocate
      ) {
        warn(
          `The "deepLocate" option is not supported for aiAct with the current planning adapter (modelFamily: ${planningModel.config.modelFamily ?? 'unknown'}). It will be ignored.`,
        );
        deepLocate = false;
      }

      const noIndividualLocateModel = planningModel.config.slot === 'default';

      const includeLocateInPlanning = !deepThink && noIndividualLocateModel;

      debug('setting includeLocateInPlanning to', includeLocateInPlanning, {
        deepThink,
        noIndividualLocateModel,
      });

      const cacheable = opt?.cacheable;
      const replanningCycleLimit =
        this.resolveReplanningCycleLimit(planningModel);
      const planCacheEnabled = planningModel.adapter.planning.cacheEnabled;
      const matchedCache =
        !planCacheEnabled || cacheable === false
          ? undefined
          : this.taskCache?.matchPlanCache(cachePrompt);
      let cachedYamlFailed = false;
      if (
        matchedCache?.cacheUsable &&
        this.taskCache?.isCacheResultUsed &&
        matchedCache.cacheContent?.yamlWorkflow?.trim()
      ) {
        const yaml = matchedCache.cacheContent.yamlWorkflow;
        try {
          // log into report file
          await this.taskExecutor.loadYamlFlowAsPlanning(
            taskPrompt,
            yaml,
            internalReportDisplay,
          );

          debug('matched cache, will call .runYaml to run the action');
          await this.runYaml(yaml);
          return;
        } catch (error) {
          cachedYamlFailed = true;
          warn(
            `cached aiAct plan failed, will replan and disable the stale cache: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // If cache matched but is not executable, fall through to normal execution
      const imagesIncludeCount: number = deepThink ? 2 : 1;
      const { output: actionOutput } = await this.taskExecutor.action(
        taskPrompt,
        planningModel,
        defaultModel,
        includeLocateInPlanning,
        aiActContext,
        cacheable,
        replanningCycleLimit,
        imagesIncludeCount,
        deepThink,
        fileChooserAccept,
        deepLocate,
        abortSignal,
        internalReportDisplay,
      );

      // update cache
      if (this.taskCache && cacheable !== false) {
        const yamlFlow = cachedYamlFailed ? [] : actionOutput?.yamlFlow;

        if (!cachedYamlFailed && !yamlFlow?.length) {
          return actionOutput?.output;
        }

        const yamlFlowToCache = yamlFlow ?? [];
        const yamlContent: MidsceneYamlScript = {
          tasks: [
            {
              name: reportPrompt,
              flow: yamlFlowToCache,
            },
          ],
        };
        const yamlFlowStr = yaml.dump(yamlContent);
        this.taskCache.updateOrAppendCacheRecord(
          {
            type: 'plan',
            prompt: cachePrompt,
            yamlWorkflow: yamlFlowStr,
          },
          matchedCache,
        );
      }

      return actionOutput?.output;
    };

    return await runAiAct();
  }

  async runMarkdown(
    markdownPath: string,
    opt?: AiActOptions,
  ): Promise<string | undefined> {
    const markdown = await readFile(markdownPath, 'utf-8');
    const { prompt } = await markdownToAiActPrompt(markdown, markdownPath);
    return this.aiAct(prompt, {
      ...opt,
      _internalReportDisplay: {
        type: 'Markdown',
        prompt: basename(markdownPath),
      },
    } as AiActOptions);
  }

  async runGherkinScenario(
    scenarioText: string,
    opt?: RunGherkinScenarioOptions,
  ): Promise<void> {
    return runGherkinScenario(this, scenarioText, opt);
  }

  /**
   * @deprecated Use {@link Agent.aiAct} instead.
   */
  async aiAction(taskPrompt: TUserPrompt, opt?: AiActOptions) {
    return this.aiAct(taskPrompt, opt);
  }

  async aiQuery<ReturnType = any>(
    demand: ServiceExtractParam,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<ReturnType> {
    const modelRuntime = this.resolveModelRuntime('insight');
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Query',
      demand,
      modelRuntime,
      opt,
    );
    return output as ReturnType;
  }

  async aiBoolean(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<boolean> {
    return this.aiBooleanWithContext(prompt, undefined, opt);
  }

  private async aiBooleanWithContext(
    prompt: TUserPrompt,
    uiContext?: UIContext,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<boolean> {
    const modelRuntime = this.resolveModelRuntime('insight');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Boolean',
      textPrompt,
      modelRuntime,
      opt,
      multimodalPrompt,
      uiContext ? { uiContext } : undefined,
    );
    return output as boolean;
  }

  async aiNumber(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<number> {
    const modelRuntime = this.resolveModelRuntime('insight');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'Number',
      textPrompt,
      modelRuntime,
      opt,
      multimodalPrompt,
    );
    return output as number;
  }

  async aiString(
    prompt: TUserPrompt,
    opt: ServiceExtractOption = defaultServiceExtractOption,
  ): Promise<string> {
    const modelRuntime = this.resolveModelRuntime('insight');

    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    const { output } = await this.taskExecutor.createTypeQueryExecution(
      'String',
      textPrompt,
      modelRuntime,
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

  /**
   * Locate an element and return both its center point and an approximate rect.
   *
   * - In most locate flows, `rect` represents the matched element boundary.
   * - Some models only support point grounding instead of boundary grounding.
   *   In those cases (for example, AutoGLM), `rect` falls back to a small 8x8
   *   box centered on the located point.
   *
   * Because `rect` may vary with the underlying model capability, avoid relying
   * on it too heavily for strict boundary semantics. If you need a stable click
   * target, prefer `center`.
   */
  async aiLocate(prompt: TUserPrompt, opt?: LocateOption) {
    const locateParam = buildDetailedLocateParam(prompt, opt);
    assert(locateParam, 'cannot get locate param for aiLocate');
    const locatePlan = locatePlanForLocate(locateParam);
    const plans = [locatePlan];
    const defaultModel = this.resolveModelRuntime('default');
    const planningModel = this.resolveModelRuntime('planning');

    const { output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(locateParam)),
      plans,
      planningModel,
      defaultModel,
      opt?.uiContext ? { uiContext: opt.uiContext } : undefined,
    );

    const { element } = output;

    return {
      rect: element?.rect,
      center: element?.center,
      dpr: element?.dpr,
    } as Pick<LocateResultElement, 'rect' | 'center'>;
  }

  async aiLocateAll(prompt: TUserPrompt, opt?: LocateOption) {
    const locateParam = buildDetailedLocateParam(prompt, opt);
    assert(locateParam, 'cannot get locate param for aiLocateAll');
    const locatePlan = locatePlanForLocateAll(locateParam);
    const plans = [locatePlan];
    const defaultModel = this.resolveModelRuntime('default');
    const planningModel = this.resolveModelRuntime('planning');

    const { output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(locateParam)),
      plans,
      planningModel,
      defaultModel,
      opt?.uiContext ? { uiContext: opt.uiContext } : undefined,
    );

    const { elements } = output;

    return (elements || []).map(
      (element: LocateResultElement & { dpr?: number }) => ({
        rect: element.rect,
        center: element.center,
        dpr: element.dpr,
      }),
    );
  }

  async aiAssert(
    assertion: TUserPrompt,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ) {
    return this.aiAssertWithContext(assertion, undefined, msg, opt);
  }

  private async aiAssertWithContext(
    assertion: TUserPrompt,
    uiContext?: UIContext,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ) {
    const modelRuntime = this.resolveModelRuntime('insight');

    const serviceOpt: ServiceExtractOption = {
      domIncluded: opt?.domIncluded ?? defaultServiceExtractOption.domIncluded,
      screenshotIncluded:
        opt?.screenshotIncluded ??
        defaultServiceExtractOption.screenshotIncluded,
    };

    const assertionWithContext = buildPromptWithContext(
      assertion,
      opt?.context,
    );
    const { textPrompt, multimodalPrompt } = parsePrompt(assertionWithContext);
    const assertionText =
      typeof assertion === 'string' ? assertion : assertion.prompt;

    const executionOptions = {
      abortSignal: opt?.abortSignal,
      ...(uiContext ? { uiContext } : {}),
    };

    try {
      const { output, thought } =
        await this.taskExecutor.createTypeQueryExecution<boolean>(
          'Assert',
          textPrompt,
          modelRuntime,
          serviceOpt,
          multimodalPrompt,
          executionOptions,
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
    const modelRuntime = this.resolveModelRuntime('insight');
    await this.taskExecutor.waitFor(
      assertion,
      {
        ...opt,
        timeoutMs: opt?.timeoutMs || 15 * 1000,
        checkIntervalMs: opt?.checkIntervalMs || 3 * 1000,
      },
      modelRuntime,
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

  /**
   * Subscribe to the generic agent progress bus. The listener receives every
   * progress event regardless of producer; narrow by `event.scope` to handle a
   * specific producer (e.g. `'aiAct'`).
   * @param listener Listener function
   * @returns A remove function that can be called to remove this listener
   */
  addProgressListener(listener: AgentProgressListener): () => void {
    return this.progressBus.subscribe(listener);
  }

  /**
   * Remove a progress listener added via {@link addProgressListener}.
   */
  removeProgressListener(listener: AgentProgressListener): void {
    this.progressBus.unsubscribe(listener);
  }

  /**
   * Clear all generic progress listeners.
   */
  clearProgressListeners(): void {
    this.progressBus.clear();
  }

  private notifyDumpUpdateListeners(executionDump?: ExecutionDump) {
    const dumpString = this.dumpDataString();
    for (const listener of this.dumpUpdateListeners) {
      try {
        listener(dumpString, executionDump);
      } catch (error) {
        console.error('Error in onDumpUpdate listener', error);
      }
    }
  }

  async destroy() {
    // Early return if already destroyed
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    // Stop any active observer before tearing down the interface. The observer
    // may hold a frame source subscription that needs explicit cleanup.
    if (this.activeObserver) {
      try {
        await this.activeObserver.stop();
      } catch (error) {
        debug(`error stopping active observer during destroy: ${error}`);
      }
      // onStopped callback should have cleared this, but ensure it's null
      this.activeObserver = null;
    }

    let interfaceDestroyError: unknown;
    try {
      await this.interface.destroy?.();
    } catch (error) {
      interfaceDestroyError = error;
    }

    // Wait for all queued write operations to complete
    await this.reportGenerator.flush();

    const finalPath = await this.reportGenerator.finalize();
    this.reportFile = finalPath;

    this.resetDump(); // reset dump to release memory

    if (interfaceDestroyError) {
      throw interfaceDestroyError;
    }
  }

  async recordToReport(title?: string, opt?: RecordToReportOptions) {
    const now = Date.now();
    const screenshots = opt?.screenshots;
    const screenshotBase64 = opt?.screenshotBase64;
    const hasScreenshots = screenshots !== undefined;
    const hasScreenshotBase64 = screenshotBase64 !== undefined;
    if (hasScreenshots && !Array.isArray(screenshots)) {
      throw new Error('recordToReport: screenshots must be an array');
    }
    if (hasScreenshotBase64 && typeof screenshotBase64 !== 'string') {
      throw new Error('recordToReport: screenshotBase64 must be a string');
    }
    if (hasScreenshots && hasScreenshotBase64) {
      throw new Error(
        'recordToReport: provide only one of screenshots or screenshotBase64',
      );
    }
    if (opt && 'subType' in opt) {
      throw new Error('recordToReport: subType is not supported');
    }
    const customScreenshots = hasScreenshots ? screenshots : undefined;
    if (customScreenshots && customScreenshots.length === 0) {
      throw new Error('recordToReport: screenshots cannot be empty');
    }
    const screenshotInputs: RecordToReportScreenshot[] =
      customScreenshots ??
      (hasScreenshotBase64
        ? [{ base64: screenshotBase64 }]
        : [{ base64: await this.interface.screenshotBase64() }]);

    // 1. build recorder
    const recorder: ExecutionRecorderItem[] = screenshotInputs.map(
      (screenshotInput, index) => {
        const normalizedScreenshotInput = normalizeRecordToReportScreenshot(
          screenshotInput,
          index,
        );
        const ts = now + index;
        return {
          type: 'screenshot',
          ts,
          screenshot: ScreenshotItem.create(
            normalizedScreenshotInput.base64,
            ts,
          ),
          description: normalizedScreenshotInput.description,
        };
      },
    );
    // 2. build ExecutionTaskLog
    const task: ExecutionTaskLog = {
      taskId: uuid(),
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
    // 3. build ExecutionDump
    const executionDump = new ExecutionDump({
      id: uuid(),
      logTime: now,
      name: `Log - ${title || 'untitled'}`,
      description: opt?.content || '',
      tasks: [task],
    });
    // 4. append to execution dump
    this.appendExecutionDump(executionDump);

    this.writeOutActionDumps(executionDump);
    await this.reportGenerator.flush();

    // Call all registered dump update listeners
    this.notifyDumpUpdateListeners(executionDump);
  }

  async recordErrorToReport(
    title: string,
    opt: {
      error: Error;
      content?: string;
      screenshotBase64?: string;
    },
  ) {
    const now = Date.now();
    const recorder: ExecutionRecorderItem[] = [];
    const base64 =
      opt.screenshotBase64 ?? (await this.interface.screenshotBase64());
    if (base64) {
      recorder.push({
        type: 'screenshot',
        ts: now,
        screenshot: ScreenshotItem.create(base64, now),
      });
    }

    const task: ExecutionTaskLog = {
      taskId: uuid(),
      type: 'Log',
      subType: 'Error',
      status: 'failed',
      recorder,
      timing: {
        start: now,
        end: now,
        cost: 0,
      },
      param: {
        content: opt.content || '',
      },
      error: opt.error,
      errorMessage: opt.error.message,
      errorStack: opt.error.stack,
      executor: async () => {},
    };

    const executionDump = new ExecutionDump({
      id: uuid(),
      logTime: now,
      name: title,
      description: opt.content || opt.error.message,
      tasks: [task],
    });

    this.appendExecutionDump(executionDump);
    this.writeOutActionDumps(executionDump);
    await this.reportGenerator.flush();
    this.notifyDumpUpdateListeners(executionDump);
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
    cacheDir?: string;
  } | null {
    validateAgentCacheInput(opts.cache);

    // Use the unified utils function to process cache configuration
    const cacheConfig = processCacheConfig(
      opts.cache,
      opts.cacheId || 'default',
    );

    if (!cacheConfig) {
      return null;
    }

    // Handle cache configuration object
    if (typeof cacheConfig === 'object' && cacheConfig !== null) {
      const id = cacheConfig.id;
      const strategyValue = cacheConfig.strategy ?? 'read-write';
      const isReadOnly = strategyValue === 'read-only';
      const isWriteOnly = strategyValue === 'write-only';

      return {
        id,
        enabled: !isWriteOnly,
        readOnly: isReadOnly,
        writeOnly: isWriteOnly,
        cacheDir: cacheConfig.cacheDir?.trim(),
      };
    }

    return null;
  }

  private normalizeFileInput(files: string | string[]): string[] {
    const filesArray = Array.isArray(files) ? files : [files];
    return normalizeFilePaths(filesArray);
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
