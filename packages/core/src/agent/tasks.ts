import {
  ConversationHistory,
  elementByPositionWithElementInfo,
  findAllMidsceneLocatorField,
  uiTarsPlanning,
} from '@/ai-model';
import type { AbstractInterface } from '@/device';
import {
  type AIUsageInfo,
  type BaseElement,
  type DetailedLocateParam,
  type DumpSubscriber,
  type ExecutionRecorderItem,
  type ExecutionTaskActionApply,
  type ExecutionTaskApply,
  type ExecutionTaskHitBy,
  type ExecutionTaskInsightLocateApply,
  type ExecutionTaskInsightQueryApply,
  type ExecutionTaskPlanning,
  type ExecutionTaskPlanningApply,
  type ExecutionTaskProgressOptions,
  Executor,
  type ExecutorContext,
  type Insight,
  type InsightDump,
  type InsightExtractOption,
  type InsightExtractParam,
  type InterfaceType,
  type LocateResultElement,
  type MidsceneYamlFlowItem,
  type PlanningAIResponse,
  type PlanningAction,
  type PlanningActionParamError,
  type PlanningActionParamSleep,
  type PlanningActionParamWaitFor,
  type PlanningLocateParam,
  type TMultimodalPrompt,
  type TUserPrompt,
  type UIContext,
  plan,
} from '@/index';
import { sleep } from '@/utils';
import { NodeType } from '@midscene/shared/constants';
import {
  type IModelConfig,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  globalConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TaskCache } from './task-cache';
import { taskTitleStr } from './ui-utils';
import {
  matchElementFromCache,
  matchElementFromPlan,
  parsePrompt,
  scaleElementCoordinates,
} from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  thought?: string;
  executor: Executor;
}

const debug = getDebug('device-task-executor');
const defaultReplanningCycleLimit = 10;
const defaultVlmUiTarsReplanningCycleLimit = 40;

export function locatePlanForLocate(param: string | DetailedLocateParam) {
  const locate = typeof param === 'string' ? { prompt: param } : param;
  const locatePlan: PlanningAction<PlanningLocateParam> = {
    type: 'Locate',
    locate,
    param: locate,
    thought: '',
  };
  return locatePlan;
}

export class TaskExecutor {
  interface: AbstractInterface;

  insight: Insight;

  taskCache?: TaskCache;

  private conversationHistory: ConversationHistory;

  onTaskStartCallback?: ExecutionTaskProgressOptions['onTaskStart'];

  replanningCycleLimit?: number;

  scale?: number;

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
      scale?: number;
    },
  ) {
    this.interface = interfaceInstance;
    this.insight = insight;
    this.taskCache = opts.taskCache;
    this.scale = opts.scale;
    this.onTaskStartCallback = opts?.onTaskStart;
    this.replanningCycleLimit = opts.replanningCycleLimit;
    this.conversationHistory = new ConversationHistory();
  }

  private async recordScreenshot(timing: ExecutionRecorderItem['timing']) {
    const base64 = await this.interface.screenshotBase64();
    const item: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: Date.now(),
      screenshot: base64,
      timing,
    };
    return item;
  }

  private async getElementXpath(
    uiContext: UIContext<BaseElement>,
    element: LocateResultElement,
  ): Promise<string[] | undefined> {
    if (!(this.interface as any).getXpathsByPoint) {
      debug('getXpathsByPoint is not supported for this interface');
      return undefined;
    }

    let elementId = element?.id;
    if (element?.isOrderSensitive !== undefined) {
      try {
        const xpaths = await (this.interface as any).getXpathsByPoint(
          {
            left: element.center[0],
            top: element.center[1],
          },
          element?.isOrderSensitive,
        );

        return xpaths;
      } catch (error) {
        debug('getXpathsByPoint failed: %s', error);
        return undefined;
      }
    }

    // find the nearest xpath for the element
    if (element?.attributes?.nodeType === NodeType.POSITION) {
      await this.insight.contextRetrieverFn('locate');
      const info = elementByPositionWithElementInfo(
        uiContext.tree,
        {
          x: element.center[0],
          y: element.center[1],
        },
        {
          requireStrictDistance: false,
          filterPositionElements: true,
        },
      );
      if (info?.id) {
        elementId = info.id;
      } else {
        debug(
          'no element id found for position node, will not update cache',
          element,
        );
      }
    }

    if (!elementId) {
      return undefined;
    }
    try {
      const result = await (this.interface as any).getXpathsById(elementId);
      return result;
    } catch (error) {
      debug('getXpathsById error: ', error);
    }
  }

  private prependExecutorWithScreenshot(
    taskApply: ExecutionTaskApply,
    appendAfterExecution = false,
  ): ExecutionTaskApply {
    const taskWithScreenshot: ExecutionTaskApply = {
      ...taskApply,
      executor: async (param, context, ...args) => {
        const recorder: ExecutionRecorderItem[] = [];
        const { task } = context;
        // set the recorder before executor in case of error
        task.recorder = recorder;
        const shot = await this.recordScreenshot(`before ${task.type}`);
        recorder.push(shot);

        const result = await taskApply.executor(param, context, ...args);

        if (appendAfterExecution) {
          const shot2 = await this.recordScreenshot('after Action');
          recorder.push(shot2);
        }
        return result;
      },
    };
    return taskWithScreenshot;
  }

  public async convertPlanToExecutable(
    plans: PlanningAction[],
    modelConfig: IModelConfig,
  ) {
    const tasks: ExecutionTaskApply[] = [];

    const taskForLocatePlan = (
      plan: PlanningAction<PlanningLocateParam>,
      detailedLocateParam: DetailedLocateParam | string,
      onResult?: (result: LocateResultElement) => void,
    ): ExecutionTaskInsightLocateApply => {
      if (typeof detailedLocateParam === 'string') {
        detailedLocateParam = {
          prompt: detailedLocateParam,
        };
      }
      const taskFind: ExecutionTaskInsightLocateApply = {
        type: 'Insight',
        subType: 'Locate',
        param: detailedLocateParam,
        thought: plan.thought,
        executor: async (param, taskContext) => {
          const { task } = taskContext;
          assert(
            param?.prompt || param?.id || param?.bbox,
            `No prompt or id or position or bbox to locate, param=${JSON.stringify(
              param,
            )}`,
          );
          let insightDump: InsightDump | undefined;
          let usage: AIUsageInfo | undefined;
          const dumpCollector: DumpSubscriber = (dump) => {
            insightDump = dump;
            usage = dump?.taskInfo?.usage;

            task.log = {
              dump: insightDump,
            };

            task.usage = usage;
          };
          this.insight.onceDumpUpdatedFn = dumpCollector;
          const shotTime = Date.now();

          // Get context through contextRetrieverFn which handles frozen context
          const uiContext = await this.insight.contextRetrieverFn('locate');
          task.uiContext = uiContext;

          const recordItem: ExecutionRecorderItem = {
            type: 'screenshot',
            ts: shotTime,
            screenshot: uiContext.screenshotBase64,
            timing: 'before Insight',
          };
          task.recorder = [recordItem];

          // try matching xpath
          const elementFromXpath =
            param.xpath && (this.interface as any).getElementInfoByXpath
              ? await (this.interface as any).getElementInfoByXpath(param.xpath)
              : undefined;
          const userExpectedPathHitFlag = !!elementFromXpath;

          // try matching cache
          const cachePrompt = param.prompt;
          const locateCacheRecord =
            this.taskCache?.matchLocateCache(cachePrompt);
          const xpaths = locateCacheRecord?.cacheContent?.xpaths;
          const elementFromCache = userExpectedPathHitFlag
            ? null
            : await matchElementFromCache(
                this,
                xpaths,
                cachePrompt,
                param.cacheable,
              );
          const cacheHitFlag = !!elementFromCache;

          // try matching plan
          const elementFromPlan =
            !userExpectedPathHitFlag && !cacheHitFlag
              ? matchElementFromPlan(param, uiContext.tree)
              : undefined;
          const planHitFlag = !!elementFromPlan;

          // try ai locate
          const elementFromAiLocate =
            !userExpectedPathHitFlag && !cacheHitFlag && !planHitFlag
              ? (
                  await this.insight.locate(
                    param,
                    {
                      // fallback to ai locate
                      context: uiContext,
                    },
                    modelConfig,
                  )
                ).element
              : undefined;
          const aiLocateHitFlag = !!elementFromAiLocate;

          const element =
            elementFromXpath || // highest priority
            elementFromCache || // second priority
            elementFromPlan || // third priority
            elementFromAiLocate;

          // update cache
          let currentXpaths: string[] | undefined;
          if (
            element &&
            this.taskCache &&
            !cacheHitFlag &&
            param?.cacheable !== false
          ) {
            const elementXpaths = await this.getElementXpath(
              uiContext,
              element,
            );
            if (elementXpaths?.length) {
              debug(
                'update cache, prompt: %s, xpaths: %s',
                cachePrompt,
                elementXpaths,
              );
              currentXpaths = elementXpaths;
              this.taskCache.updateOrAppendCacheRecord(
                {
                  type: 'locate',
                  prompt: cachePrompt,
                  xpaths: elementXpaths,
                },
                locateCacheRecord,
              );
            } else {
              debug(
                'no xpaths found, will not update cache',
                cachePrompt,
                elementXpaths,
              );
            }
          }
          if (!element) {
            throw new Error(`Element not found: ${param.prompt}`);
          }

          // Apply coordinate scaling using shared utility function
          // At this point, element is guaranteed to be non-null due to the check above
          const deviceSize = await this.interface.size();
          const scaledElement = scaleElementCoordinates(
            element!,
            this.scale,
            deviceSize.dpr,
          );

          let hitBy: ExecutionTaskHitBy | undefined;

          if (userExpectedPathHitFlag) {
            hitBy = {
              from: 'User expected path',
              context: {
                xpath: param.xpath,
              },
            };
          } else if (cacheHitFlag) {
            hitBy = {
              from: 'Cache',
              context: {
                xpathsFromCache: xpaths,
                xpathsToSave: currentXpaths,
              },
            };
          } else if (planHitFlag) {
            hitBy = {
              from: 'Planning',
              context: {
                id: elementFromPlan?.id,
                bbox: elementFromPlan?.bbox,
              },
            };
          } else if (aiLocateHitFlag) {
            hitBy = {
              from: 'AI model',
              context: {
                prompt: param.prompt,
              },
            };
          }

          onResult?.(scaledElement);

          return {
            output: {
              element: scaledElement,
            },
            uiContext,
            hitBy,
          };
        },
      };
      return taskFind;
    };

    for (const plan of plans) {
      if (plan.type === 'Locate') {
        if (
          !plan.locate ||
          plan.locate === null ||
          plan.locate?.id === null ||
          plan.locate?.id === 'null'
        ) {
          debug('Locate action with id is null, will be ignored', plan);
          continue;
        }
        const taskLocate = taskForLocatePlan(plan, plan.locate);

        tasks.push(taskLocate);
      } else if (plan.type === 'Error') {
        const taskActionError: ExecutionTaskActionApply<PlanningActionParamError> =
          {
            type: 'Action',
            subType: 'Error',
            param: plan.param,
            thought: plan.thought || plan.param?.thought,
            locate: plan.locate,
            executor: async () => {
              throw new Error(
                plan?.thought || plan.param?.thought || 'error without thought',
              );
            },
          };
        tasks.push(taskActionError);
      } else if (plan.type === 'Finished') {
        const taskActionFinished: ExecutionTaskActionApply<null> = {
          type: 'Action',
          subType: 'Finished',
          param: null,
          thought: plan.thought,
          locate: plan.locate,
          executor: async (param) => {},
        };
        tasks.push(taskActionFinished);
      } else if (plan.type === 'Sleep') {
        const taskActionSleep: ExecutionTaskActionApply<PlanningActionParamSleep> =
          {
            type: 'Action',
            subType: 'Sleep',
            param: plan.param,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (taskParam) => {
              await sleep(taskParam?.timeMs || 3000);
            },
          };
        tasks.push(taskActionSleep);
      } else {
        // action in action space
        const planType = plan.type;
        const actionSpace = await this.interface.actionSpace();
        const action = actionSpace.find((action) => action.name === planType);
        const param = plan.param;

        if (!action) {
          throw new Error(`Action type '${planType}' not found`);
        }

        // find all params that needs location
        const locateFields = action
          ? findAllMidsceneLocatorField(action.paramSchema)
          : [];

        const requiredLocateFields = action
          ? findAllMidsceneLocatorField(action.paramSchema, true)
          : [];

        locateFields.forEach((field) => {
          if (param[field]) {
            const locatePlan = locatePlanForLocate(param[field]);
            debug(
              'will prepend locate param for field',
              `action.type=${planType}`,
              `param=${JSON.stringify(param[field])}`,
              `locatePlan=${JSON.stringify(locatePlan)}`,
            );
            const locateTask = taskForLocatePlan(
              locatePlan,
              param[field],
              (result) => {
                param[field] = result;
              },
            );
            tasks.push(locateTask);
          } else {
            assert(
              !requiredLocateFields.includes(field),
              `Required locate field '${field}' is not provided for action ${planType}`,
            );
            debug(`field '${field}' is not provided for action ${planType}`);
          }
        });

        const task: ExecutionTaskApply<
          'Action',
          any,
          { success: boolean; action: string; param: any },
          void
        > = {
          type: 'Action',
          subType: planType,
          thought: plan.thought,
          param: plan.param,
          executor: async (param, context) => {
            debug(
              'executing action',
              planType,
              param,
              `context.element.center: ${context.element?.center}`,
            );

            // Get context for actionSpace operations to ensure size info is available
            const uiContext = await this.insight.contextRetrieverFn('locate');
            context.task.uiContext = uiContext;

            requiredLocateFields.forEach((field) => {
              assert(
                param[field],
                `field '${field}' is required for action ${planType} but not provided. Cannot execute action ${planType}.`,
              );
            });

            try {
              await Promise.all([
                (async () => {
                  if (this.interface.beforeInvokeAction) {
                    debug('will call "beforeInvokeAction" for interface');
                    await this.interface.beforeInvokeAction(action.name, param);
                    debug('called "beforeInvokeAction" for interface');
                  }
                })(),
                sleep(200),
              ]);
            } catch (originalError: any) {
              const originalMessage =
                originalError?.message || String(originalError);
              throw new Error(
                `error in running beforeInvokeAction for ${action.name}: ${originalMessage}`,
                { cause: originalError },
              );
            }

            debug('calling action', action.name);
            const actionFn = action.call.bind(this.interface);
            await actionFn(param, context);
            debug('called action', action.name);

            try {
              if (this.interface.afterInvokeAction) {
                debug('will call "afterInvokeAction" for interface');
                await this.interface.afterInvokeAction(action.name, param);
                debug('called "afterInvokeAction" for interface');
              }
            } catch (originalError: any) {
              const originalMessage =
                originalError?.message || String(originalError);
              throw new Error(
                `error in running afterInvokeAction for ${action.name}: ${originalMessage}`,
                { cause: originalError },
              );
            }
            // Return a proper result for report generation
            return {
              output: {
                success: true,
                action: planType,
                param: param,
              },
            };
          },
        };
        tasks.push(task);
      }
    }

    const wrappedTasks = tasks.map(
      (task: ExecutionTaskApply, index: number) => {
        if (task.type === 'Action') {
          return this.prependExecutorWithScreenshot(
            task,
            index === tasks.length - 1,
          );
        }
        return task;
      },
    );

    return {
      tasks: wrappedTasks,
    };
  }

  private async setupPlanningContext(executorContext: ExecutorContext) {
    const shotTime = Date.now();
    const uiContext = await this.insight.contextRetrieverFn('locate');
    const recordItem: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: shotTime,
      screenshot: uiContext.screenshotBase64,
      timing: 'before Planning',
    };

    executorContext.task.recorder = [recordItem];
    (executorContext.task as ExecutionTaskPlanning).uiContext = uiContext;

    return {
      uiContext,
    };
  }

  async loadYamlFlowAsPlanning(userInstruction: string, yamlString: string) {
    const taskExecutor = new Executor(taskTitleStr('Action', userInstruction), {
      onTaskStart: this.onTaskStartCallback,
    });

    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'LoadYaml',
      locate: null,
      param: {
        userInstruction,
      },
      executor: async (param, executorContext) => {
        await this.setupPlanningContext(executorContext);
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

    await taskExecutor.append(task);
    await taskExecutor.flush();

    return {
      executor: taskExecutor,
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
        const { uiContext } = await this.setupPlanningContext(executorContext);
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
            finalActions.push({
              type: 'Sleep',
              param: {
                timeMs: timeRemaining,
              },
              locate: null,
            } as PlanningAction<PlanningActionParamSleep>);
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
    const taskExecutor = new Executor(title, {
      onTaskStart: this.onTaskStartCallback,
    });
    const { tasks } = await this.convertPlanToExecutable(plans, modelConfig);
    await taskExecutor.append(tasks);
    const result = await taskExecutor.flush();
    const { output } = result!;
    return {
      output,
      executor: taskExecutor,
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
  ): Promise<
    ExecutionResult<
      | {
          yamlFlow?: MidsceneYamlFlowItem[]; // for cache use
        }
      | undefined
    >
  > {
    this.conversationHistory.reset();

    const taskExecutor = new Executor(taskTitleStr('Action', userPrompt), {
      onTaskStart: this.onTaskStartCallback,
    });

    let replanCount = 0;
    const yamlFlow: MidsceneYamlFlowItem[] = [];
    const replanningCycleLimit = this.getReplanningCycleLimit(
      modelConfig.vlMode === 'vlm-ui-tars',
    );

    // Main planning loop - unified plan/replan logic
    while (true) {
      if (replanCount > replanningCycleLimit) {
        const errorMsg = `Replanning ${replanningCycleLimit} times, which is more than the limit, please split the task into multiple steps`;

        return this.appendErrorPlan(taskExecutor, errorMsg, modelConfig);
      }

      // Create planning task (automatically includes execution history if available)
      const planningTask = this.createPlanningTask(
        userPrompt,
        actionContext,
        modelConfig,
      );

      await taskExecutor.append(planningTask);
      const result = await taskExecutor.flush();
      const planResult: PlanningAIResponse = result?.output;
      if (taskExecutor.isInErrorState()) {
        return {
          output: planResult,
          executor: taskExecutor,
        };
      }

      // Execute planned actions
      const plans = planResult.actions || [];
      yamlFlow.push(...(planResult.yamlFlow || []));

      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(plans, modelConfig);
        taskExecutor.append(executables.tasks);
      } catch (error) {
        return this.appendErrorPlan(
          taskExecutor,
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
          modelConfig,
        );
      }

      await taskExecutor.flush();
      if (taskExecutor.isInErrorState()) {
        return {
          output: undefined,
          executor: taskExecutor,
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
      executor: taskExecutor,
    };
  }

  private createTypeQueryTask(
    type: 'Query' | 'Boolean' | 'Number' | 'String' | 'Assert',
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
        let insightDump: InsightDump | undefined;
        const dumpCollector: DumpSubscriber = (dump) => {
          insightDump = dump;
        };
        this.insight.onceDumpUpdatedFn = dumpCollector;

        // Get context for query operations
        const shotTime = Date.now();
        const uiContext = await this.insight.contextRetrieverFn('extract');
        task.uiContext = uiContext;

        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: shotTime,
          screenshot: uiContext.screenshotBase64,
          timing: 'before Extract',
        };
        task.recorder = [recordItem];

        const ifTypeRestricted = type !== 'Query';
        let demandInput = demand;
        let keyOfResult = 'result';
        if (ifTypeRestricted && type === 'Assert') {
          keyOfResult = 'StatementIsTruthy';
          demandInput = {
            [keyOfResult]: `Boolean, whether the following statement is true: ${demand}`,
          };
        } else if (ifTypeRestricted) {
          demandInput = {
            [keyOfResult]: `${type}, ${demand}`,
          };
        }

        const { data, usage, thought } = await this.insight.extract<any>(
          demandInput,
          modelConfig,
          opt,
          multimodalPrompt,
        );

        let outputResult = data;
        if (ifTypeRestricted) {
          // If AI returned a plain string instead of structured format, use it directly
          if (typeof data === 'string') {
            outputResult = data;
          } else {
            assert(
              data?.[keyOfResult] !== undefined,
              'No result in query data',
            );
            outputResult = (data as any)[keyOfResult];
          }
        }

        return {
          output: outputResult,
          log: { dump: insightDump, isWaitForAssert: opt?.isWaitForAssert },
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
    const taskExecutor = new Executor(
      taskTitleStr(
        type,
        typeof demand === 'string' ? demand : JSON.stringify(demand),
      ),
      {
        onTaskStart: this.onTaskStartCallback,
      },
    );

    const queryTask = await this.createTypeQueryTask(
      type,
      demand,
      modelConfig,
      opt,
      multimodalPrompt,
    );

    await taskExecutor.append(this.prependExecutorWithScreenshot(queryTask));
    const result = await taskExecutor.flush();

    if (!result) {
      throw new Error(
        'result of taskExecutor.flush() is undefined in function createTypeQueryTask',
      );
    }

    const { output, thought } = result;

    return {
      output,
      thought,
      executor: taskExecutor,
    };
  }

  async assert(
    assertion: TUserPrompt,
    modelConfig: IModelConfig,
    opt?: InsightExtractOption,
  ): Promise<ExecutionResult<boolean>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);
    return await this.createTypeQueryExecution<boolean>(
      'Assert',
      textPrompt,
      modelConfig,
      opt,
      multimodalPrompt,
    );
  }

  private async appendErrorPlan(
    taskExecutor: Executor,
    errorMsg: string,
    modelConfig: IModelConfig,
  ) {
    const errorPlan: PlanningAction<PlanningActionParamError> = {
      type: 'Error',
      param: {
        thought: errorMsg,
      },
      locate: null,
    };
    const { tasks } = await this.convertPlanToExecutable(
      [errorPlan],
      modelConfig,
    );
    await taskExecutor.append(this.prependExecutorWithScreenshot(tasks[0]));
    await taskExecutor.flush();

    return {
      output: undefined,
      executor: taskExecutor,
    };
  }

  async taskForSleep(timeMs: number, modelConfig: IModelConfig) {
    const sleepPlan: PlanningAction<PlanningActionParamSleep> = {
      type: 'Sleep',
      param: {
        timeMs,
      },
      locate: null,
    };
    const { tasks: sleepTasks } = await this.convertPlanToExecutable(
      [sleepPlan],
      modelConfig,
    );

    return this.prependExecutorWithScreenshot(sleepTasks[0]);
  }

  async waitFor(
    assertion: TUserPrompt,
    opt: PlanningActionParamWaitFor,
    modelConfig: IModelConfig,
  ): Promise<ExecutionResult<void>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(assertion);

    const description = `waitFor: ${textPrompt}`;
    const taskExecutor = new Executor(taskTitleStr('WaitFor', description), {
      onTaskStart: this.onTaskStartCallback,
    });
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
        'Assert',
        textPrompt,
        modelConfig,
        {
          isWaitForAssert: true,
          doNotThrowError: true,
        },
        multimodalPrompt,
      );

      await taskExecutor.append(this.prependExecutorWithScreenshot(queryTask));
      const result = (await taskExecutor.flush()) as {
        output: boolean;
        thought?: string;
      };

      if (!result) {
        throw new Error(
          'result of taskExecutor.flush() is undefined in function waitFor',
        );
      }

      if (result?.output) {
        return {
          output: undefined,
          executor: taskExecutor,
        };
      }

      errorThought =
        result?.thought ||
        `unknown error when waiting for assertion: ${textPrompt}`;
      const now = Date.now();
      if (now - startTime < checkIntervalMs) {
        const timeRemaining = checkIntervalMs - (now - startTime);
        const sleepTask = await this.taskForSleep(timeRemaining, modelConfig);
        await taskExecutor.append(sleepTask);
      }
    }

    return this.appendErrorPlan(
      taskExecutor,
      `waitFor timeout: ${errorThought}`,
      modelConfig,
    );
  }
}
