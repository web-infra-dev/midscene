import { AIResponseParseError, ConversationHistory } from '@/ai-model';
import type { ModelRuntime } from '@/ai-model/models';
import { buildTypeQueryDemandValue } from '@/ai-model/prompt/extraction';
import { genericXmlPlan } from '@/ai-model/workflows/planning';
import {
  type TMultimodalPrompt,
  type TUserPrompt,
  getReadableTimeString,
  multimodalPromptToChatMessages,
  userPromptToMultimodalPrompt,
  userPromptToString,
} from '@/common';
import type { AbstractInterface, FileChooserHandler } from '@/device';
import type Service from '@/service';
import type { TaskRunner } from '@/task-runner';
import { TaskExecutionError } from '@/task-runner';
import type {
  DeviceAction,
  ExecutionTask,
  ExecutionTaskApply,
  ExecutionTaskInsightQueryApply,
  ExecutionTaskPlanningApply,
  ExecutionTaskProgressOptions,
  MidsceneYamlFlowItem,
  PlanningAIResponse,
  PlanningAction,
  PlanningActionParamWaitFor,
  PlanningLocateParam,
  ServiceDump,
  ServiceExtractOption,
  ServiceExtractParam,
} from '@/types';
import { ServiceError } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { ExecutionSession } from './execution-session';
import { TaskBuilder } from './task-builder';
import type { TaskCache } from './task-cache';
export { locatePlanForLocate } from './task-builder';
import { setTimingFieldOnce } from '@/task-timing';
import { descriptionOfTree } from '@midscene/shared/extractor';
import { type TaskTitleType, taskTitleStr } from './ui-utils';
import { withUsageIntent } from './usage-intent';
import { parsePrompt } from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  thought?: string;
  runner: TaskRunner;
}

interface TaskExecutorHooks {
  onTaskUpdate?: (
    runner: TaskRunner,
    error?: TaskExecutionError,
  ) => Promise<void> | void;
}

export type ActionReportOptions = {
  type?: TaskTitleType;
  prompt?: string;
};

const debug = getDebug('device-task-executor');
const warnLog = getDebug('device-task-executor', { console: true });
const maxErrorCountAllowedInOnePlanningLoop = 5;

// Cap each task's planning feedback so a large action output (e.g. a long adb
// shell stdout) cannot blow up the next planning request's context. This is the
// single place that truncates feedback before it is sent to the model; action
// implementations should hand over the untruncated value.
const maxPlanningFeedbackLength = 500;

function truncatePlanningFeedback(feedback: string): string {
  if (feedback.length <= maxPlanningFeedbackLength) {
    return feedback;
  }

  return `${feedback.slice(0, maxPlanningFeedbackLength)}
...[truncated, ${feedback.length - maxPlanningFeedbackLength} more characters]`;
}

export { TaskExecutionError };

export class TaskExecutor {
  interface: AbstractInterface;

  service: Service;

  taskCache?: TaskCache;

  private readonly providedActionSpace: DeviceAction[];

  private readonly taskBuilder: TaskBuilder;

  onTaskStartCallback?: ExecutionTaskProgressOptions['onTaskStart'];

  private readonly hooks?: TaskExecutorHooks;

  replanningCycleLimit?: number;

  waitAfterAction?: number;

  useDeviceTime?: boolean;

  // @deprecated use .interface instead
  get page() {
    return this.interface;
  }

  constructor(
    interfaceInstance: AbstractInterface,
    service: Service,
    opts: {
      taskCache?: TaskCache;
      onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];
      replanningCycleLimit?: number;
      waitAfterAction?: number;
      useDeviceTime?: boolean;
      hooks?: TaskExecutorHooks;
      actionSpace: DeviceAction[];
    },
  ) {
    this.interface = interfaceInstance;
    this.service = service;
    this.taskCache = opts.taskCache;
    this.onTaskStartCallback = opts?.onTaskStart;
    this.replanningCycleLimit = opts.replanningCycleLimit;
    this.waitAfterAction = opts.waitAfterAction;
    this.useDeviceTime = opts.useDeviceTime;
    this.hooks = opts.hooks;
    this.providedActionSpace = opts.actionSpace;
    this.taskBuilder = new TaskBuilder({
      interfaceInstance,
      service,
      taskCache: opts.taskCache,
      actionSpace: this.getActionSpace(),
      waitAfterAction: opts.waitAfterAction,
    });
  }

  private createExecutionSession(
    title: string,
    options?: { tasks?: ExecutionTaskApply[] },
  ) {
    return new ExecutionSession(
      title,
      () => Promise.resolve(this.service.contextRetrieverFn()),
      {
        onTaskStart: this.onTaskStartCallback,
        tasks: options?.tasks,
        onTaskUpdate: this.hooks?.onTaskUpdate,
      },
    );
  }

  private getActionSpace(): DeviceAction[] {
    return this.providedActionSpace;
  }

  /**
   * Set the pending feedback message consumed by the next planning round.
   * The message is always prefixed with the current time. When a body is
   * provided it is appended after the timestamp; otherwise only the time
   * context is recorded. This is the single entry point for writing
   * `pendingFeedbackMessage` so the time prefix stays consistent.
   */
  private setPendingFeedbackMessage(
    conversationHistory: ConversationHistory,
    timeString: string,
    body?: string,
  ) {
    conversationHistory.pendingFeedbackMessage = body
      ? `Time: ${timeString}, ${body}`
      : `Current time: ${timeString}`;
  }

  /**
   * Collect feedback produced by executed tasks for the next planning round.
   * Returns undefined when no task reported feedback.
   */
  private collectPlanningFeedback(tasks: ExecutionTask[]): string | undefined {
    const feedbackMessages = tasks.flatMap(({ planningFeedback }) =>
      planningFeedback ? [truncatePlanningFeedback(planningFeedback)] : [],
    );
    return feedbackMessages.length > 0
      ? feedbackMessages.join('\n\n')
      : undefined;
  }

  /**
   * Get a readable time string. When device time is enabled, use the
   * device-formatted wall-clock time directly so host timezone formatting does
   * not reinterpret a device timestamp.
   * @param format - Optional format string
   * @returns A formatted time string
   */
  private async getTimeString(format?: string): Promise<string> {
    if (this.useDeviceTime) {
      if (this.interface.getDeviceLocalTimeString) {
        try {
          return await this.interface.getDeviceLocalTimeString(format);
        } catch (error) {
          warnLog(
            `Failed to get device time string, falling back to runtime time: ${error}`,
          );
        }
      } else {
        warnLog(
          'useDeviceTime is enabled but getDeviceLocalTimeString is not implemented, falling back to runtime time.',
        );
      }
    }

    return getReadableTimeString(format);
  }

  public async convertPlanToExecutable(
    plans: PlanningAction[],
    planningModel: ModelRuntime,
    defaultModel: ModelRuntime,
    options?: {
      cacheable?: boolean;
      deepLocate?: boolean;
      abortSignal?: AbortSignal;
    },
  ) {
    return this.taskBuilder.build(plans, planningModel, defaultModel, options);
  }

  async loadYamlFlowAsPlanning(
    userInstruction: TUserPrompt,
    yamlString: string,
    reportOptions?: ActionReportOptions,
  ) {
    const session = this.createExecutionSession(
      taskTitleStr(
        reportOptions?.type || 'Act',
        reportOptions?.prompt || userPromptToString(userInstruction),
      ),
    );

    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'LoadYaml',
      param: {
        userInstruction,
        ...(reportOptions?.prompt
          ? { userInstructionDisplay: reportOptions.prompt }
          : {}),
      },
      executor: async (param, executorContext) => {
        const { uiContext } = executorContext;
        assert(uiContext, 'uiContext is required for Planning task');
        return {
          output: {
            actions: [],
            shouldContinuePlanning: false,
            log: '',
            yamlString,
          },
          cache: {
            hit: true,
          },
          hitBy: {
            from: 'Cache',
            context: {
              yamlString,
            },
          },
        };
      },
    };
    const runner = session.getRunner();
    await session.appendAndRun(task);

    return {
      runner,
    };
  }

  async runPlans(
    title: string,
    plans: PlanningAction[],
    planningModel: ModelRuntime,
    defaultModel: ModelRuntime,
  ): Promise<ExecutionResult> {
    const session = this.createExecutionSession(title);
    const { tasks } = await this.convertPlanToExecutable(
      plans,
      planningModel,
      defaultModel,
    );
    const runner = session.getRunner();
    const result = await session.appendAndRun(tasks);
    const { output } = result ?? {};
    return {
      output,
      runner,
    };
  }

  async action(
    userPrompt: TUserPrompt,
    planningModel: ModelRuntime,
    defaultModel: ModelRuntime,
    includeLocateInPlanning: boolean,
    aiActContext?: string,
    cacheable?: boolean,
    replanningCycleLimitOverride?: number,
    imagesIncludeCount?: number,
    deepThink?: boolean,
    fileChooserAccept?: string[],
    deepLocate?: boolean,
    abortSignal?: AbortSignal,
    reportOptions?: ActionReportOptions,
  ): Promise<
    ExecutionResult<
      | {
          yamlFlow?: MidsceneYamlFlowItem[]; // for cache use
          output?: string;
        }
      | undefined
    >
  > {
    return withFileChooser(this.interface, fileChooserAccept, async () => {
      return this.runAction(
        userPrompt,
        planningModel,
        defaultModel,
        includeLocateInPlanning,
        aiActContext,
        cacheable,
        replanningCycleLimitOverride,
        imagesIncludeCount,
        deepThink,
        deepLocate,
        abortSignal,
        reportOptions,
      );
    });
  }

  /**
   * Called when the task is about to replan. Marks every cache-hit locate task
   * in the just-run batch (tasks at index >= fromIndex) as stale: that batch
   * did not finish the task, so the element each cache hit produced is suspect.
   * The upcoming re-locate of the same prompt then replaces the bad entry in
   * place instead of appending a duplicate that would re-poison the cache on the
   * next run (#2529).
   *
   * Marking a locate that was actually fine is harmless: the step is only ever
   * replaced if the same prompt is located again (i.e. the step is redone),
   * which does not happen for a locate that already succeeded.
   */
  private invalidateFailedCacheHitLocates(
    runner: TaskRunner,
    fromIndex: number,
  ) {
    if (!this.taskCache) {
      return;
    }
    for (let i = fromIndex; i < runner.tasks.length; i++) {
      const task = runner.tasks[i];
      if (
        task.type === 'Planning' &&
        task.subType === 'Locate' &&
        task.hitBy?.from === 'Cache'
      ) {
        const prompt = (task.param as PlanningLocateParam | undefined)?.prompt;
        if (prompt) {
          this.taskCache.markLocateCacheStale(prompt);
        }
      }
    }
  }

  private async runAction(
    userPrompt: TUserPrompt,
    planningModel: ModelRuntime,
    defaultModel: ModelRuntime,
    includeLocateInPlanning: boolean,
    aiActContext?: string,
    cacheable?: boolean,
    replanningCycleLimitOverride?: number,
    imagesIncludeCount?: number,
    deepThink?: boolean,
    deepLocate?: boolean,
    abortSignal?: AbortSignal,
    reportOptions?: ActionReportOptions,
  ): Promise<
    ExecutionResult<
      | {
          yamlFlow?: MidsceneYamlFlowItem[]; // for cache use
          output?: string;
        }
      | undefined
    >
  > {
    if (
      deepLocate &&
      !planningModel.adapter.planning.supportsActionDeepLocate
    ) {
      warnLog(
        `The "deepLocate" option is not supported for aiAct with the current planning adapter (modelFamily: ${planningModel.config.modelFamily ?? 'unknown'}). It will be ignored.`,
      );
      deepLocate = false;
    }

    const conversationHistory = new ConversationHistory();

    const session = this.createExecutionSession(
      taskTitleStr(
        reportOptions?.type || 'Act',
        reportOptions?.prompt || userPromptToString(userPrompt),
      ),
    );
    const runner = session.getRunner();

    let replanCount = 0;
    const yamlFlow: MidsceneYamlFlowItem[] = [];
    const replanningCycleLimit =
      replanningCycleLimitOverride ?? this.replanningCycleLimit;
    assert(
      replanningCycleLimit !== undefined,
      'replanningCycleLimit is required for TaskExecutor.action',
    );

    let errorCountInOnePlanningLoop = 0; // count the number of errors in one planning loop
    let outputString: string | undefined;

    if (abortSignal?.aborted) {
      return session.appendErrorPlan(
        `Task aborted: ${abortSignal.reason || 'abort signal received'}`,
      );
    }
    const referenceImageMessages = await multimodalPromptToChatMessages(
      userPromptToMultimodalPrompt(userPrompt),
    );

    // Main planning loop - unified plan/replan logic
    while (true) {
      // Check abort signal before each planning cycle
      if (abortSignal?.aborted) {
        return session.appendErrorPlan(
          `Task aborted: ${abortSignal.reason || 'abort signal received'}`,
        );
      }

      // Get sub-goal status text if available
      const subGoalStatus = conversationHistory.subGoalsToText() || undefined;

      // Get memories text if available
      const memoriesStatus = conversationHistory.memoriesToText() || undefined;

      const result = await session.appendAndRun(
        {
          type: 'Planning',
          subType: 'Plan',
          param: {
            userInstruction: userPrompt,
            ...(reportOptions?.prompt
              ? { userInstructionDisplay: reportOptions.prompt }
              : {}),
            aiActContext,
            imagesIncludeCount,
            deepThink,
            ...(subGoalStatus ? { subGoalStatus } : {}),
            ...(memoriesStatus ? { memoriesStatus } : {}),
          },
          executor: async (param, executorContext) => {
            const { uiContext } = executorContext;
            assert(uiContext, 'uiContext is required for Planning task');
            const timing = executorContext.task.timing;

            const actionSpace = this.getActionSpace();
            debug(
              'actionSpace for this interface is:',
              actionSpace.map((action) => action.name).join(', '),
            );
            assert(Array.isArray(actionSpace), 'actionSpace must be an array');
            if (actionSpace.length === 0) {
              console.warn(
                `ActionSpace for ${this.interface.interfaceType} is empty. This may lead to unexpected behavior.`,
              );
            }

            const planImpl =
              planningModel.adapter.planning.kind === 'custom'
                ? planningModel.adapter.planning.planFn
                : genericXmlPlan;

            let planResult: Awaited<ReturnType<typeof planImpl>>;
            try {
              setTimingFieldOnce(timing, 'callAiStart');
              planResult = await planImpl(param.userInstruction, {
                context: uiContext,
                actionContext: param.aiActContext,
                actionSpace,
                modelRuntime: planningModel,
                conversationHistory,
                includeLocateInPlanning,
                imagesIncludeCount,
                deepThink,
                referenceImageMessages,
                abortSignal,
              });
            } catch (planError) {
              if (planError instanceof AIResponseParseError) {
                // Record usage and rawResponse even when parsing fails
                executorContext.task.usage = withUsageIntent(
                  planError.usage,
                  'planning',
                );
                executorContext.task.log = {
                  ...(executorContext.task.log || {}),
                  rawResponse: planError.rawResponse,
                };
              }
              throw planError;
            } finally {
              setTimingFieldOnce(timing, 'callAiEnd');
            }
            debug('planResult', JSON.stringify(planResult, null, 2));

            const {
              actions,
              thought,
              log,
              memory,
              error,
              usage,
              rawResponse,
              reasoning_content,
              finalizeSuccess,
              finalizeMessage,
              updateSubGoals,
              markFinishedIndexes,
            } = planResult;
            outputString = finalizeMessage;

            executorContext.task.log = {
              ...(executorContext.task.log || {}),
              rawResponse,
            };
            executorContext.task.usage = withUsageIntent(usage, 'planning');
            executorContext.task.reasoning_content = reasoning_content;
            executorContext.task.output = {
              actions: actions || [],
              log,
              thought,
              memory,
              yamlFlow: planResult.yamlFlow,
              output: finalizeMessage,
              shouldContinuePlanning: planResult.shouldContinuePlanning,
              updateSubGoals,
              markFinishedIndexes,
            };
            executorContext.uiContext = uiContext;

            assert(!error, `Failed to continue: ${error}\n${log || ''}`);

            // Check if task was finalized with failure
            if (finalizeSuccess === false) {
              assert(
                false,
                `Task failed: ${finalizeMessage || 'No error message provided'}\n${log || ''}`,
              );
            }

            return {
              cache: {
                hit: false,
              },
            } as any;
          },
        },
        {
          allowWhenError: true,
        },
      );

      const planResult = result?.output as PlanningAIResponse | undefined;

      // Execute planned actions
      const plans = planResult?.actions || [];
      yamlFlow.push(...(planResult?.yamlFlow || []));

      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(
          plans,
          planningModel,
          defaultModel,
          {
            cacheable,
            deepLocate,
            abortSignal,
          },
        );
      } catch (error) {
        return session.appendErrorPlan(
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }
      if (conversationHistory.pendingFeedbackMessage) {
        console.warn(
          'unconsumed pending feedback message detected, this may lead to unexpected planning result:',
          conversationHistory.pendingFeedbackMessage,
        );
      }

      // Capture the time context for the next planning call before running.
      const initialTimeString = await this.getTimeString();

      const taskCountBeforeRun = runner.tasks.length;
      try {
        await session.appendAndRun(executables.tasks);
        this.setPendingFeedbackMessage(
          conversationHistory,
          initialTimeString,
          this.collectPlanningFeedback(runner.tasks.slice(taskCountBeforeRun)),
        );
      } catch (error: any) {
        // errorFlag = true;
        errorCountInOnePlanningLoop++;
        const timeString = await this.getTimeString();
        this.setPendingFeedbackMessage(
          conversationHistory,
          timeString,
          `Error executing running tasks: ${error?.message || String(error)}`,
        );
        debug(
          'error when executing running tasks, but continue to run if it is not too many errors:',
          error instanceof Error ? error.message : String(error),
          'current error count in one planning loop:',
          errorCountInOnePlanningLoop,
        );
      }

      if (errorCountInOnePlanningLoop > maxErrorCountAllowedInOnePlanningLoop) {
        return session.appendErrorPlan('Too many errors in one planning loop');
      }

      // Check abort signal after executing actions
      if (abortSignal?.aborted) {
        return session.appendErrorPlan(
          `Task aborted: ${abortSignal.reason || 'abort signal received'}`,
        );
      }

      // // Check if task is complete
      if (!planResult?.shouldContinuePlanning) {
        break;
      }

      // We are about to replan, which means the batch we just ran did not finish
      // the task. Any locate task in that batch that was served from cache
      // produced an element that failed to complete the step (the action threw,
      // or it clicked the wrong element and the goal was not reached). Mark those
      // cache entries stale so the re-locate of the same prompt replaces them in
      // place instead of appending a poisoning duplicate that would be matched
      // first on the next run (#2529).
      this.invalidateFailedCacheHitLocates(runner, taskCountBeforeRun);

      // Increment replan count for next iteration
      ++replanCount;

      if (replanCount > replanningCycleLimit) {
        const errorMsg = `Replanned ${replanningCycleLimit} times, exceeding the limit. Please configure a larger value for replanningCycleLimit (or use MIDSCENE_REPLANNING_CYCLE_LIMIT) to handle more complex tasks.`;
        return session.appendErrorPlan(errorMsg);
      }

      if (!conversationHistory.pendingFeedbackMessage) {
        const timeString = await this.getTimeString();
        conversationHistory.pendingFeedbackMessage = `Time: ${timeString}, I have finished the action previously planned.`;
      }
    }

    return {
      output: {
        yamlFlow,
        output: outputString,
      },
      runner,
    };
  }

  private createTypeQueryTask(
    type: 'Query' | 'Boolean' | 'Number' | 'String' | 'Assert' | 'WaitFor',
    demand: ServiceExtractParam,
    modelRuntime: ModelRuntime,
    opt?: ServiceExtractOption,
    multimodalPrompt?: TMultimodalPrompt,
  ) {
    const queryTask: ExecutionTaskInsightQueryApply = {
      type: 'Insight',
      subType: type,
      param: {
        domIncluded: opt?.domIncluded,
        dataDemand: multimodalPrompt
          ? ({
              demand,
              multimodalPrompt,
            } as never)
          : demand, // for user param presentation in report right sidebar
      },
      executor: async (param, taskContext) => {
        const { task } = taskContext;
        let queryDump: ServiceDump | undefined;
        const applyDump = (dump: ServiceDump) => {
          queryDump = dump;
          task.log = {
            dump,
            rawResponse: dump.taskInfo?.rawResponse,
          };
          task.usage = withUsageIntent(dump.taskInfo?.usage, 'insight');
          if (dump.taskInfo?.reasoning_content) {
            task.reasoning_content = dump.taskInfo.reasoning_content;
          }
        };

        // Get context for query operations
        const uiContext = taskContext.uiContext;
        assert(uiContext, 'uiContext is required for Query task');

        const ifTypeRestricted = type !== 'Query';
        let demandInput = demand;
        let keyOfResult = 'result';
        if (ifTypeRestricted && (type === 'Assert' || type === 'WaitFor')) {
          keyOfResult = 'StatementIsTruthy';
          demandInput = {
            [keyOfResult]: buildTypeQueryDemandValue(type, demand),
          };
        } else if (ifTypeRestricted) {
          keyOfResult = type;
          demandInput = {
            [keyOfResult]: buildTypeQueryDemandValue(type, demand),
          };
        }

        let extractResult;

        let extraPageDescription = '';
        if (opt?.domIncluded && this.interface.getElementsNodeTree) {
          debug('appending tree info for page');
          const tree = await this.interface.getElementsNodeTree();
          extraPageDescription = await descriptionOfTree(
            tree,
            200,
            false,
            opt?.domIncluded === 'visible-only',
          );
        }

        try {
          extractResult = await this.service.extract<any>(
            demandInput,
            modelRuntime,
            opt,
            extraPageDescription,
            multimodalPrompt,
            uiContext,
          );
        } catch (error) {
          if (error instanceof ServiceError) {
            applyDump(error.dump);
          }
          throw error;
        }

        const { data, thought, dump } = extractResult;
        applyDump(dump);

        let outputResult = data;
        if (ifTypeRestricted) {
          // If AI returned a plain string instead of structured format, use it directly
          if (typeof data === 'string') {
            outputResult = data;
          } else if (type === 'WaitFor') {
            if (data === null || data === undefined) {
              outputResult = false;
            } else {
              outputResult = (data as any)[keyOfResult];
            }
          } else if (data === null || data === undefined) {
            outputResult = null;
          } else {
            // AI model may return {result: ...} instead of {[keyOfResult]: ...}
            if (data?.[keyOfResult] !== undefined) {
              outputResult = (data as any)[keyOfResult];
            } else if (data?.result !== undefined) {
              outputResult = (data as any).result;
            } else {
              assert(false, 'No result in query data');
            }
          }
        }

        if (type === 'Assert' && !outputResult) {
          task.thought = thought;
          throw new Error(`Assertion failed: ${thought}`);
        }

        return {
          output: outputResult,
          log: queryDump,
          thought,
        };
      },
    };

    return queryTask;
  }
  async createTypeQueryExecution<T>(
    type: 'Query' | 'Boolean' | 'Number' | 'String' | 'Assert',
    demand: ServiceExtractParam,
    modelRuntime: ModelRuntime,
    opt?: ServiceExtractOption,
    multimodalPrompt?: TMultimodalPrompt,
  ): Promise<ExecutionResult<T>> {
    const session = this.createExecutionSession(
      taskTitleStr(
        type,
        typeof demand === 'string' ? demand : JSON.stringify(demand),
      ),
    );

    const queryTask = await this.createTypeQueryTask(
      type,
      demand,
      modelRuntime,
      opt,
      multimodalPrompt,
    );

    const runner = session.getRunner();
    const result = await session.appendAndRun(queryTask);

    if (!result) {
      throw new Error(
        'result of taskExecutor.flush() is undefined in function createTypeQueryTask',
      );
    }

    const { output, thought } = result;

    return {
      output,
      thought,
      runner,
    };
  }

  async waitFor(
    assertion: TUserPrompt,
    opt: PlanningActionParamWaitFor,
    modelRuntime: ModelRuntime,
  ): Promise<ExecutionResult<void>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);

    const description = `waitFor: ${textPrompt}`;
    const session = this.createExecutionSession(
      taskTitleStr('WaitFor', description),
    );
    const runner = session.getRunner();
    const {
      timeoutMs,
      checkIntervalMs,
      domIncluded,
      screenshotIncluded,
      ...restOpt
    } = opt;
    const serviceExtractOpt: ServiceExtractOption = {
      domIncluded,
      screenshotIncluded,
      ...restOpt,
    };

    assert(assertion, 'No assertion for waitFor');
    assert(timeoutMs, 'No timeoutMs for waitFor');
    assert(checkIntervalMs, 'No checkIntervalMs for waitFor');

    assert(
      checkIntervalMs <= timeoutMs,
      `wrong config for waitFor: checkIntervalMs must be less than timeoutMs, config: {checkIntervalMs: ${checkIntervalMs}, timeoutMs: ${timeoutMs}}`,
    );

    const overallStartTime = Date.now();
    let lastCheckStart = overallStartTime;
    let errorThought = '';
    // Continue checking as long as the previous iteration began within the timeout window.
    while (lastCheckStart - overallStartTime <= timeoutMs) {
      const currentCheckStart = Date.now();
      lastCheckStart = currentCheckStart;
      const queryTask = await this.createTypeQueryTask(
        'WaitFor',
        textPrompt,
        modelRuntime,
        serviceExtractOpt,
        multimodalPrompt,
      );

      const result = (await session.appendAndRun(queryTask)) as
        | {
            output: boolean;
            thought?: string;
          }
        | undefined;

      if (result?.output) {
        return {
          output: undefined,
          runner,
        };
      }

      errorThought =
        result?.thought ||
        (!result && `No result from assertion: ${textPrompt}`) ||
        `unknown error when waiting for assertion: ${textPrompt}`;
      const now = Date.now();
      if (now - currentCheckStart < checkIntervalMs) {
        const elapsed = now - currentCheckStart;
        const timeRemaining = checkIntervalMs - elapsed;
        const thought = `Check interval is ${checkIntervalMs}ms, ${elapsed}ms elapsed since last check, sleeping for ${timeRemaining}ms`;
        const { tasks: sleepTasks } = await this.convertPlanToExecutable(
          [{ type: 'Sleep', param: { timeMs: timeRemaining }, thought }],
          modelRuntime,
          modelRuntime,
        );
        if (sleepTasks[0]) {
          await session.appendAndRun(sleepTasks[0]);
        }
      }
    }

    return session.appendErrorPlan(`waitFor timeout: ${errorThought}`);
  }
}

export async function withFileChooser<T>(
  interfaceInstance: AbstractInterface,
  fileChooserAccept: string[] | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (!fileChooserAccept?.length) {
    return action();
  }

  if (!interfaceInstance.registerFileChooserListener) {
    throw new Error(
      `File upload is not supported on ${interfaceInstance.interfaceType}`,
    );
  }

  const handler = async (chooser: FileChooserHandler) => {
    await chooser.accept(fileChooserAccept);
  };

  const { dispose, getError } =
    await interfaceInstance.registerFileChooserListener(handler);
  try {
    const result = await action();
    // Check for errors that occurred during file chooser handling
    const error = await getError();
    if (error) {
      throw error;
    }
    return result;
  } finally {
    dispose();
  }
}
