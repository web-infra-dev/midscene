import { ConversationHistory, plan, uiTarsPlanning } from '@/ai-model';
import type { TMultimodalPrompt, TUserPrompt } from '@/ai-model/common';
import type { AbstractInterface } from '@/device';
import type Insight from '@/insight';
import type { TaskRunner } from '@/task-runner';
import type {
  ExecutionTaskApply,
  ExecutionTaskInsightQueryApply,
  ExecutionTaskPlanningApply,
  ExecutionTaskProgressOptions,
  InsightDump,
  InsightExtractOption,
  InsightExtractParam,
  InterfaceType,
  MidsceneYamlFlowItem,
  PlanningAIResponse,
  PlanningAction,
  PlanningActionParamSleep,
  PlanningActionParamWaitFor,
} from '@/types';
import { InsightError } from '@/types';
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
import { taskTitleStr } from './ui-utils';
import { parsePrompt } from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  thought?: string;
  runner: TaskRunner;
}

const debug = getDebug('device-task-executor');
const defaultReplanningCycleLimit = 10;
const defaultVlmUiTarsReplanningCycleLimit = 40;

export class TaskExecutor {
  interface: AbstractInterface;

  insight: Insight;

  taskCache?: TaskCache;

  private readonly taskBuilder: TaskBuilder;

  private conversationHistory: ConversationHistory;

  onTaskStartCallback?: ExecutionTaskProgressOptions['onTaskStart'];

  replanningCycleLimit?: number;

  // @deprecated use .interface instead
  get page() {
    return this.interface;
  }

  constructor(
    interfaceInstance: AbstractInterface,
    insight: Insight,
    opts: {
      taskCache?: TaskCache;
      onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];
      replanningCycleLimit?: number;
    },
  ) {
    this.interface = interfaceInstance;
    this.insight = insight;
    this.taskCache = opts.taskCache;
    this.onTaskStartCallback = opts?.onTaskStart;
    this.replanningCycleLimit = opts.replanningCycleLimit;
    this.conversationHistory = new ConversationHistory();
    this.taskBuilder = new TaskBuilder({
      interfaceInstance,
      insight,
      taskCache: opts.taskCache,
    });
  }

  private createExecutionSession(
    title: string,
    options?: { tasks?: ExecutionTaskApply[] },
  ) {
    return new ExecutionSession(
      title,
      () => Promise.resolve(this.insight.contextRetrieverFn()),
      {
        onTaskStart: this.onTaskStartCallback,
        tasks: options?.tasks,
      },
    );
  }

  public async convertPlanToExecutable(
    plans: PlanningAction[],
    modelConfig: IModelConfig,
    cacheable?: boolean,
  ) {
    return this.taskBuilder.build(plans, modelConfig, {
      cacheable,
    });
  }

  async loadYamlFlowAsPlanning(userInstruction: string, yamlString: string) {
    const session = this.createExecutionSession(
      taskTitleStr('Action', userInstruction),
    );

    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'LoadYaml',
      locate: null,
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
    await session.appendAndRun(task);

    return {
      runner: session.getRunner(),
    };
  }

  private createPlanningTask(
    userInstruction: string,
    actionContext: string | undefined,
    modelConfig: IModelConfig,
  ): ExecutionTaskPlanningApply {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'Plan',
      locate: null,
      param: {
        userInstruction,
      },
      executor: async (param, executorContext) => {
        const startTime = Date.now();
        const { uiContext } = executorContext;
        assert(uiContext, 'uiContext is required for Planning task');
        const { vlMode } = modelConfig;
        const uiTarsModelVersion =
          vlMode === 'vlm-ui-tars' ? modelConfig.uiTarsModelVersion : undefined;

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
            actionContext,
            interfaceType: this.interface.interfaceType as InterfaceType,
            actionSpace,
            modelConfig,
            conversationHistory: this.conversationHistory,
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
    modelConfig: IModelConfig,
  ): Promise<ExecutionResult> {
    const session = this.createExecutionSession(title);
    const { tasks } = await this.convertPlanToExecutable(plans, modelConfig);
    const result = await session.appendAndRun(tasks);
    const { output } = result!;
    return {
      output,
      runner: session.getRunner(),
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
    modelConfig: IModelConfig,
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
      modelConfig.vlMode === 'vlm-ui-tars',
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
        modelConfig,
      );

      const result = await session.appendAndRun(planningTask);
      const planResult: PlanningAIResponse = result?.output;
      if (session.isInErrorState()) {
        return {
          output: planResult,
          runner,
        };
      }

      // Execute planned actions
      const plans = planResult.actions || [];
      yamlFlow.push(...(planResult.yamlFlow || []));

      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(
          plans,
          modelConfig,
          cacheable,
        );
        await session.appendAndRun(executables.tasks);
      } catch (error) {
        return session.appendErrorPlan(
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }
      if (session.isInErrorState()) {
        return {
          output: undefined,
          runner,
        };
      }

      // Check if task is complete
      if (!planResult.more_actions_needed_by_instruction) {
        break;
      }

      // Increment replan count for next iteration
      replanCount++;
    }

    return {
      output: {
        yamlFlow,
      },
      runner,
    };
  }

  private createTypeQueryTask(
    type: 'Query' | 'Boolean' | 'Number' | 'String' | 'Assert' | 'WaitFor',
    demand: InsightExtractParam,
    modelConfig: IModelConfig,
    opt?: InsightExtractOption,
    multimodalPrompt?: TMultimodalPrompt,
  ) {
    const queryTask: ExecutionTaskInsightQueryApply = {
      type: 'Insight',
      subType: type,
      locate: null,
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
        let queryDump: InsightDump | undefined;
        const applyDump = (dump: InsightDump) => {
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
        try {
          extractResult = await this.insight.extract<any>(
            demandInput,
            modelConfig,
            opt,
            multimodalPrompt,
          );
        } catch (error) {
          if (error instanceof InsightError) {
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
          } else {
            assert(
              type !== 'WaitFor' ? data?.[keyOfResult] !== undefined : true,
              'No result in query data',
            );
            outputResult = (data as any)[keyOfResult];
          }
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
    demand: InsightExtractParam,
    modelConfig: IModelConfig,
    opt?: InsightExtractOption,
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
      runner: session.getRunner(),
    };
  }

  private sleepPlan(timeMs: number): PlanningAction<PlanningActionParamSleep> {
    return {
      type: 'Sleep',
      param: {
        timeMs,
      },
      locate: null,
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
    let startTime = Date.now();
    let errorThought = '';
    while (Date.now() - overallStartTime < timeoutMs) {
      startTime = Date.now();
      const queryTask = await this.createTypeQueryTask(
        'WaitFor',
        textPrompt,
        modelConfig,
        {
          doNotThrowError: true,
        },
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
      if (now - startTime < checkIntervalMs) {
        const timeRemaining = checkIntervalMs - (now - startTime);
        const sleepTask = this.taskBuilder.createSleepTask({
          timeMs: timeRemaining,
        });
        await session.append(sleepTask);
      }
    }

    return session.appendErrorPlan(`waitFor timeout: ${errorThought}`);
  }
}
