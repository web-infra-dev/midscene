import type { ModelTaskType } from '@/ai-model/model-adapter/types';
import type { ModelRuntime } from '@/ai-model/models';
import { resolveModelForTaskType } from '@/ai-model/models/model-fallback';
import { INTERNAL_CALL_ID_FIELD } from '@/ai-model/service-caller';
import yaml from 'js-yaml';
import type { TUserPrompt } from '../ai-model/index';
import { ScreenshotItem } from '../screenshot-item';
import Service from '../service/index';
import {
  hasPendingResourceOperation,
  waitForResourceIdle,
} from '../test-runner/engine/resource-operations';
import type { WorkflowExecutionRecord } from '../test-runner/execution-record';
// Import types and values directly from their source files to avoid circular dependency
// DO NOT import from '../index' as it creates a circular dependency:
// index.ts -> agent/index.ts -> agent/agent.ts -> index.ts
import {
  type AIUsageInfo,
  type ActionParam,
  type ActionReturn,
  type AgentAIContextKey,
  type AgentAIContexts,
  type AgentAssertResult,
  type AgentOpt,
  type AgentProgressListener,
  type AgentWaitForOpt,
  type AiActEffort,
  type AiApiName,
  type AssertOptions,
  type DeepThinkOption,
  type DeviceAction,
  ExecutionDump,
  type ExecutionRecorderItem,
  type ExecutionTask,
  type ExecutionTaskLog,
  type InsightAPI,
  type LocateOption,
  type LocateResultElement,
  type OnTaskStartTip,
  type PlanningAction,
  type QueryOptions,
  type RecordToReportOptions,
  type RecordToReportScreenshot,
  type Rect,
  type ReportActionDump,
  type ScrollParam,
  type ServiceAction,
  type ServiceExtractParam,
  type TestStatus,
  type UIContext,
} from '../types';
import type { MidsceneYamlScript } from '../yaml';
import {
  YamlExecutionOwnershipError,
  currentYamlSignal,
  enterYamlAction,
  enterYamlExecution,
  hasActiveYamlExecution,
  runInYamlExecutionContext,
} from '../yaml/execution-session';

import {
  ScriptPlayer,
  buildDetailedLocateParam,
  buildDetailedLocateParamAndRestParams,
  parseYamlScript,
} from '../yaml/index';

import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { AbstractInterface, InputStrategy } from '@/device';
import type { TaskRunner } from '@/task-runner';
import { isAgentAIContextKey } from '@midscene/shared/agent-tools/agent-context';
import { serializeError } from '@midscene/shared/agent-tools/error-formatter';
import {
  type ObservationArtifactAdapter,
  observationArtifactAdapterSymbol,
} from '@midscene/shared/agent-tools/observation-artifact';
import {
  type CreateOpenAIClientFn,
  type IModelConfig,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  ModelConfigManager,
  type TIntent,
  globalConfigManager,
  globalModelConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert, uuid } from '@midscene/shared/utils';
import {
  defineActionRegisterFileChooserAccept,
  defineActionSleep,
} from '../device';
import { ActionReadiness, isActionReadinessError } from './action-readiness';
import { normalizeAgentOptions, withAgentDefaults } from './agent-options';
import { AgentReportManager } from './agent-report-manager';
import { normalizeAgentCacheConfig } from './cache-config';
import { FileChooserAccepter } from './file-chooser';
import { Insight } from './insight';
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
import { TaskExecutor, locatePlanForLocate, withFileChooser } from './tasks';
import {
  type AgentTestRunnerNodeDefinition,
  commonAgentTestRunnerNodeDefinitions,
} from './test-runner-nodes';
import {
  UIObservationImpl,
  type UIObserver,
  UIObserverImpl,
  type UIObserverOption,
  uiContextFromObservationRecord,
} from './ui-observer';
import {
  type TaskTitleType,
  locateParamStr,
  paramStr,
  taskTitleStr,
  typeStr,
} from './ui-utils';
import {
  commonContextParser,
  normalizeFilePaths,
  normalizeScrollType,
} from './utils';

const debug = getDebug('agent');
const warn = getDebug('agent', { console: true });

class AgentScopedModelConfigManager extends ModelConfigManager {
  constructor(
    private readonly baseManager: ModelConfigManager,
    private readonly createOpenAIClient?: CreateOpenAIClientFn,
  ) {
    super();
  }

  override getModelConfig(intent: TIntent): IModelConfig {
    return {
      ...this.baseManager.getModelConfig(intent),
      createOpenAIClient: this.createOpenAIClient,
    };
  }
}

export type AiActOptions = {
  cacheable?: boolean;
  fileChooserAccept?: string | string[];
  fileChooserAllowedDir?: string;
  effort?: AiActEffort;
  deepThink?: DeepThinkOption;
  deepLocate?: boolean;
  abortSignal?: AbortSignal;
  /**
   * Additional facts, rules, constraints, or output requirements for this AI
   * call. It overrides `aiContexts.aiAct` and `aiContexts.default`; `''`
   * disables inherited user context for this call.
   */
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
  inputStrategy?: InputStrategy;
  mode?: 'replace' | 'clear' | 'typeOnly' | 'append';
};

export class Agent<InterfaceType extends AbstractInterface = AbstractInterface>
  implements InsightAPI
{
  /** Nodes this Agent class intentionally exposes to Test Runner. */
  static getTestRunnerNodeDefinitions(): readonly AgentTestRunnerNodeDefinition[] {
    return commonAgentTestRunnerNodeDefinitions;
  }

  interface: InterfaceType;

  service: Service;

  private reportManager: AgentReportManager;

  get dump(): ReportActionDump {
    return this.reportManager.dump;
  }
  set dump(value: ReportActionDump) {
    this.reportManager.dump = value;
  }
  get reportFile(): string | null | undefined {
    return this.reportManager.reportFile;
  }
  set reportFile(value: string | null | undefined) {
    this.reportManager.reportFile = value;
  }
  get reportFileName(): string | undefined {
    return this.reportManager.reportFileName;
  }
  set reportFileName(value: string | undefined) {
    this.reportManager.reportFileName = value;
  }

  /** @internal Runner snapshots retain immutable data and shared image files. */
  async _prepareForTestRunner(): Promise<void> {
    await this.reportManager._prepareForTestRunner();
  }
  async _createReportSource(scopeId: string, executionIds?: readonly string[]) {
    return this.reportManager._createReportSource(scopeId, executionIds);
  }

  /** @internal The Agent owns one report stream across root YAML invocations. */
  async _writeYamlExecutionReport(
    record: WorkflowExecutionRecord,
  ): Promise<string | undefined> {
    return this.reportManager._writeYamlExecutionReport(record);
  }

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

  // Generic progress bus: every producer (aiAct today, more later) broadcasts
  // through here. Consumers narrow by `event.scope`.
  private readonly progressBus = new AgentProgressBus();

  get onDumpUpdate():
    | ((dump: string, executionDump?: ExecutionDump) => void)
    | undefined {
    return this.reportManager.onDumpUpdate;
  }
  set onDumpUpdate(callback:
    | ((dump: string, executionDump?: ExecutionDump) => void)
    | undefined) {
    this.reportManager.onDumpUpdate = callback;
  }

  destroyed = false;

  private readonly actionReadiness?: ActionReadiness;

  modelConfigManager: ModelConfigManager;

  /**
   * Frozen page context for consistent AI operations
   */
  private frozenUIContext?: UIContext;

  /**
   * Currently active UIObserver (from startObserving). Only one observer may
   * be active at a time since frame sources are device-level singletons.
   */
  private activeObserver: UIObserverImpl | null = null;

  /** Observers own temporary frame files until their observation is disposed. */
  private ownedObservers = new Set<UIObserverImpl>();

  private get aiContexts(): AgentAIContexts {
    if (!this.opts.aiContexts) {
      this.opts.aiContexts = {};
    }
    return this.opts.aiContexts;
  }

  private resolveUserContext(
    apiName: AiApiName,
    callContext?: string,
  ): string | undefined {
    if (callContext !== undefined) {
      return callContext;
    }

    const apiContext = this.opts.aiContexts?.[apiName];
    if (apiContext !== undefined) {
      return apiContext;
    }

    const defaultContext = this.opts.aiContexts?.default;
    if (defaultContext !== undefined) {
      return defaultContext;
    }

    return undefined;
  }

  private withContext<T extends { context?: string }>(
    apiName: AiApiName,
    options?: T,
  ): T | undefined {
    const resolvedContext = this.resolveUserContext(apiName, options?.context);
    if (resolvedContext === undefined) {
      return options;
    }

    return {
      ...(options ?? ({} as T)),
      context: resolvedContext,
    };
  }

  private fullActionSpace: DeviceAction[];

  private activeFileChooserAccepter?: FileChooserAccepter;

  private activeFileChooserAllowedDir?: string;

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

  private resolveModelRuntime(
    intent: TIntent,
    taskType: ModelTaskType,
  ): ModelRuntime {
    const runtime = resolveModelForTaskType(
      this.modelConfigManager,
      intent,
      taskType,
    );
    return {
      ...runtime,
      onUsage: (usage) => {
        this.usageCallCounter += 1;
        // buildUsageInfo leaves intent undefined; fill it from the
        // requested role, even when its configuration falls back to default.
        const enriched = usage.intent ? usage : { ...usage, intent };
        this.consumeUsage(
          enriched,
          `callai:${usage.request_id ?? this.usageCallCounter}`,
        );
      },
    };
  }

  private createInsight(getUIContext?: () => UIContext): Insight {
    return new Insight(
      {
        createTypeQueryExecution: (...args) =>
          this.withReportOperation(() =>
            this.taskExecutor.createTypeQueryExecution(...args),
          ),
      },
      (taskType) => this.resolveModelRuntime('insight', taskType),
      (apiName, callContext) => this.resolveUserContext(apiName, callContext),
      getUIContext,
    );
  }

  constructor(interfaceInstance: InterfaceType, opts?: AgentOpt) {
    this.interface = interfaceInstance;

    this.opts = withAgentDefaults(opts);
    if (this.opts.waitForActionReady !== undefined) {
      this.actionReadiness = new ActionReadiness(this.opts.waitForActionReady);
    }

    normalizeAgentOptions(this.opts, warn);

    // Explicit modelConfig is isolated from global configuration.
    // A custom client factory alone still uses the global model values.
    this.modelConfigManager = opts?.modelConfig
      ? new ModelConfigManager(opts.modelConfig, opts.createOpenAIClient)
      : opts?.createOpenAIClient
        ? new AgentScopedModelConfigManager(
            globalModelConfigManager,
            opts.createOpenAIClient,
          )
        : globalModelConfigManager;

    this.onTaskStartTip = this.opts.onTaskStartTip;

    this.service = new Service(async () => {
      return this.getUIContext();
    });

    // Process cache configuration
    const cacheConfigObj = normalizeAgentCacheConfig(opts || {});
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
    const fileChooserActions = this.interface.registerFileChooserListener
      ? [
          defineActionRegisterFileChooserAccept(async (files) => {
            if (!this.activeFileChooserAccepter) {
              throw new Error(
                'RegisterFileChooserAccept can only be used while aiAct is running',
              );
            }
            if (!this.activeFileChooserAllowedDir) {
              throw new Error(
                'RegisterFileChooserAccept requires aiAct option fileChooserAllowedDir',
              );
            }
            await this.activeFileChooserAccepter.registerFromAllowedDir(
              files,
              this.activeFileChooserAllowedDir,
            );
          }),
        ]
      : [];
    this.fullActionSpace = [
      ...baseActionSpace,
      ...fileChooserActions,
      defineActionSleep(),
    ];

    this.taskExecutor = new TaskExecutor(this.interface, this.service, {
      getDefaultModelRuntime: () =>
        this.resolveModelRuntime('default', 'general'),
      taskCache: this.taskCache,
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
      replanningCycleLimit: this.opts.replanningCycleLimit,
      waitAfterAction: this.opts.waitAfterAction,
      actionReadiness: this.actionReadiness,
      useDeviceTime: this.opts.useDeviceTime,
      getAbortSignal: () => currentYamlSignal(this),
      operationResource: this,
      actionSpace: this.fullActionSpace,
      hooks: {
        onExecutionCreated: (runner) => {
          this.reportManager.bindRunner(runner);
        },
        onSnapshotChange: async (runner) => {
          this.reportManager.assertRunnerCurrent(runner);
          const executionDump = runner.dump();
          this.appendExecutionDump(executionDump, runner);
          this.collectUsageMetrics(executionDump);

          // Persist report updates before notifying listeners so screenshot
          // payloads can be released from memory and serialized as references.
          this.writeOutActionDumps(executionDump);
          await this.reportManager.flushPendingWrites();
          this.reportManager.notifyDumpUpdateListeners(executionDump);
        },
        onProgress: this.progressBus.publish,
      },
    });
    this.reportManager = new AgentReportManager({
      getOptions: () => this.opts,
      getDeviceType: () => this.interface.interfaceType,
      isDestroyed: () => this.destroyed,
      isExternallyBusy: () =>
        Boolean(this.activeObserver) ||
        hasActiveYamlExecution(this) ||
        hasPendingResourceOperation(this),
    });

    Object.defineProperty(this, observationArtifactAdapterSymbol, {
      value: {
        exportRecord: async (observation) => {
          assert(
            observation instanceof UIObservationImpl,
            'Cannot export an observation that was not created by this Midscene runtime',
          );
          return observation.exportRecord();
        },
        loadRecord: (record) => {
          // CLI manifests are validated before this adapter is called. Rebuild
          // once here as a final runtime-boundary check before creating insight.
          uiContextFromObservationRecord(record);
          return new UIObservationImpl(
            record,
            this.createInsight(() => uiContextFromObservationRecord(record)),
          );
        },
      } satisfies ObservationArtifactAdapter,
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
   * Start observing the screen in the background and return a fixed insight
   * surface when the observation is stopped:
   *
   * ```ts
   * const observer = await agent.startObserving();
   * await agent.aiAct('submit the form');
   * const observation = await observer.stop();
   * await observation.aiAssert('a success toast appeared during the process');
   * ```
   *
   * Frames come from the device's continuous frame source when available
   * (scrcpy on Android, WDA MJPEG on iOS — both opt-in; CDP screencast on
   * web) and fall back to plain screenshots otherwise. Sampling is capped at
   * 5fps, the buffer is bounded and self-thinning, decoding is deferred to
   * the end, and all buffered frames (up to `maxFrames`) are sent to
   * the model at insight time. To control token cost for long windows,
   * increase `intervalMs` or decrease `maxFrames`.
   * Awaiting `startObserving()` guarantees one baseline frame is captured
   * before your next action.
   */
  async startObserving(opt?: UIObserverOption): Promise<UIObserver> {
    this.assertReportWritable();
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
    const observer = new UIObserverImpl(
      {
        openFrameSource: async () =>
          (await this.interface.openFrameSource?.()) ?? undefined,
        // Fallback single-frame capture. Deliberately bypasses getUIContext so
        // the observation loop never pollutes the TaskRunner context cache.
        captureRawScreenshot: () => this.interface.screenshotBase64(),
        capturePreparedRepresentative: () => this.getUIContext('assert'),
        createInsight: (record) =>
          this.createInsight(() => uiContextFromObservationRecord(record)),
        onStopped: () => {
          if (this.activeObserver === observer) {
            this.activeObserver = null;
          }
        },
        onDisposed: () => this.ownedObservers.delete(observer),
        screenshotShrinkFactor: this.opts.screenshotShrinkFactor,
      },
      opt,
    );
    // Mark as active BEFORE the async start() so concurrent calls hit the
    // assert guard above. If start() throws, clear the reference below.
    this.activeObserver = observer;
    this.ownedObservers.add(observer);
    try {
      await observer.start();
    } catch (error) {
      this.activeObserver = null;
      this.ownedObservers.delete(observer);
      await observer.dispose().catch((disposeError) => {
        debug(`error disposing failed observer start: ${disposeError}`);
      });
      throw error;
    }
    return observer;
  }

  /**
   * @deprecated Use `setAIContext('aiAct', context)` instead.
   */
  async setAIActionContext(prompt: string) {
    warn(
      'setAIActionContext() is deprecated; use setAIContext("aiAct", context) instead.',
    );
    this.setAIContext('aiAct', prompt);
  }

  /**
   * @deprecated Use `setAIContext('aiAct', context)` instead.
   */
  async setAIActContext(prompt: string) {
    warn(
      'setAIActContext() is deprecated; use setAIContext("aiAct", context) instead.',
    );
    this.setAIContext('aiAct', prompt);
  }

  /**
   * Set Agent-level AI guidance. Use `default` as the shared fallback for all
   * AI-powered APIs, or an API name to override that fallback for the API.
   * API-specific values are not automatically merged with `default`.
   * Passing `undefined` removes the selected value; an API then falls back to
   * `default`, while removing `default` disables the shared fallback. Passing
   * `''` keeps an explicit empty value and therefore prevents an API from using
   * `default`.
   */
  setAIContext(target: AgentAIContextKey, context: string | undefined): void {
    if (!isAgentAIContextKey(target)) {
      throw new TypeError(`Unknown Agent context key: ${String(target)}`);
    }
    if (context !== undefined && typeof context !== 'string') {
      throw new TypeError('Agent context must be a string or undefined');
    }

    this.aiContexts[target] = context;

    if (target === 'aiAct') {
      if (context === undefined) {
        this.opts.aiActContext = undefined;
        this.opts.aiActionContext = undefined;
      } else {
        this.opts.aiActContext = context;
        this.opts.aiActionContext = context;
      }
    }
  }

  private assertReportWritable(): void {
    this.reportManager.assertReportWritable();
  }

  private async withReportOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.reportManager.withReportOperation(operation);
  }

  /**
   * Finalize the preceding report and reset execution records for a new report.
   * Historical artifacts are retained; this Agent and its device stay connected.
   * Await this method before executing again. Concurrent resets share one reset.
   */
  async resetDump(): Promise<ReportActionDump> {
    return this.reportManager.resetDump();
  }

  /**
   * Seal the current report and release its in-memory records without
   * disconnecting the device. Export in-memory data before calling this method.
   * Repeated calls return the same result and never rewrite published artifacts.
   */
  async finalizeReport(): Promise<string | undefined> {
    return this.reportManager.finalizeReport();
  }

  appendExecutionDump(execution: ExecutionDump, runner?: TaskRunner) {
    this.reportManager.appendExecutionDump(execution, runner);
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
    // 2. INTERNAL_CALL_ID_FIELD — callGenerativeAI-generated internal id, covers
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
    return this.reportManager.dumpDataString(opt);
  }

  reportHTMLString(opt?: { inlineScreenshots?: boolean }) {
    return this.reportManager.reportHTMLString(() => this.dumpDataString(opt));
  }

  writeOutActionDumps(executionDump?: ExecutionDump) {
    this.reportManager.writeOutActionDumps(executionDump);
  }

  /** Persist current report data without disposing this Agent or its device. */
  async flushReport(): Promise<string | undefined> {
    return this.reportManager.flushReport();
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
    abortSignal?: AbortSignal,
  ) {
    return this.withReportOperation(() =>
      this.executeActionInActionSpace<T>(type, opt, abortSignal),
    );
  }

  private async executeActionInActionSpace<T>(
    type: string,
    opt?: T,
    abortSignal?: AbortSignal,
  ) {
    debug('callActionInActionSpace', type, ',', opt);

    const clonedActionParam =
      opt && typeof opt === 'object' && !Array.isArray(opt)
        ? { ...opt }
        : opt || {};

    const actionPlan: PlanningAction<T> = {
      type: type as any,
      // Planning resolves locate/from/to in place. Keep the caller's inputs
      // intact so YAML and Test execution facts retain the original prompts.
      param: clonedActionParam as any,
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
    const locateModel = this.resolveModelRuntime('locate', 'locate');
    const planningModel = this.resolveModelRuntime('planning', 'planning');

    const { output } = await this.taskExecutor.runPlans(
      title,
      plans,
      planningModel,
      locateModel,
      { abortSignal: abortSignal ?? currentYamlSignal(this) },
    );
    return output;
  }

  async aiTap(
    locatePrompt: TUserPrompt,
    opt?: LocateOption & { fileChooserAccept?: string | string[] },
  ): Promise<void> {
    await this.withReportOperation(async () => {
      assert(locatePrompt, 'missing locate prompt for tap');

      const detailedLocateParam = buildDetailedLocateParam(
        locatePrompt,
        this.withContext('aiTap', opt),
      );

      const fileChooserAccept = opt?.fileChooserAccept
        ? this.normalizeFileInput(opt.fileChooserAccept)
        : undefined;

      await withFileChooser(this.interface, fileChooserAccept, async () => {
        await this.callActionInActionSpace('Tap', {
          locate: detailedLocateParam,
        });
      });
    });
  }

  async aiRightClick(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for right click');

    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt,
      this.withContext('aiRightClick', opt),
    );

    await this.callActionInActionSpace('RightClick', {
      locate: detailedLocateParam,
    });
  }

  /**
   * Locate an element and click it with the middle mouse button.
   * Requires a device with the MiddleClick action (Web or Computer).
   * @param locatePrompt Description or locator of the target element.
   * @param opt Locator options; per-call context overrides Agent context.
   */
  async aiMiddleClick(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for middle click');

    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt,
      this.withContext('aiMiddleClick', opt),
    );

    await this.callActionInActionSpace('MiddleClick', {
      locate: detailedLocateParam,
    });
  }

  async aiDoubleClick(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for double click');

    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt,
      this.withContext('aiDoubleClick', opt),
    );

    await this.callActionInActionSpace('DoubleClick', {
      locate: detailedLocateParam,
    });
  }

  async aiHover(locatePrompt: TUserPrompt, opt?: LocateOption): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for hover');

    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt,
      this.withContext('aiHover', opt),
    );

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

    const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
      locatePrompt,
      this.withContext('aiInput', opt),
    );

    // Convert value to string to ensure consistency
    const stringValue = typeof value === 'number' ? String(value) : value;

    // backward compat: convert deprecated 'append' to 'typeOnly'
    const mode = opt?.mode === 'append' ? 'typeOnly' : opt?.mode;

    await this.callActionInActionSpace('Input', {
      ...restParams,
      value: stringValue,
      locate: locateParam,
      mode,
    });
  }

  // New signature
  async aiKeyboardPress(
    locatePrompt: TUserPrompt | undefined,
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
    locatePromptOrKeyName: TUserPrompt | string | undefined,
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

    const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
      locatePrompt || '',
      this.withContext('aiKeyboardPress', opt),
    );

    await this.callActionInActionSpace('KeyboardPress', {
      ...restParams,
      locate: locateParam,
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

    const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
      locatePrompt || '',
      this.withContext('aiScroll', opt),
    );

    await this.callActionInActionSpace('Scroll', {
      ...restParams,
      locate: locateParam,
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
    const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
      locatePrompt || '',
      this.withContext('aiPinch', opt),
    );

    await this.callActionInActionSpace('Pinch', {
      ...restParams,
      locate: locateParam,
    });
  }

  async aiLongPress(
    locatePrompt: TUserPrompt,
    opt?: LocateOption & { duration?: number },
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for long press');

    const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
      locatePrompt,
      this.withContext('aiLongPress', opt),
    );

    await this.callActionInActionSpace('LongPress', {
      ...restParams,
      locate: locateParam,
    });
  }

  async aiClearInput(
    locatePrompt: TUserPrompt,
    opt?: LocateOption,
  ): Promise<void> {
    assert(locatePrompt, 'missing locate prompt for clear input');

    const detailedLocateParam = buildDetailedLocateParam(
      locatePrompt,
      this.withContext('aiClearInput', opt),
    );

    await this.callActionInActionSpace('ClearInput', {
      locate: detailedLocateParam,
    });
  }

  async aiAct(
    taskPrompt: TUserPrompt,
    opt?: AiActOptions,
  ): Promise<string | undefined> {
    return this.withReportOperation(() => this.executeAiAct(taskPrompt, opt));
  }

  private async executeAiAct(
    taskPrompt: TUserPrompt,
    opt?: AiActOptions,
  ): Promise<string | undefined> {
    const internalOptions = opt as AiActInternalOptions | undefined;
    const internalReportDisplay = internalOptions?._internalReportDisplay;
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
      const planningModel = this.resolveModelRuntime('planning', 'planning');
      const locateModel = this.resolveModelRuntime('locate', 'locate');
      const aiActContext = this.resolveUserContext('aiAct', opt?.context);
      const cachePrompt = buildPromptWithContext(taskPrompt, aiActContext);
      // Resolve the public planning controls at the API boundary. Internal
      // aiAct plumbing only uses effort from this point onward. The explicit
      // effort option takes precedence over deepThink when both are provided.
      const effort: AiActEffort = (() => {
        const resolvedEffort =
          opt?.effort ?? (opt?.deepThink === true ? 'deepThink' : 'balance');

        if (opt?.effort !== undefined && opt.deepThink !== undefined) {
          warn(
            'When both "effort" and "deepThink" are provided, "effort" takes precedence.',
          );
        }

        if (
          resolvedEffort === 'fast' &&
          planningModel.adapter.planning.kind === 'custom'
        ) {
          throw new Error(
            `The "fast" aiAct effort is not supported with custom planning adapters (modelFamily: ${planningModel.config.modelFamily ?? 'unknown'}).`,
          );
        }

        if (
          resolvedEffort === 'deepThink' &&
          planningModel.adapter.planning.kind === 'custom'
        ) {
          warn(
            `The "deepThink" aiAct effort is not supported with custom planning adapters (modelFamily: ${planningModel.config.modelFamily ?? 'unknown'}). It will be ignored.`,
          );
          return 'balance';
        }

        return resolvedEffort;
      })();

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
          await runInYamlExecutionContext(async () => {
            const replay = enterYamlExecution(this);
            const leaveAction = abortSignal
              ? enterYamlAction(this, abortSignal)
              : undefined;
            try {
              await this.runYaml(yaml);
            } finally {
              leaveAction?.();
              replay.finish();
            }
          });
          return;
        } catch (error) {
          if (
            error instanceof YamlExecutionOwnershipError ||
            isActionReadinessError(error)
          )
            throw error;
          abortSignal?.throwIfAborted();
          cachedYamlFailed = true;
          warn(
            `cached aiAct plan failed, will replan and disable the stale cache: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // If cache matched but is not executable, fall through to normal execution
      const { output: actionOutput } = await this.taskExecutor.action(
        taskPrompt,
        planningModel,
        locateModel,
        aiActContext,
        cacheable,
        replanningCycleLimit,
        effort,
        undefined,
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

    const fileChooserAccepter = this.interface.registerFileChooserListener
      ? new FileChooserAccepter(this.interface)
      : undefined;
    this.activeFileChooserAccepter = fileChooserAccepter;
    this.activeFileChooserAllowedDir = opt?.fileChooserAllowedDir
      ? resolve(opt.fileChooserAllowedDir)
      : undefined;
    let aiActError: { error: unknown } | undefined;
    let fileChooserHandlingError: Error | undefined;
    let result: string | undefined;
    try {
      if (fileChooserAccept?.length) {
        if (!fileChooserAccepter) {
          throw new Error(
            `File upload is not supported on ${this.interface.interfaceType}`,
          );
        }
        await fileChooserAccepter.register(fileChooserAccept);
      }
      result = await runAiAct();
    } catch (error) {
      aiActError = { error };
    } finally {
      this.activeFileChooserAccepter = undefined;
      this.activeFileChooserAllowedDir = undefined;
      try {
        fileChooserHandlingError = await fileChooserAccepter?.clear();
      } catch (error) {
        warn(`Failed to clear file chooser registration: ${error}`);
      }
    }

    if (aiActError) {
      throw aiActError.error;
    }
    if (fileChooserHandlingError) {
      throw fileChooserHandlingError;
    }
    return result;
  }

  async runMarkdown(
    markdownPath: string,
    opt?: AiActOptions,
  ): Promise<string | undefined> {
    return this.withReportOperation(() =>
      this.executeMarkdown(markdownPath, opt),
    );
  }

  private async executeMarkdown(
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
    return this.withReportOperation(() =>
      runGherkinScenario(this, scenarioText, opt),
    );
  }

  /**
   * @deprecated Use {@link Agent.aiAct} instead.
   */
  async aiAction(taskPrompt: TUserPrompt, opt?: AiActOptions) {
    return this.aiAct(taskPrompt, opt);
  }

  async aiQuery<ReturnType = any>(
    demand: ServiceExtractParam,
    opt?: QueryOptions,
  ): Promise<ReturnType> {
    return this.createInsight().aiQuery<ReturnType>(demand, opt);
  }

  async aiBoolean(prompt: TUserPrompt, opt?: QueryOptions): Promise<boolean> {
    return this.createInsight().aiBoolean(prompt, opt);
  }

  async aiNumber(prompt: TUserPrompt, opt?: QueryOptions): Promise<number> {
    return this.createInsight().aiNumber(prompt, opt);
  }

  async aiString(prompt: TUserPrompt, opt?: QueryOptions): Promise<string> {
    return this.createInsight().aiString(prompt, opt);
  }

  async aiAsk(prompt: TUserPrompt, opt?: QueryOptions): Promise<string> {
    return this.createInsight().aiAsk(prompt, opt);
  }

  /**
   * Locate a target in screenshot coordinates. Preserve the model-provided rect
   * when available; otherwise, generate an approximate 8x8 compatibility box.
   * Do not rely on rect for strict element boundaries. Prefer center for the target.
   */
  async aiLocate(prompt: TUserPrompt, opt?: LocateOption) {
    return this.withReportOperation(() => this.executeLocate(prompt, opt));
  }

  private async executeLocate(prompt: TUserPrompt, opt?: LocateOption) {
    const locateParam = buildDetailedLocateParam(
      prompt,
      this.withContext('aiLocate', opt),
    );
    assert(locateParam, 'cannot get locate param for aiLocate');
    const locatePlan = locatePlanForLocate(locateParam);
    const plans = [locatePlan];
    const locateModel = this.resolveModelRuntime('locate', 'locate');
    const planningModel = this.resolveModelRuntime('planning', 'planning');

    const { output } = await this.taskExecutor.runPlans(
      taskTitleStr('Locate', locateParamStr(locateParam)),
      plans,
      planningModel,
      locateModel,
      opt?.uiContext ? { uiContext: opt.uiContext } : undefined,
    );

    const { element } = output;

    return {
      rect: element
        ? (element.rect ?? {
            left: Math.max(element.center[0] - 3.5, 0),
            top: Math.max(element.center[1] - 3.5, 0),
            width: 8,
            height: 8,
          })
        : undefined,
      center: element?.center,
      dpr: element?.dpr,
    } as Pick<LocateResultElement, 'center' | 'dpr'> & {
      rect: Rect;
    };
  }

  async aiAssert(
    assertion: TUserPrompt,
    msg?: string,
    opt?: AssertOptions,
  ): Promise<AgentAssertResult | undefined> {
    return this.createInsight().aiAssert(assertion, msg, opt);
  }

  async aiWaitFor(assertion: TUserPrompt, opt?: AgentWaitForOpt) {
    const modelRuntime = this.resolveModelRuntime('insight', 'boolean');
    const options = this.withContext('aiWaitFor', opt);
    await this.withReportOperation(() =>
      this.taskExecutor.waitFor(
        assertion,
        {
          ...options,
          timeoutMs: options?.timeoutMs || 15 * 1000,
          checkIntervalMs: options?.checkIntervalMs || 3 * 1000,
        },
        modelRuntime,
      ),
    );
  }

  async ai(...args: Parameters<typeof this.aiAct>) {
    return this.aiAct(...args);
  }

  async runYaml(
    yamlScriptContent: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<{
    result: Record<string, any>;
  }> {
    return this.withReportOperation(() =>
      this.executeYaml(yamlScriptContent, options),
    );
  }

  private async executeYaml(
    yamlScriptContent: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<{ result: Record<string, any> }> {
    if (this.destroyed)
      throw new Error('Cannot run YAML using a destroyed Agent.');
    const script = parseYamlScript(yamlScriptContent, 'yaml');
    const player = new ScriptPlayer(
      script,
      async () => {
        return { agent: this, freeFn: [] };
      },
      undefined,
      undefined,
      options?.abortSignal,
    );
    await player.run();

    if (player.status === 'error') {
      const readinessFailure = player.taskStatusList.find((task) =>
        isActionReadinessError(task.error),
      );
      if (readinessFailure) throw readinessFailure.error;
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
    return this.withReportOperation(() =>
      this.interface.evaluateJavaScript!(script),
    );
  }

  /**
   * Add a dump update listener
   * @param listener Listener function
   * @returns A remove function that can be called to remove this listener
   */
  addDumpUpdateListener(
    listener: (dump: string, executionDump?: ExecutionDump) => void,
  ): () => void {
    return this.reportManager.addDumpUpdateListener(listener);
  }

  /** Remove a dump update listener. */
  removeDumpUpdateListener(
    listener: (dump: string, executionDump?: ExecutionDump) => void,
  ): void {
    this.reportManager.removeDumpUpdateListener(listener);
  }

  /** Clear all dump update listeners. */
  clearDumpUpdateListeners(): void {
    this.reportManager.clearDumpUpdateListeners();
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
    this.reportManager.notifyDumpUpdateListeners(executionDump);
  }

  async destroy() {
    // Early return if already destroyed
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    // A Runner cancellation can finish before a non-cooperative device call.
    // Keep the public owner from disposing the interface until that call has
    // actually settled.
    await waitForResourceIdle(this);
    await this.reportManager.waitForOperations();

    // Observers own observation frame files until explicitly disposed.
    for (const observer of this.ownedObservers) {
      try {
        await observer.dispose();
      } catch (error) {
        debug(`error disposing unexported observer during destroy: ${error}`);
      }
    }
    this.ownedObservers.clear();
    this.activeObserver = null;

    let interfaceDestroyError: unknown;
    try {
      await this.interface.destroy?.();
    } catch (error) {
      interfaceDestroyError = error;
    }

    await this.reportManager.waitForReset();
    // Owned YAML cleanup runs before its record includes cleanup errors. The
    // player publishes that record and its source snapshot before finalizing.
    if (!hasActiveYamlExecution(this)) await this.finalizeReport();

    if (interfaceDestroyError) {
      throw interfaceDestroyError;
    }
  }

  /**
   * Wait for a finite, positive duration in milliseconds and record it as a
   * Sleep task with the standard UI snapshots. Does not invoke device action
   * hooks or call a model, but standard UI capture requires valid model
   * configuration. Recorded elapsed time includes screenshot overhead.
   * Initial UI capture failure rejects before waiting; a failed final
   * screenshot does not fail an otherwise completed wait.
   */
  async sleep(
    ms: number,
    options?: { abortSignal?: AbortSignal },
  ): Promise<void> {
    options?.abortSignal?.throwIfAborted();
    await this.withReportOperation(() =>
      this.taskExecutor.sleep(ms, options?.abortSignal),
    );
  }

  async recordToReport(title?: string, opt?: RecordToReportOptions) {
    return this.withReportOperation(() => this.writeRecordToReport(title, opt));
  }

  private async writeRecordToReport(
    title?: string,
    opt?: RecordToReportOptions,
  ) {
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
    await this.reportManager.flushPendingWrites();

    // Call all registered dump update listeners
    this.notifyDumpUpdateListeners(executionDump);
  }

  async recordErrorToReport(
    title: string,
    opt: {
      /** Any thrown value; normalized before it is stored in the report. */
      error: unknown;
      content?: string;
      screenshotBase64?: string;
    },
  ) {
    return this.withReportOperation(() => this.writeErrorToReport(title, opt));
  }

  private async writeErrorToReport(
    title: string,
    opt: { error: unknown; content?: string; screenshotBase64?: string },
  ) {
    const now = Date.now();
    const error = serializeError(opt.error);
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
      error,
      errorMessage: error.message,
      errorStack: error.stack,
      executor: async () => {},
    };

    const executionDump = new ExecutionDump({
      id: uuid(),
      logTime: now,
      name: title,
      description: opt.content || error.message,
      tasks: [task],
    });

    this.appendExecutionDump(executionDump);
    this.writeOutActionDumps(executionDump);
    await this.reportManager.flushPendingWrites();
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
