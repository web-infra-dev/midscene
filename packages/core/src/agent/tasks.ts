import { ConversationHistory, plan, uiTarsPlanning } from '@/ai-model';
import type { TMultimodalPrompt, TUserPrompt } from '@/common';
import type { AbstractInterface } from '@/device';
import type Service from '@/service';
import type { TaskRunner } from '@/task-runner';
import { TaskExecutionError } from '@/task-runner';
import type {
  ExecutionTaskApply,
  ExecutionTaskInsightQueryApply,
  ExecutionTaskPlanningApply,
  ExecutionTaskProgressOptions,
  InterfaceType,
  MidsceneYamlFlowItem,
  PlanningAIResponse,
  PlanningAction,
  PlanningActionParamSleep,
  PlanningActionParamWaitFor,
  ServiceDump,
  ServiceExtractOption,
  ServiceExtractParam,
  ThinkingLevel,
} from '@/types';
import { ServiceError } from '@/types';
import {
  type IModelConfig,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  globalConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { ExecutionSession } from './execution-session';
import { TaskBuilder } from './task-builder';
import type { TaskCache } from './task-cache';
export { locatePlanForLocate } from './task-builder';
import { descriptionOfTree } from '@midscene/shared/extractor';
import { taskTitleStr } from './ui-utils';
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

const debug = getDebug('device-task-executor');
const defaultReplanningCycleLimit = 20;
const defaultVlmUiTarsReplanningCycleLimit = 40;

export { TaskExecutionError };

export class TaskExecutor {
  interface: AbstractInterface;

  service: Service;

  taskCache?: TaskCache;

  private readonly taskBuilder: TaskBuilder;

  private conversationHistory: ConversationHistory;

  onTaskStartCallback?: ExecutionTaskProgressOptions['onTaskStart'];

  private readonly hooks?: TaskExecutorHooks;

  replanningCycleLimit?: number;

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
      hooks?: TaskExecutorHooks;
    },
  ) {
    this.interface = interfaceInstance;
    this.service = service;
    this.taskCache = opts.taskCache;
    this.onTaskStartCallback = opts?.onTaskStart;
    this.replanningCycleLimit = opts.replanningCycleLimit;
    this.hooks = opts.hooks;
    this.conversationHistory = new ConversationHistory();
    this.taskBuilder = new TaskBuilder({
      interfaceInstance,
      service,
      taskCache: opts.taskCache,
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

  public async convertPlanToExecutable(
    plans: PlanningAction[],
    modelConfigForPlanning: IModelConfig,
    modelConfigForDefaultIntent: IModelConfig,
    options?: {
      cacheable?: boolean;
      subTask?: boolean;
    },
  ) {
    return this.taskBuilder.build(
      plans,
      modelConfigForPlanning,
      modelConfigForDefaultIntent,
      options,
    );
  }

  async loadYamlFlowAsPlanning(userInstruction: string, yamlString: string) {
    const session = this.createExecutionSession(
      taskTitleStr('Action', userInstruction),
    );

    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'LoadYaml',
      param: {
        userInstruction,
      },
      executor: async (param, executorContext) => {
        const { uiContext } = executorContext;
        assert(uiContext, 'uiContext is required for Planning task');
        return {
          output: {
            actions: [],
            more_actions_needed_by_instruction: false,
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

  private createPlanningTask(
    userInstruction: string,
    actionContext: string | undefined,
    modelConfigForPlanning: IModelConfig,
    modelConfigForDefaultIntent: IModelConfig,
    includeBbox: boolean,
  ): ExecutionTaskPlanningApply {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'Plan',
      param: {
        userInstruction,
        aiActionContext: actionContext,
      },
      executor: async (param, executorContext) => {
        const startTime = Date.now();
        const { uiContext } = executorContext;
        assert(uiContext, 'uiContext is required for Planning task');
        const { vlMode } = modelConfigForPlanning;
        const uiTarsModelVersion =
          vlMode === 'vlm-ui-tars'
            ? modelConfigForPlanning.uiTarsModelVersion
            : undefined;

        assert(
          this.interface.actionSpace,
          'actionSpace for device is not implemented',
        );
        const actionSpace = await this.interface.actionSpace();
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

        const planResult = await (uiTarsModelVersion ? uiTarsPlanning : plan)(
          param.userInstruction,
          {
            context: uiContext,
            actionContext: param.aiActionContext,
            interfaceType: this.interface.interfaceType as InterfaceType,
            actionSpace,
            modelConfig: modelConfigForPlanning,
            conversationHistory: this.conversationHistory,
            includeBbox,
          },
        );
        debug('planResult', JSON.stringify(planResult, null, 2));

        const {
          actions,
          log,
          more_actions_needed_by_instruction,
          error,
          usage,
          rawResponse,
          sleep,
        } = planResult;

        executorContext.task.log = {
          ...(executorContext.task.log || {}),
          rawResponse,
        };
        executorContext.task.usage = usage;

        const finalActions = actions || [];

        if (sleep) {
          const timeNow = Date.now();
          const timeRemaining = sleep - (timeNow - startTime);
          if (timeRemaining > 0) {
            finalActions.push(this.sleepPlan(timeRemaining));
          }
        }

        if (finalActions.length === 0) {
          assert(
            !more_actions_needed_by_instruction || sleep,
            error ? `Failed to plan: ${error}` : 'No plan found',
          );
        }

        return {
          output: {
            actions: finalActions,
            more_actions_needed_by_instruction,
            log,
            yamlFlow: planResult.yamlFlow,
          },
          cache: {
            hit: false,
          },
          uiContext,
        };
      },
    };

    return task;
  }

  async runPlans(
    title: string,
    plans: PlanningAction[],
    modelConfigForPlanning: IModelConfig,
    modelConfigForDefaultIntent: IModelConfig,
  ): Promise<ExecutionResult> {
    const session = this.createExecutionSession(title);
    const { tasks } = await this.convertPlanToExecutable(
      plans,
      modelConfigForPlanning,
      modelConfigForDefaultIntent,
    );
    const runner = session.getRunner();
    const result = await session.appendAndRun(tasks);
    const { output } = result ?? {};
    return {
      output,
      runner,
    };
  }

  private getReplanningCycleLimit(isVlmUiTars: boolean) {
    return (
      this.replanningCycleLimit ||
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_REPLANNING_CYCLE_LIMIT,
      ) ||
      (isVlmUiTars
        ? defaultVlmUiTarsReplanningCycleLimit
        : defaultReplanningCycleLimit)
    );
  }

  async action(
    userPrompt: string,
    modelConfigForPlanning: IModelConfig,
    modelConfigForDefaultIntent: IModelConfig,
    thinkingLevel: ThinkingLevel,
    includeBboxInPlanning: boolean,
    actionContext?: string,
    cacheable?: boolean,
  ): Promise<
    ExecutionResult<
      | {
          yamlFlow?: MidsceneYamlFlowItem[]; // for cache use
        }
      | undefined
    >
  > {
    this.conversationHistory.reset();

    const session = this.createExecutionSession(
      taskTitleStr('Action', userPrompt),
    );
    const runner = session.getRunner();

    let replanCount = 0;
    const yamlFlow: MidsceneYamlFlowItem[] = [];
    const replanningCycleLimit = this.getReplanningCycleLimit(
      modelConfigForPlanning.vlMode === 'vlm-ui-tars',
    );

    // Main planning loop - unified plan/replan logic
    while (true) {
      if (replanCount > replanningCycleLimit) {
        const errorMsg = `Replanning ${replanningCycleLimit} times, which is more than the limit, please split the task into multiple steps`;
        return session.appendErrorPlan(errorMsg);
      }

      // Create planning task (automatically includes execution history if available)
      const planningTask = this.createPlanningTask(
        userPrompt,
        actionContext,
        modelConfigForPlanning,
        modelConfigForDefaultIntent,
        includeBboxInPlanning,
      );

      const result = await session.appendAndRun(planningTask);
      const planResult = result?.output as PlanningAIResponse | undefined;

      // Execute planned actions
      const plans = planResult?.actions || [];
      yamlFlow.push(...(planResult?.yamlFlow || []));

      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(
          plans,
          modelConfigForPlanning,
          modelConfigForDefaultIntent,
          {
            cacheable,
            subTask: true,
          },
        );
      } catch (error) {
        return session.appendErrorPlan(
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }
      await session.appendAndRun(executables.tasks);

      // Check if task is complete
      if (!planResult?.more_actions_needed_by_instruction) {
        break;
      }

      // Increment replan count for next iteration
      replanCount++;
    }

    const finalResult = {
      output: {
        yamlFlow,
      },
      runner,
    };
    return finalResult;
  }

  private createTypeQueryTask(
    type: 'Query' | 'Boolean' | 'Number' | 'String' | 'Assert' | 'WaitFor',
    demand: ServiceExtractParam,
    modelConfig: IModelConfig,
    opt?: ServiceExtractOption,
    multimodalPrompt?: TMultimodalPrompt,
  ) {
    const queryTask: ExecutionTaskInsightQueryApply = {
      type: 'Insight',
      subType: type,
      param: {
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
          };
        };

        // Get context for query operations
        const uiContext = taskContext.uiContext;
        assert(uiContext, 'uiContext is required for Query task');

        const ifTypeRestricted = type !== 'Query';
        let demandInput = demand;
        let keyOfResult = 'result';
        if (ifTypeRestricted && (type === 'Assert' || type === 'WaitFor')) {
          keyOfResult = 'StatementIsTruthy';
          const booleanPrompt =
            type === 'Assert'
              ? `Boolean, whether the following statement is true: ${demand}`
              : `Boolean, the user wants to do some 'wait for' operation, please check whether the following statement is true: ${demand}`;
          demandInput = {
            [keyOfResult]: booleanPrompt,
          };
        } else if (ifTypeRestricted) {
          demandInput = {
            [keyOfResult]: `${type}, ${demand}`,
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
            modelConfig,
            opt,
            extraPageDescription,
            multimodalPrompt,
          );
        } catch (error) {
          if (error instanceof ServiceError) {
            applyDump(error.dump);
          }
          throw error;
        }

        const { data, usage, thought, dump } = extractResult;
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
            assert(
              data?.[keyOfResult] !== undefined,
              'No result in query data',
            );
            outputResult = (data as any)[keyOfResult];
          }
        }

        if (type === 'Assert' && !outputResult) {
          task.usage = usage;
          task.thought = thought;
          throw new Error(`Assertion failed: ${thought}`);
        }

        return {
          output: outputResult,
          log: queryDump,
          usage,
          thought,
        };
      },
    };

    return queryTask;
  }
  async createTypeQueryExecution<T>(
    type: 'Query' | 'Boolean' | 'Number' | 'String' | 'Assert',
    demand: ServiceExtractParam,
    modelConfig: IModelConfig,
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
      modelConfig,
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

  private sleepPlan(timeMs: number): PlanningAction<PlanningActionParamSleep> {
    return {
      type: 'Sleep',
      param: {
        timeMs,
      },
    };
  }

  async taskForSleep(timeMs: number, _modelConfig: IModelConfig) {
    return this.taskBuilder.createSleepTask({
      timeMs,
    });
  }

  async waitFor(
    assertion: TUserPrompt,
    opt: PlanningActionParamWaitFor,
    modelConfig: IModelConfig,
  ): Promise<ExecutionResult<void>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);

    const description = `waitFor: ${textPrompt}`;
    const session = this.createExecutionSession(
      taskTitleStr('WaitFor', description),
    );
    const runner = session.getRunner();
    const { timeoutMs, checkIntervalMs } = opt;

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
        modelConfig,
        undefined,
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
        const timeRemaining = checkIntervalMs - (now - currentCheckStart);
        const sleepTask = this.taskBuilder.createSleepTask({
          timeMs: timeRemaining,
        });
        await session.append(sleepTask);
      }
    }

    return session.appendErrorPlan(`waitFor timeout: ${errorThought}`);
  }
}
