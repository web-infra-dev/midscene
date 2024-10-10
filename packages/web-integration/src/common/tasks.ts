import assert from 'node:assert';
import type { WebPage } from '@/common/page';
import Insight, {
  type AIElementParseResponse,
  type DumpSubscriber,
  type ExecutionRecorderItem,
  type ExecutionTaskActionApply,
  type ExecutionTaskApply,
  type ExecutionTaskInsightLocateApply,
  type ExecutionTaskInsightQueryApply,
  type ExecutionTaskPlanningApply,
  Executor,
  plan,
  type InsightAssertionResponse,
  type InsightDump,
  type InsightExtractParam,
  type PlanningAction,
  type PlanningActionParamAssert,
  type PlanningActionParamHover,
  type PlanningActionParamInputOrKeyPress,
  type PlanningActionParamScroll,
  type PlanningActionParamSleep,
  type PlanningActionParamTap,
  type PlanningActionParamWaitFor,
  type PlanningActionParamError,
} from '@midscene/core';
import { sleep } from '@midscene/core/utils';
import { base64Encoded } from '@midscene/shared/img';
import type { KeyInput } from 'puppeteer';
import type { ElementInfo } from '../extractor';
import type { WebElementInfo } from '../web-element';
import { TaskCache } from './task-cache';
import { type WebUIContext, parseContextFromWebPage } from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  executor: Executor;
}

export class PageTaskExecutor {
  page: WebPage;

  insight: Insight<WebElementInfo, WebUIContext>;

  taskCache: TaskCache;

  constructor(page: WebPage, opts: { cacheId: string | undefined }) {
    this.page = page;
    this.insight = new Insight<WebElementInfo, WebUIContext>(async () => {
      return await parseContextFromWebPage(page);
    });

    this.taskCache = new TaskCache({
      fileName: opts?.cacheId,
    });
  }

  private async recordScreenshot(timing: ExecutionRecorderItem['timing']) {
    const file = await this.page.screenshot();
    const item: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: Date.now(),
      screenshot: base64Encoded(file as string),
      timing,
    };
    return item;
  }

  private wrapExecutorWithScreenshot(
    taskApply: ExecutionTaskApply,
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
          await sleep(1000);
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
    const tasks: ExecutionTaskApply[] = plans
      .map((plan) => {
        if (plan.type === 'Locate') {
          const taskFind: ExecutionTaskInsightLocateApply = {
            type: 'Insight',
            subType: 'Locate',
            param: plan.param,
            executor: async (param, taskContext) => {
              const { task } = taskContext;
              let insightDump: InsightDump | undefined;
              const dumpCollector: DumpSubscriber = (dump) => {
                insightDump = dump;
              };
              this.insight.onceDumpUpdatedFn = dumpCollector;
              const pageContext = await this.insight.contextRetrieverFn();
              const locateCache = cacheGroup?.readCache(
                pageContext,
                'locate',
                param.prompt,
              );
              let locateResult: AIElementParseResponse | undefined;
              const callAI = this.insight.aiVendorFn;
              const element = await this.insight.locate(param.prompt, {
                quickAnswer: plan.quickAnswer,
                callAI: async (...message: any) => {
                  if (locateCache) {
                    locateResult = locateCache;
                    return Promise.resolve(locateCache);
                  }
                  locateResult = await callAI(...message);
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

                  if (taskParam.value === '') {
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
                assert(taskParam.value, 'No key to press');
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
                await this.page.mouse.click(
                  element.center[0],
                  element.center[1],
                );
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
                await this.page.mouse.move(
                  element.center[0],
                  element.center[1],
                );
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
                await sleep(taskParam.timeMs || 3000);
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
                  taskParam.thought,
                  'An error occurred, but no thought provided',
                );
                throw new Error(taskParam.thought);
              },
            };
          return taskActionError;
        }

        throw new Error(`Unknown or Unsupported task type: ${plan.type}`);
      })
      .map((task: ExecutionTaskApply) => {
        return this.wrapExecutorWithScreenshot(task);
      });

    return tasks;
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
        const pageContext = await this.insight.contextRetrieverFn();
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
          cache: {
            hit: Boolean(planCache),
          },
        };
      },
    };

    // plan
    await taskExecutor.append(this.wrapExecutorWithScreenshot(planningTask));
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

    await taskExecutor.append(this.wrapExecutorWithScreenshot(queryTask));
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

    await taskExecutor.append(this.wrapExecutorWithScreenshot(assertTask[0]));
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
      await taskExecutor.append(this.wrapExecutorWithScreenshot(assertTask[0]));
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
          this.wrapExecutorWithScreenshot(sleepTask[0]),
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
