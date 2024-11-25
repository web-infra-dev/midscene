import assert from 'node:assert';
import type { WebPage } from '@/common/page';
import type { PuppeteerWebPage } from '@/puppeteer';
import {
  type AIElementIdResponse,
  type AIElementResponse,
  type DumpSubscriber,
  type ExecutionRecorderItem,
  type ExecutionTaskActionApply,
  type ExecutionTaskApply,
  type ExecutionTaskInsightLocateApply,
  type ExecutionTaskInsightQueryApply,
  type ExecutionTaskPlanningApply,
  Executor,
  type Insight,
  type InsightAssertionResponse,
  type InsightDump,
  type InsightExtractParam,
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
  transformElementPositionToId,
} from '@midscene/core';
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
                await (this.page as PuppeteerWebPage).waitUntilNetworkIdle();
              }
            })(),
            sleep(300),
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
    const tasks: ExecutionTaskApply[] = plans.map((plan) => {
      if (plan.type === 'Locate') {
        const taskFind: ExecutionTaskInsightLocateApply = {
          type: 'Insight',
          subType: 'Locate',
          param: plan.param,
          quickAnswer: plan.quickAnswer,
          executor: async (param, taskContext) => {
            const { task } = taskContext;
            assert(param?.prompt, 'No prompt to locate');
            let insightDump: InsightDump | undefined;
            const dumpCollector: DumpSubscriber = (dump) => {
              insightDump = dump;
            };
            this.insight.onceDumpUpdatedFn = dumpCollector;
            const shotTime = Date.now();
            const pageContext = await this.insight.contextRetrieverFn();
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
            const element = await this.insight.locate(param.prompt, {
              quickAnswer: task.quickAnswer,
              callAI: async (...message: any) => {
                if (locateCache) {
                  locateResult = locateCache;
                  return Promise.resolve(locateCache);
                }
                const aiResult: AIElementResponse = await callAI(...message);
                locateResult = transformElementPositionToId(
                  aiResult,
                  pageContext.content,
                );
                assert(locateResult);
                return locateResult;
              },
            });

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
            };
          },
        };
        return taskFind;
      }
      if (plan.type === 'Assert' || plan.type === 'AssertWithoutThrow') {
        const assertPlan = plan as PlanningAction<PlanningActionParamAssert>;
        const taskAssert: ExecutionTaskApply = {
          type: 'Insight',
          subType: 'Assert',
          param: assertPlan.param,
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
        return taskAssert;
      }
      if (plan.type === 'Input') {
        const taskActionInput: ExecutionTaskActionApply<PlanningActionParamInputOrKeyPress> =
          {
            type: 'Action',
            subType: 'Input',
            param: plan.param,
            executor: async (taskParam, { element }) => {
              if (element) {
                await this.page.clearInput(element as ElementInfo);

                if (!taskParam || !taskParam.value) {
                  return;
                }

                await this.page.keyboard.type(taskParam.value);
              }
            },
          };
        return taskActionInput;
      }
      if (plan.type === 'KeyboardPress') {
        const taskActionKeyboardPress: ExecutionTaskActionApply<PlanningActionParamInputOrKeyPress> =
          {
            type: 'Action',
            subType: 'KeyboardPress',
            param: plan.param,
            executor: async (taskParam) => {
              assert(taskParam?.value, 'No key to press');
              await this.page.keyboard.press(taskParam.value as KeyInput);
            },
          };
        return taskActionKeyboardPress;
      }
      if (plan.type === 'Tap') {
        const taskActionTap: ExecutionTaskActionApply<PlanningActionParamTap> =
          {
            type: 'Action',
            subType: 'Tap',
            executor: async (param, { element }) => {
              assert(element, 'Element not found, cannot tap');
              await this.page.mouse.click(element.center[0], element.center[1]);
            },
          };
        return taskActionTap;
      }
      if (plan.type === 'Hover') {
        const taskActionHover: ExecutionTaskActionApply<PlanningActionParamHover> =
          {
            type: 'Action',
            subType: 'Hover',
            executor: async (param, { element }) => {
              assert(element, 'Element not found, cannot hover');
              await this.page.mouse.move(element.center[0], element.center[1]);
            },
          };
        return taskActionHover;
      }
      if (plan.type === 'Scroll') {
        const taskActionScroll: ExecutionTaskActionApply<PlanningActionParamScroll> =
          {
            type: 'Action',
            subType: 'Scroll',
            param: plan.param,
            executor: async (taskParam) => {
              const scrollToEventName = taskParam.scrollType;

              switch (scrollToEventName) {
                case 'scrollUntilTop':
                  await this.page.scrollUntilTop();
                  break;
                case 'scrollUntilBottom':
                  await this.page.scrollUntilBottom();
                  break;
                case 'scrollUpOneScreen':
                  await this.page.scrollUpOneScreen();
                  break;
                case 'scrollDownOneScreen':
                  await this.page.scrollDownOneScreen();
                  break;
                default:
                  console.error(
                    'Unknown scroll event type:',
                    scrollToEventName,
                  );
              }
            },
          };
        return taskActionScroll;
      }
      if (plan.type === 'Sleep') {
        const taskActionSleep: ExecutionTaskActionApply<PlanningActionParamSleep> =
          {
            type: 'Action',
            subType: 'Sleep',
            param: plan.param,
            executor: async (taskParam) => {
              await sleep(taskParam?.timeMs || 3000);
            },
          };
        return taskActionSleep;
      }
      if (plan.type === 'Error') {
        const taskActionError: ExecutionTaskActionApply<PlanningActionParamError> =
          {
            type: 'Action',
            subType: 'Error',
            param: plan.param,
            executor: async (taskParam) => {
              assert(
                taskParam?.thought,
                'An error occurred, but no thought provided',
              );
              throw new Error(taskParam?.thought || 'error without thought');
            },
          };
        return taskActionError;
      }

      throw new Error(`Unknown or Unsupported task type: ${plan.type}`);
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

    return wrappedTasks;
  }

  async action(
    userPrompt: string /* , actionInfo?: { actionType?: EventActions[number]['action'] } */,
  ): Promise<ExecutionResult> {
    const taskExecutor = new Executor(userPrompt);
    const cacheGroup = this.taskCache.getCacheGroupByPrompt(userPrompt);
    let plans: PlanningAction[] = [];
    const planningTask: ExecutionTaskPlanningApply = {
      type: 'Planning',
      param: {
        userPrompt,
      },
      executor: async (param) => {
        const shotTime = Date.now();
        const pageContext = await this.insight.contextRetrieverFn();
        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: shotTime,
          screenshot: pageContext.screenshotBase64,
          timing: 'before planning',
        };

        let planResult: { plans: PlanningAction[] };
        const planCache = cacheGroup.readCache(pageContext, 'plan', userPrompt);
        if (planCache) {
          planResult = planCache;
        } else {
          planResult = await plan(param.userPrompt, {
            context: pageContext,
          });
        }

        assert(planResult.plans.length > 0, 'No plans found');
        // eslint-disable-next-line prefer-destructuring
        plans = planResult.plans;

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
          output: planResult,
          pageContext,
          cache: {
            hit: Boolean(planCache),
          },
          recorder: [recordItem],
        };
      },
    };

    // plan
    await taskExecutor.append(planningTask);
    let output = await taskExecutor.flush();
    if (taskExecutor.isInErrorState()) {
      return {
        output,
        executor: taskExecutor,
      };
    }

    // append tasks
    const executables = await this.convertPlanToExecutable(plans, cacheGroup);
    await taskExecutor.append(executables);

    // flush actions
    output = await taskExecutor.flush();
    return {
      output,
      executor: taskExecutor,
    };
  }

  async query(demand: InsightExtractParam): Promise<ExecutionResult> {
    const description =
      typeof demand === 'string' ? demand : JSON.stringify(demand);
    const taskExecutor = new Executor(description);
    const queryTask: ExecutionTaskInsightQueryApply = {
      type: 'Insight',
      subType: 'Query',
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
  ): Promise<ExecutionResult<InsightAssertionResponse>> {
    const description = `assert: ${assertion}`;
    const taskExecutor = new Executor(description);
    const assertionPlan: PlanningAction<PlanningActionParamAssert> = {
      type: 'Assert',
      param: {
        assertion,
      },
    };
    const assertTask = await this.convertPlanToExecutable([assertionPlan]);

    await taskExecutor.append(
      this.prependExecutorWithScreenshot(assertTask[0]),
    );
    const output: InsightAssertionResponse = await taskExecutor.flush();

    return {
      output,
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
      };
      const assertTask = await this.convertPlanToExecutable([assertPlan]);
      await taskExecutor.append(
        this.prependExecutorWithScreenshot(assertTask[0]),
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
        };
        const sleepTask = await this.convertPlanToExecutable([sleepPlan]);
        await taskExecutor.append(
          this.prependExecutorWithScreenshot(sleepTask[0]),
        );
        await taskExecutor.flush();
      }
    }

    // throw an error using taskExecutor
    const errorPlan: PlanningAction<PlanningActionParamError> = {
      type: 'Error',
      param: {
        thought: `waitFor timeout: ${errorThought}`,
      },
    };
    const errorTask = await this.convertPlanToExecutable([errorPlan]);
    await taskExecutor.append(errorTask[0]);
    await taskExecutor.flush();
    return {
      output: undefined,
      executor: taskExecutor,
    };
  }
}
