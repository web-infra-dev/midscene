import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Agent } from '@/agent/agent';
import type {
  DeviceAction,
  FreeFn,
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
} from '@/types';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getDebug } from '@midscene/shared/logger';
import { assert, ifInBrowser, ifInWorker, uuid } from '@midscene/shared/utils';
import type { WorkflowDocumentExecutionResult } from '../test-runner';
import {
  WorkflowExecutionFailure,
  WorkflowPublicationError,
} from '../test-runner/engine/execution-failure';
import { cleanupResources } from '../test-runner/engine/resource-operations';
import { runFreeFnCleanup } from './cleanup';
import {
  YamlExecutionOwnershipError,
  currentYamlSignal,
  enterYamlExecution,
  runInYamlExecutionContext,
} from './execution-session';
import { createLegacyYamlExecutionRecord } from './legacy-yaml-execution-record';
import { publishLegacyYamlReport } from './legacy-yaml-report';
import {
  createLegacyYamlRuntime,
  legacyYamlOutcomeError,
} from './legacy-yaml-runtime';
import {
  getLegacyYamlPlayerState,
  initializeLegacyYamlPlayerState,
} from './player-state';
import { collectLegacyYamlDocument } from './test-runner-compat';
import { resolveWebTarget, resolveYamlOutputConfig } from './utils';

const debug = getDebug('yaml-player');

/**
 * Compatibility facade for the legacy YAML API.
 *
 * Execution is delegated to the shared Runner kernel through
 * createLegacyYamlRuntime(). This class keeps the mutable status, result,
 * progress, output, and setup/cleanup behavior exposed by the old API.
 */
export class ScriptPlayer<T extends MidsceneYamlScriptEnv> {
  public currentTaskIndex?: number;
  public taskStatusList: ScriptPlayerTaskStatus[] = [];
  public status: ScriptPlayerStatusValue = 'init';
  public reportFile?: string | null;
  public result: Record<string, any>;
  private unnamedResultIndex = 0;
  private publicationErrors: WorkflowPublicationError[] = [];
  public output?: string | null;
  public unstableLogContent?: string | null;
  public errorInSetup?: Error;
  private interfaceAgent: Agent | null = null;
  public agentStatusTip?: string;
  public target?: MidsceneYamlScriptEnv;
  private actionSpace: DeviceAction[] = [];
  private scriptPath?: string;

  constructor(
    private script: MidsceneYamlScript,
    private setupAgent: (platform: T) => Promise<{
      agent: Agent;
      freeFn: FreeFn[];
    }>,
    public onTaskStatusChange?: (taskStatus: ScriptPlayerTaskStatus) => void,
    scriptPath?: string,
  ) {
    this.scriptPath = scriptPath;
    // Collection validates syntax but defers old task/Step errors until execution.
    collectLegacyYamlDocument(script, scriptPath);
    initializeLegacyYamlPlayerState(this);
    this.result = {};

    this.target =
      resolveWebTarget(script)?.target ||
      script.android ||
      script.ios ||
      script.harmony ||
      script.computer ||
      script.config;
    const outputConfig = resolveYamlOutputConfig(script);

    if (ifInBrowser || ifInWorker) {
      this.output = undefined;
      debug('output is undefined in browser or worker');
    } else if (outputConfig.output) {
      this.output = resolve(process.cwd(), outputConfig.output);
      debug('setting output by config.output', this.output);
    } else {
      const scriptName = this.scriptPath
        ? basename(this.scriptPath, '.yaml').replace(/\.(ya?ml)$/i, '')
        : 'script';
      this.output = join(
        getMidsceneRunSubDir('output'),
        `${scriptName}-${uuid()}.json`,
      );
      debug('setting output by script path', this.output);
    }

    if (ifInBrowser || ifInWorker) {
      this.unstableLogContent = undefined;
    } else if (typeof outputConfig.unstableLogContent === 'string') {
      this.unstableLogContent = resolve(
        process.cwd(),
        outputConfig.unstableLogContent,
      );
    } else if (outputConfig.unstableLogContent === true) {
      this.unstableLogContent = join(
        getMidsceneRunSubDir('output'),
        'unstableLogContent.json',
      );
    }

    this.taskStatusList = (script.tasks || []).map((task, taskIndex) => ({
      ...task,
      index: taskIndex,
      status: 'init',
      totalSteps: task.flow?.length || 0,
    }));
  }

  private setResult(key: string | undefined, value: any) {
    const keyToUse = key || this.unnamedResultIndex++;
    if (this.result[keyToUse]) {
      getDebug('yaml-player', { console: true })(
        `result key ${keyToUse} already exists, will overwrite`,
      );
    }
    this.result[keyToUse] = value;

    return this.flushResult();
  }

  private setPlayerStatus(status: ScriptPlayerStatusValue, error?: Error) {
    this.status = status;
    this.errorInSetup = error;
  }

  private notifyCurrentTaskStatusChange(taskIndex?: number) {
    const taskIndexToNotify =
      typeof taskIndex === 'number' ? taskIndex : this.currentTaskIndex;

    if (typeof taskIndexToNotify !== 'number') return;

    const taskStatus = this.taskStatusList[taskIndexToNotify];
    this.onTaskStatusChange?.(taskStatus);
  }

  private async setTaskStatus(
    index: number,
    statusValue: ScriptPlayerStatusValue,
    error?: Error,
  ) {
    this.taskStatusList[index].status = statusValue;
    if (error) this.taskStatusList[index].error = error;
    this.notifyCurrentTaskStatusChange(index);
  }

  private setTaskIndex(taskIndex: number) {
    this.currentTaskIndex = taskIndex;
  }

  private async flushResult() {
    if (this.output) {
      const output = resolve(process.cwd(), this.output);
      await this.publish(output, async () => {
        const outputDir = dirname(output);
        await mkdir(outputDir, { recursive: true });
        await writeFile(
          output,
          JSON.stringify(this.result || {}, undefined, 2),
        );
      });
    }
  }

  private async flushUnstableLogContent() {
    if (this.unstableLogContent) {
      const content = this.interfaceAgent?._unstableLogContent();
      const filePath = resolve(process.cwd(), this.unstableLogContent);
      await this.publish(filePath, async () => {
        const outputDir = dirname(filePath);
        await mkdir(outputDir, { recursive: true });
        await writeFile(filePath, JSON.stringify(content, null, 2));
      });
    }
  }

  private async publish(path: string, write: () => Promise<void>) {
    try {
      await write();
    } catch (cause) {
      const error = new WorkflowPublicationError('write-result', path, cause);
      this.publicationErrors.push(error);
      throw error;
    }
  }

  private createRuntime(agent: Agent) {
    return createLegacyYamlRuntime({
      agent,
      actionSpace: this.actionSpace,
      sourcePath: this.scriptPath,
      setResult: (key, value) => this.setResult(key, value),
    });
  }

  async playTask(taskStatus: ScriptPlayerTaskStatus, agent: Agent) {
    const { flow } = taskStatus;
    assert(flow, 'missing flow in task');
    const statusIndex = this.taskStatusList.indexOf(taskStatus);
    const declaredIndex = (
      taskStatus as ScriptPlayerTaskStatus & {
        index?: unknown;
      }
    ).index;
    const taskIndex =
      statusIndex >= 0
        ? statusIndex
        : typeof declaredIndex === 'number' && Number.isInteger(declaredIndex)
          ? declaredIndex
          : 0;

    const state = getLegacyYamlPlayerState(this);
    state.executionResult = await this.createRuntime(agent).runTask(
      taskStatus,
      taskIndex,
      {
        onStepStart: (info) => {
          if (info.scope === 'case' && info.case.phase === 'steps') {
            taskStatus.currentStep = info.case.stepIndex;
          }
        },
      },
    );

    const outcome = state.executionResult.cases[0];
    if (!outcome || outcome.status === 'not-run') {
      throw new Error(`Task "${taskStatus.name}" did not run.`);
    }
    if (outcome.status === 'failed') throw legacyYamlOutcomeError(outcome);

    this.reportFile = agent.reportFile;
    await this.flushUnstableLogContent();
  }

  async run() {
    return runInYamlExecutionContext(() => this.runInContext());
  }

  private async runInContext() {
    const startedAt = new Date();
    const runId = uuid();
    const state = getLegacyYamlPlayerState(this);
    state.executionResult = undefined;
    state.executionRecord = undefined;
    this.publicationErrors = [];
    const { android, ios, harmony, computer } = this.script;
    const webEnv = resolveWebTarget(this.script)?.target;
    const androidEnv = android;
    const iosEnv = ios;
    const harmonyEnv = harmony;
    const computerEnv = computer;
    const platform =
      webEnv || androidEnv || iosEnv || harmonyEnv || computerEnv;

    this.setPlayerStatus('running');

    let agent: Agent | null = null;
    let freeFn: FreeFn[] = [];
    let setupError: unknown;
    let executionError: unknown;
    let cleanupError: unknown;
    let signal: AbortSignal | undefined;
    let session: ReturnType<typeof enterYamlExecution> | undefined;
    try {
      const { agent: newAgent, freeFn: newFreeFn } = await this.setupAgent(
        platform as T,
      );
      // Register ownership immediately: discovering actions can fail too.
      agent = newAgent;
      agent._prepareForTestRunner?.();
      freeFn = [...(newFreeFn || [])];
      session = enterYamlExecution(agent);
      signal = currentYamlSignal(agent);
      signal?.throwIfAborted();
      this.actionSpace = await agent.getActionSpace();
      const originalOnTaskStartTip = agent.onTaskStartTip;
      agent.onTaskStartTip = (tip) => {
        if (this.status === 'running') this.agentStatusTip = tip;
        originalOnTaskStartTip?.(tip);
      };
      freeFn.push({
        name: 'restore-agent-onTaskStartTip',
        fn: () => {
          if (agent) agent.onTaskStartTip = originalOnTaskStartTip;
        },
      });
    } catch (error) {
      // A rejected borrower must not close or publish into another run's Agent.
      if (error instanceof YamlExecutionOwnershipError) throw error;
      setupError = error;
      this.setPlayerStatus('error', error as Error);
    }
    this.interfaceAgent = agent;

    const document = collectLegacyYamlDocument(
      this.script,
      this.scriptPath ?? '<inline-yaml>',
      this.actionSpace,
    );
    const runtime =
      agent && !setupError ? this.createRuntime(agent) : undefined;
    try {
      if (runtime && agent) {
        state.executionResult = await runtime.runScript(this.script, {
          document,
          signal,
          createDocumentRunId: () => runId,
          onCaseStart: (collectedCase) => {
            const taskIndex = collectedCase.caseIndex;
            this.setTaskIndex(taskIndex);
            return this.setTaskStatus(taskIndex, 'running');
          },
          onStepStart: (info) => {
            if (info.scope !== 'case' || info.case.phase !== 'steps') return;
            const taskStatus = this.taskStatusList[info.case.caseIndex];
            if (taskStatus) taskStatus.currentStep = info.case.stepIndex;
          },
          onCaseOutcome: async (outcome) => {
            if (outcome.status === 'not-run') return;
            const taskIndex = outcome.caseIndex;
            const taskStatus = this.taskStatusList[taskIndex];
            assert(taskStatus, `missing YAML task at index ${taskIndex}`);

            this.reportFile = agent?.reportFile;
            if (outcome.status === 'success') {
              await this.setTaskStatus(taskIndex, 'done');
              await this.flushUnstableLogContent();
              return;
            }

            const error = legacyYamlOutcomeError(outcome);
            await this.setTaskStatus(taskIndex, 'error', error);
          },
        });
        const stoppedOnFailure = state.executionResult.cases.some(
          (outcome) =>
            outcome.status === 'failed' &&
            !this.taskStatusList[outcome.caseIndex]?.continueOnError,
        );
        this.setPlayerStatus(
          stoppedOnFailure || signal?.aborted ? 'error' : 'done',
        );
      }
    } catch (error) {
      executionError = error;
      if (error instanceof WorkflowExecutionFailure)
        state.executionResult = error.result as WorkflowDocumentExecutionResult;
      this.setPlayerStatus('error', error as Error);
    }

    this.reportFile = agent?.reportFile;
    this.agentStatusTip = '';

    try {
      // A timeout settles the Runner before an uncooperative device action.
      // Never dispose its Agent while that action is still using it.
      if (session?.isRoot && agent) {
        await cleanupResources([agent], () => runFreeFnCleanup(freeFn), {
          owner: this,
          signal,
          onDeferredError: (error) =>
            getDebug('yaml-player', { console: true })(
              `Deferred YAML cleanup failed: ${String(error)}`,
            ),
        });
      } else await runFreeFnCleanup(freeFn);
    } catch (error) {
      cleanupError = error;
      this.setPlayerStatus(
        'error',
        (setupError ?? executionError ?? error) as Error,
      );
    }

    const endedAt = new Date();
    const cleanupErrors =
      cleanupError instanceof AggregateError
        ? cleanupError.errors
        : cleanupError === undefined
          ? []
          : [cleanupError];
    state.executionRecord = createLegacyYamlExecutionRecord({
      runId,
      attemptIndex: 0,
      script: this.script,
      document,
      startedAt,
      endedAt,
      execution: state.executionResult,
      setupError,
      executionError,
      cleanupErrors,
      aborted: signal?.aborted ?? false,
      publicationErrors: this.publicationErrors,
      outputs: this.result,
      reportFile: agent?.reportFile,
      children: session?.children,
    });
    let reportError: unknown;
    if (!session || session.isRoot) {
      try {
        const published = await publishLegacyYamlReport({
          agent,
          record: state.executionRecord,
          runId,
          script: this.script,
          scriptPath: this.scriptPath,
          fallbackReportFileName: state.fallbackReportFileName,
        });
        this.reportFile = published.reportFile;
        state.executionRecord = published.record;
      } catch (error) {
        reportError = error;
        this.setPlayerStatus(
          'error',
          (setupError ?? executionError ?? cleanupError ?? error) as Error,
        );
        state.executionRecord = Object.freeze({
          ...state.executionRecord,
          status: 'failed',
          reportError: error,
        });
      }
    }
    session?.finish(state.executionRecord);
    if (reportError) {
      const errors = [
        setupError,
        executionError,
        ...cleanupErrors,
        reportError,
      ].filter((error) => error !== undefined);
      throw errors.length === 1
        ? reportError
        : new AggregateError(
            errors,
            'YAML execution/report finalization failed',
          );
    }
    if (executionError && cleanupError) {
      throw new AggregateError(
        [executionError, ...cleanupErrors],
        'YAML execution and cleanup failed',
      );
    }
    if (executionError) throw executionError;
    if (cleanupError) throw cleanupError;
  }
}
