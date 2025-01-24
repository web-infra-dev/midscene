import assert from 'node:assert';
import type { WebPage } from '@/common/page';
import type { PuppeteerWebPage } from '@/puppeteer';
import {
  type AIElementIdResponse,
  type DumpSubscriber,
  type ExecutionRecorderItem,
  type ExecutionTaskActionApply,
  type ExecutionTaskApply,
  type ExecutionTaskInsightLocateApply,
  type ExecutionTaskInsightQueryApply,
  type ExecutionTaskPlanningApply,
  type ExecutionTaskProgressOptions,
  Executor,
  type Insight,
  type InsightAssertionResponse,
  type InsightDump,
  type InsightExtractParam,
  type PlanningAIResponse,
  type PlanningAction,
  type PlanningActionParamAssert,
  type PlanningActionParamError,
  type PlanningActionParamHover,
  type PlanningActionParamInputOrKeyPress,
  type PlanningActionParamScroll,
  type PlanningActionParamSleep,
  type PlanningActionParamTap,
  type PlanningActionParamWaitFor,
  plan,
} from '@midscene/core';
import {
  type ChatCompletionMessageParam,
  vlmPlanning,
} from '@midscene/core/ai-model';
import { sleep } from '@midscene/core/utils';
import type { KeyInput } from 'puppeteer';
import type { ElementInfo } from '../extractor';
import type { WebElementInfo } from '../web-element';
import { TaskCache } from './task-cache';
import type { WebUIContext } from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  executor: Executor;
}

export class PageTaskExecutor {
  page: WebPage;

  insight: Insight<WebElementInfo, WebUIContext>;

  taskCache: TaskCache;

  conversationHistory: ChatCompletionMessageParam[] = [];

  constructor(
    page: WebPage,
    insight: Insight<WebElementInfo, WebUIContext>,
    opts: { cacheId: string | undefined },
  ) {
    this.page = page;
    this.insight = insight;

    this.taskCache = new TaskCache({
      cacheId: opts?.cacheId,
    });
  }

  private async recordScreenshot(timing: ExecutionRecorderItem['timing']) {
    const base64 = await this.page.screenshotBase64();
    const item: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: Date.now(),
      screenshot: base64,
      timing,
    };
    return item;
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
        if (taskApply.type === 'Action') {
          await Promise.all([
            (async () => {
              await sleep(100);
              if ((this.page as PuppeteerWebPage).waitUntilNetworkIdle) {
                try {
                  await (this.page as PuppeteerWebPage).waitUntilNetworkIdle({
                    idleTime: 100,
                    timeout: 800,
                  });
                } catch (error) {
                  // console.error('waitUntilNetworkIdle error', error);
                }
              }
            })(),
            sleep(200),
          ]);
        }
        if (appendAfterExecution) {
          const shot2 = await this.recordScreenshot('after Action');
          recorder.push(shot2);
        }
        return result;
      },
    };
    return taskWithScreenshot;
  }

  private async convertPlanToExecutable(
    plans: PlanningAction[],
    cacheGroup?: ReturnType<TaskCache['getCacheGroupByPrompt']>,
  ) {
    const tasks: ExecutionTaskApply[] = [];
    plans.forEach((plan) => {
      if (plan.type === 'Locate') {
        if (plan.locate?.id === null || plan.locate?.id === 'null') {
          // console.warn('Locate action with id is null, will be ignored');
          return;
        }
        const taskFind: ExecutionTaskInsightLocateApply = {
          type: 'Insight',
          subType: 'Locate',
          param: plan.locate || undefined,
          thought: plan.thought,
          locate: plan.locate,
          executor: async (param, taskContext) => {
            const { task } = taskContext;
            assert(param?.prompt || param?.id, 'No prompt or id to locate');
            let insightDump: InsightDump | undefined;
            const dumpCollector: DumpSubscriber = (dump) => {
              insightDump = dump;
            };
            this.insight.onceDumpUpdatedFn = dumpCollector;
            const shotTime = Date.now();
            const pageContext = await this.insight.contextRetrieverFn('locate');
            const recordItem: ExecutionRecorderItem = {
              type: 'screenshot',
              ts: shotTime,
              screenshot: pageContext.screenshotBase64,
              timing: 'before locate',
            };

            const locateCache = cacheGroup?.readCache(
              pageContext,
              'locate',
              param.prompt,
            );
            let locateResult: AIElementIdResponse | undefined;
            const callAI = this.insight.aiVendorFn;

            const quickAnswer = {
              id: param?.id,
              position: param?.position,
            };
            const startTime = Date.now();
            const element = await this.insight.locate(param.prompt, {
              quickAnswer,
              callAI: async (...message: any) => {
                if (locateCache) {
                  locateResult = locateCache;
                  return Promise.resolve({ content: locateCache });
                }
                const { content: aiResult, usage } = await callAI(...message);
                // locateResult = transformElementPositionToId(
                //   aiResult,
                //   pageContext.content,
                //   size,
                // );
                // assert(locateResult);
                return { content: aiResult, usage };
              },
            });
            const aiCost = Date.now() - startTime;

            if (locateResult) {
              cacheGroup?.saveCache({
                type: 'locate',
                pageContext: {
                  url: pageContext.url,
                  size: pageContext.size,
                },
                prompt: param.prompt,
                response: locateResult,
              });
            }
            if (!element) {
              task.log = {
                dump: insightDump,
              };
              throw new Error(`Element not found: ${param.prompt}`);
            }

            return {
              output: {
                element,
              },
              log: {
                dump: insightDump,
              },
              cache: {
                hit: Boolean(locateCache),
              },
              recorder: [recordItem],
              aiCost,
            };
          },
        };
        tasks.push(taskFind);
      } else if (plan.type === 'Assert' || plan.type === 'AssertWithoutThrow') {
        const assertPlan = plan as PlanningAction<PlanningActionParamAssert>;
        const taskAssert: ExecutionTaskApply = {
          type: 'Insight',
          subType: 'Assert',
          param: assertPlan.param,
          thought: assertPlan.thought,
          locate: assertPlan.locate,
          executor: async (param, taskContext) => {
            const { task } = taskContext;
            let insightDump: InsightDump | undefined;
            const dumpCollector: DumpSubscriber = (dump) => {
              insightDump = dump;
            };
            this.insight.onceDumpUpdatedFn = dumpCollector;
            const assertion = await this.insight.assert(
              assertPlan.param.assertion,
            );

            if (!assertion.pass) {
              if (plan.type === 'Assert') {
                task.output = assertion;
                task.log = {
                  dump: insightDump,
                };
                throw new Error(
                  assertion.thought || 'Assertion failed without reason',
                );
              }

              task.error = assertion.thought;
            }

            return {
              output: assertion,
              log: {
                dump: insightDump,
              },
            };
          },
        };
        tasks.push(taskAssert);
      } else if (plan.type === 'Input') {
        const taskActionInput: ExecutionTaskActionApply<PlanningActionParamInputOrKeyPress> =
          {
            type: 'Action',
            subType: 'Input',
            param: plan.param,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (taskParam, { element }) => {
              if (element) {
                await this.page.clearInput(element as ElementInfo);

                if (!taskParam || !taskParam.value) {
                  return;
                }

                await this.page.keyboard.type(taskParam.value);
              } else {
                await this.page.keyboard.type(taskParam.value);
              }
            },
          };
        tasks.push(taskActionInput);
      } else if (plan.type === 'KeyboardPress') {
        const taskActionKeyboardPress: ExecutionTaskActionApply<PlanningActionParamInputOrKeyPress> =
          {
            type: 'Action',
            subType: 'KeyboardPress',
            param: plan.param,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (taskParam) => {
              assert(taskParam?.value, 'No key to press');
              await this.page.keyboard.press(taskParam.value as KeyInput);
            },
          };
        tasks.push(taskActionKeyboardPress);
      } else if (plan.type === 'Tap') {
        const taskActionTap: ExecutionTaskActionApply<PlanningActionParamTap> =
          {
            type: 'Action',
            subType: 'Tap',
            thought: plan.thought,
            locate: plan.locate,
            executor: async (param, { element }) => {
              assert(element, 'Element not found, cannot tap');
              await this.page.mouse.click(element.center[0], element.center[1]);
            },
          };
        tasks.push(taskActionTap);
      } else if (plan.type === 'Hover') {
        const taskActionHover: ExecutionTaskActionApply<PlanningActionParamHover> =
          {
            type: 'Action',
            subType: 'Hover',
            thought: plan.thought,
            locate: plan.locate,
            executor: async (param, { element }) => {
              assert(element, 'Element not found, cannot hover');
              await this.page.mouse.move(element.center[0], element.center[1]);
            },
          };
        tasks.push(taskActionHover);
      } else if (plan.type === 'Scroll') {
        const taskActionScroll: ExecutionTaskActionApply<PlanningActionParamScroll> =
          {
            type: 'Action',
            subType: 'Scroll',
            param: plan.param,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (taskParam, { element }) => {
              const startingPoint = element
                ? {
                    left: element.center[0],
                    top: element.center[1],
                  }
                : undefined;
              const scrollToEventName = taskParam?.scrollType;
              if (scrollToEventName === 'untilTop') {
                await this.page.scrollUntilTop(startingPoint);
              } else if (scrollToEventName === 'untilBottom') {
                await this.page.scrollUntilBottom(startingPoint);
              } else if (scrollToEventName === 'untilRight') {
                await this.page.scrollUntilRight(startingPoint);
              } else if (scrollToEventName === 'untilLeft') {
                await this.page.scrollUntilLeft(startingPoint);
              } else if (scrollToEventName === 'once' || !scrollToEventName) {
                if (taskParam?.direction === 'down') {
                  await this.page.scrollDown(
                    taskParam.distance || undefined,
                    startingPoint,
                  );
                } else if (taskParam?.direction === 'up') {
                  await this.page.scrollUp(
                    taskParam.distance || undefined,
                    startingPoint,
                  );
                } else if (taskParam?.direction === 'left') {
                  await this.page.scrollLeft(
                    taskParam.distance || undefined,
                    startingPoint,
                  );
                } else if (taskParam?.direction === 'right') {
                  await this.page.scrollRight(
                    taskParam.distance || undefined,
                    startingPoint,
                  );
                } else {
                  throw new Error(
                    `Unknown scroll direction: ${taskParam.direction}`,
                  );
                }
                // until mouse event is done
                await sleep(500);
              } else {
                throw new Error(
                  `Unknown scroll event type: ${scrollToEventName}, taskParam: ${JSON.stringify(
                    taskParam,
                  )}`,
                );
              }
            },
          };
        tasks.push(taskActionScroll);
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
      } else if (plan.type === 'Error') {
        const taskActionError: ExecutionTaskActionApply<PlanningActionParamError> =
          {
            type: 'Action',
            subType: 'Error',
            param: plan.param,
            thought: plan.thought,
            locate: plan.locate,
            executor: async () => {
              throw new Error(plan?.thought || 'error without thought');
            },
          };
        tasks.push(taskActionError);
      } else if (plan.type === 'FalsyConditionStatement') {
        const taskActionFalsyConditionStatement: ExecutionTaskActionApply<null> =
          {
            type: 'Action',
            subType: 'FalsyConditionStatement',
            param: null,
            thought: plan.thought,
            locate: plan.locate,
            executor: async () => {
              // console.warn(`[warn]falsy condition: ${plan.thought}`);
            },
          };
        tasks.push(taskActionFalsyConditionStatement);
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
      } else {
        throw new Error(`Unknown or unsupported task type: ${plan.type}`);
      }
    });

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

  private planningTaskFromPrompt(
    userPrompt: string,
    cacheGroup: ReturnType<TaskCache['getCacheGroupByPrompt']>,
    whatHaveDone?: string,
    originalPrompt?: string,
  ) {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      locate: null,
      param: {
        userPrompt,
        whatHaveDone,
        originalPrompt,
      },
      executor: async (param, executorContext) => {
        const shotTime = Date.now();
        const pageContext = await this.insight.contextRetrieverFn('locate');
        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: shotTime,
          screenshot: pageContext.screenshotBase64,
          timing: 'before planning',
        };

        executorContext.task.recorder = [recordItem];
        (executorContext.task as any).pageContext = pageContext;

        const planCache = cacheGroup.readCache(pageContext, 'plan', userPrompt);
        let planResult: Awaited<ReturnType<typeof plan>>;
        if (planCache) {
          // console.log('planCache', planCache);
          planResult = planCache;
        } else {
          planResult = await plan(param.userPrompt, {
            context: pageContext,
            whatHaveDone: param.whatHaveDone,
            originalPrompt: param.originalPrompt,
          });
        }

        const { actions, furtherPlan, taskWillBeAccomplished, error } =
          planResult;
        // console.log('actions', taskWillBeAccomplished, actions, furtherPlan);

        let stopCollecting = false;
        const finalActions = actions.reduce<PlanningAction[]>(
          (acc, planningAction) => {
            if (stopCollecting) {
              return acc;
            }

            if (planningAction.locate) {
              acc.push({
                type: 'Locate',
                locate: planningAction.locate,
                // remove id from planning, since the result is not accurate
                // locate: {
                //   prompt: planningAction.locate.prompt,
                // },
                param: null,
                thought: planningAction.locate.prompt,
              });
            } else if (
              ['Tap', 'Hover', 'Input'].includes(planningAction.type)
            ) {
              // should include locate but get null
              stopCollecting = true;
              return acc;
            }
            acc.push(planningAction);
            return acc;
          },
          [],
        );

        assert(
          finalActions.length > 0,
          error ? `No plan: ${error}` : 'No plans found',
        );

        cacheGroup.saveCache({
          type: 'plan',
          pageContext: {
            url: pageContext.url,
            size: pageContext.size,
          },
          prompt: userPrompt,
          response: planResult,
        });

        return {
          output: {
            actions: finalActions,
            taskWillBeAccomplished: false,
            furtherPlan,
          },
          cache: {
            hit: Boolean(planCache),
          },
          pageContext, // ?
          recorder: [recordItem],
        };
      },
    };

    return task;
  }

  private planningTaskToGoal(userPrompt: string) {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      locate: null,
      param: {
        userPrompt,
      },
      executor: async (param, executorContext) => {
        const shotTime = Date.now();
        const pageContext = await this.insight.contextRetrieverFn('locate');
        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: shotTime,
          screenshot: pageContext.screenshotBase64,
          timing: 'before planning',
        };
        executorContext.task.recorder = [recordItem];
        (executorContext.task as any).pageContext = pageContext;
        this.appendConversationHistory({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: pageContext.screenshotBase64,
              },
            },
          ],
        });
        const startTime = Date.now();
        const planResult = await vlmPlanning({
          userInstruction: param.userPrompt,
          conversationHistory: this.conversationHistory,
          size: pageContext.size,
        });
        const aiCost = Date.now() - startTime;
        const { actions, action_summary } = planResult;
        this.appendConversationHistory({
          role: 'assistant',
          content: action_summary,
        });
        return {
          output: {
            actions,
            thought: actions[0].thought,
            actionType: actions[0].type,
            taskWillBeAccomplished: false,
            furtherPlan: {
              whatToDoNext: '',
              whatHaveDone: '',
            },
          },
          aiCost,
        };
      },
    };

    return task;
  }

  async action(
    userPrompt: string,
    options?: ExecutionTaskProgressOptions,
  ): Promise<ExecutionResult> {
    const taskExecutor = new Executor(userPrompt, undefined, undefined, {
      onTaskStart: options?.onTaskStart,
    });

    const cacheGroup = this.taskCache.getCacheGroupByPrompt(userPrompt);
    const originalPrompt = userPrompt;
    let planningTask: ExecutionTaskPlanningApply | null =
      this.planningTaskFromPrompt(originalPrompt, cacheGroup);
    let result: any;
    let replanCount = 0;
    while (planningTask) {
      if (replanCount > 5) {
        const errorMsg =
          'Replanning too many times, please split the task into multiple steps';

        return this.appendErrorPlan(taskExecutor, errorMsg);
      }

      if (replanCount > 0) {
        // add a brief sleep to wait for the page to be ready
        await sleep(300);
      }

      // plan
      await taskExecutor.append(planningTask);
      const planResult: PlanningAIResponse = await taskExecutor.flush();
      if (taskExecutor.isInErrorState()) {
        return {
          output: planResult,
          executor: taskExecutor,
        };
      }

      const plans = planResult.actions;

      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(plans, cacheGroup);
        taskExecutor.append(executables.tasks);
      } catch (error) {
        return this.appendErrorPlan(
          taskExecutor,
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }

      result = await taskExecutor.flush();
      if (taskExecutor.isInErrorState()) {
        return {
          output: result,
          executor: taskExecutor,
        };
      }
      if (planResult.furtherPlan?.whatToDoNext) {
        planningTask = this.planningTaskFromPrompt(
          planResult.furtherPlan.whatToDoNext,
          cacheGroup,
          planResult.furtherPlan.whatHaveDone,
          originalPrompt,
        );
        replanCount++;
      } else {
        planningTask = null;
        break;
      }
    }

    return {
      output: result,
      executor: taskExecutor,
    };
  }

  async actionToGoal(
    userPrompt: string,
    options?: ExecutionTaskProgressOptions,
  ) {
    const taskExecutor = new Executor(userPrompt, undefined, undefined, {
      onTaskStart: options?.onTaskStart,
    });
    this.conversationHistory = [];

    const isCompleted = false;
    let currentActionNumber = 0;
    const maxActionNumber = 20;

    while (!isCompleted && currentActionNumber < maxActionNumber) {
      currentActionNumber++;
      const planningTask: ExecutionTaskPlanningApply =
        this.planningTaskToGoal(userPrompt);
      await taskExecutor.append(planningTask);
      const output = await taskExecutor.flush();
      if (taskExecutor.isInErrorState()) {
        return {
          output: output,
          executor: taskExecutor,
        };
      }
      const plans = output.actions;
      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(plans);
        taskExecutor.append(executables.tasks);
      } catch (error) {
        return this.appendErrorPlan(
          taskExecutor,
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }

      const result = await taskExecutor.flush();

      if (taskExecutor.isInErrorState()) {
        return {
          output: result,
          executor: taskExecutor,
        };
      }

      if (plans[0].type === 'Finished') {
        break;
      }
    }
    return {
      output: {},
      executor: taskExecutor,
    };
  }

  async query(
    demand: InsightExtractParam,
    options?: ExecutionTaskProgressOptions,
  ): Promise<ExecutionResult> {
    const description =
      typeof demand === 'string' ? demand : JSON.stringify(demand);
    const taskExecutor = new Executor(description, undefined, undefined, {
      onTaskStart: options?.onTaskStart,
    });
    const queryTask: ExecutionTaskInsightQueryApply = {
      type: 'Insight',
      subType: 'Query',
      locate: null,
      param: {
        dataDemand: demand,
      },
      executor: async (param) => {
        let insightDump: InsightDump | undefined;
        const dumpCollector: DumpSubscriber = (dump) => {
          insightDump = dump;
        };
        this.insight.onceDumpUpdatedFn = dumpCollector;
        const data = await this.insight.extract<any>(param.dataDemand);
        return {
          output: data,
          log: { dump: insightDump },
        };
      },
    };

    await taskExecutor.append(this.prependExecutorWithScreenshot(queryTask));
    const output = await taskExecutor.flush();
    return {
      output,
      executor: taskExecutor,
    };
  }

  async assert(
    assertion: string,
    options?: ExecutionTaskProgressOptions,
  ): Promise<ExecutionResult<InsightAssertionResponse>> {
    const description = `assert: ${assertion}`;
    const taskExecutor = new Executor(description, undefined, undefined, {
      onTaskStart: options?.onTaskStart,
    });
    const assertionPlan: PlanningAction<PlanningActionParamAssert> = {
      type: 'Assert',
      param: {
        assertion,
      },
      locate: null,
    };
    const { tasks } = await this.convertPlanToExecutable([assertionPlan]);

    await taskExecutor.append(this.prependExecutorWithScreenshot(tasks[0]));
    const output: InsightAssertionResponse = await taskExecutor.flush();

    return {
      output,
      executor: taskExecutor,
    };
  }

  /**
   * Append a message to the conversation history
   * For user messages with images:
   * - Keep max 4 user image messages in history
   * - Remove oldest user image message when limit reached
   * For assistant messages:
   * - Simply append to history
   * @param conversationHistory Message to append
   */
  private appendConversationHistory(
    conversationHistory: ChatCompletionMessageParam,
  ) {
    if (conversationHistory.role === 'user') {
      // Get all existing user messages with images
      const userImgItems = this.conversationHistory.filter(
        (item) => item.role === 'user',
      );

      // If we already have 4 user image messages
      if (userImgItems.length >= 4 && conversationHistory.role === 'user') {
        // Remove first user image message when we already have 4, before adding new one
        const firstUserImgIndex = this.conversationHistory.findIndex(
          (item) => item.role === 'user',
        );
        if (firstUserImgIndex >= 0) {
          this.conversationHistory.splice(firstUserImgIndex, 1);
        }
      }
    }
    // For non-user messages, simply append to history
    this.conversationHistory.push(conversationHistory);
  }

  private async appendErrorPlan(taskExecutor: Executor, errorMsg: string) {
    const errorPlan: PlanningAction<PlanningActionParamError> = {
      type: 'Error',
      param: {
        thought: errorMsg,
      },
      locate: null,
    };
    const { tasks } = await this.convertPlanToExecutable([errorPlan]);
    await taskExecutor.append(this.prependExecutorWithScreenshot(tasks[0]));
    await taskExecutor.flush();

    return {
      output: undefined,
      executor: taskExecutor,
    };
  }

  async waitFor(
    assertion: string,
    opt: PlanningActionParamWaitFor,
  ): Promise<ExecutionResult<void>> {
    const description = `waitFor: ${assertion}`;
    const taskExecutor = new Executor(description);
    const { timeoutMs, checkIntervalMs } = opt;

    assert(assertion, 'No assertion for waitFor');
    assert(timeoutMs, 'No timeoutMs for waitFor');
    assert(checkIntervalMs, 'No checkIntervalMs for waitFor');

    const overallStartTime = Date.now();
    let startTime = Date.now();
    let errorThought = '';
    while (Date.now() - overallStartTime < timeoutMs) {
      startTime = Date.now();
      const assertPlan: PlanningAction<PlanningActionParamAssert> = {
        type: 'AssertWithoutThrow',
        param: {
          assertion,
        },
        locate: null,
      };
      const { tasks: assertTasks } = await this.convertPlanToExecutable([
        assertPlan,
      ]);
      await taskExecutor.append(
        this.prependExecutorWithScreenshot(assertTasks[0]),
      );
      const output: InsightAssertionResponse = await taskExecutor.flush();

      if (output?.pass) {
        return {
          output: undefined,
          executor: taskExecutor,
        };
      }

      errorThought = output?.thought || 'unknown error';
      const now = Date.now();
      if (now - startTime < checkIntervalMs) {
        const timeRemaining = checkIntervalMs - (now - startTime);
        const sleepPlan: PlanningAction<PlanningActionParamSleep> = {
          type: 'Sleep',
          param: {
            timeMs: timeRemaining,
          },
          locate: null,
        };
        const { tasks: sleepTasks } = await this.convertPlanToExecutable([
          sleepPlan,
        ]);
        await taskExecutor.append(
          this.prependExecutorWithScreenshot(sleepTasks[0]),
        );
        await taskExecutor.flush();
      }
    }

    return this.appendErrorPlan(
      taskExecutor,
      `waitFor timeout: ${errorThought}`,
    );
  }
}
