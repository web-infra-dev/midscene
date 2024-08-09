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
  type InsightAssertionResponse,
  type InsightDump,
  type InsightExtractParam,
  plan,
  type PlanningAction,
  type PlanningActionParamAssert,
  type PlanningActionParamHover,
  type PlanningActionParamInputOrKeyPress,
  type PlanningActionParamScroll,
  type PlanningActionParamSleep,
  type PlanningActionParamTap,
} from '@midscene/core';
import { base64Encoded } from '@midscene/core/image';
import { commonScreenshotParam, getTmpFile, sleep } from '@midscene/core/utils';
import type { ChatCompletionMessageParam } from 'openai/resources';
import type { KeyInput, Page as PuppeteerPage } from 'puppeteer';
import type { WebElementInfo } from '../web-element';
import { type AiTaskCache, TaskCache } from './task-cache';
import { type WebUIContext, parseContextFromWebPage } from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  executor: Executor;
}

export class PageTaskExecutor {
  page: WebPage;

  insight: Insight<WebElementInfo, WebUIContext>;

  taskCache: TaskCache;

  constructor(page: WebPage, opts: { cache: AiTaskCache }) {
    this.page = page;
    this.insight = new Insight<WebElementInfo, WebUIContext>(async () => {
      return await parseContextFromWebPage(page);
    });
    this.taskCache = new TaskCache(opts);
  }

  private async recordScreenshot(timing: ExecutionRecorderItem['timing']) {
    const file = getTmpFile('jpeg');
    await this.page.screenshot({
      ...commonScreenshotParam,
      path: file,
    });
    const item: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: Date.now(),
      screenshot: base64Encoded(file),
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

  private async convertPlanToExecutable(plans: PlanningAction[]) {
    const tasks: ExecutionTaskApply[] = plans
      .map((plan) => {
        if (plan.type === 'Locate') {
          const taskFind: ExecutionTaskInsightLocateApply = {
            type: 'Insight',
            subType: 'Locate',
            param: plan.param,
            executor: async (param) => {
              let insightDump: InsightDump | undefined;
              const dumpCollector: DumpSubscriber = (dump) => {
                insightDump = dump;
              };
              this.insight.onceDumpUpdatedFn = dumpCollector;
              const pageContext = await this.insight.contextRetrieverFn();
              const locateCache = this.taskCache.readCache(
                pageContext,
                'locate',
                param.prompt,
              );
              let locateResult: AIElementParseResponse | undefined;
              const callAI = this.insight.aiVendorFn<AIElementParseResponse>;
              const element = await this.insight.locate(param.prompt, {
                callAI: async (message: ChatCompletionMessageParam[]) => {
                  if (locateCache) {
                    locateResult = locateCache;
                    return Promise.resolve(locateCache);
                  }
                  locateResult = await callAI(message);
                  return locateResult;
                },
              });

              assert(element, `Element not found: ${param.prompt}`);
              if (locateResult) {
                this.taskCache.saveCache({
                  type: 'locate',
                  pageContext: {
                    url: pageContext.url,
                    size: pageContext.size,
                  },
                  prompt: param.prompt,
                  response: locateResult,
                });
              }
              return {
                output: {
                  element,
                },
                log: {
                  dump: insightDump,
                },
                cache: {
                  hit: Boolean(locateResult),
                },
              };
            },
          };
          return taskFind;
        }
        if (plan.type === 'Assert') {
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
                task.output = assertion;
                task.log = {
                  dump: insightDump,
                };
                throw new Error(
                  assertion.thought || 'Assertion failed without reason',
                );
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
                  await this.page.mouse.click(
                    element.center[0],
                    element.center[1],
                  );
                }
                assert(taskParam.value, 'No value to input');
                await this.page.keyboard.type(taskParam.value);
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
                // console.log('executor args', param, element);
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
                const innerHeight = await (this.page as PuppeteerPage).evaluate(
                  () => window.innerHeight,
                );

                switch (scrollToEventName) {
                  case 'ScrollUntilTop':
                    await this.page.mouse.wheel(0, -9999999);
                    break;
                  case 'ScrollUntilBottom':
                    await this.page.mouse.wheel(0, 9999999);
                    break;
                  case 'ScrollUp':
                    await this.page.mouse.wheel(0, -innerHeight);
                    break;
                  case 'ScrollDown':
                    await this.page.mouse.wheel(0, innerHeight);
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
                assert(taskParam.timeMs, 'No time to sleep');
                await sleep(taskParam.timeMs);
              },
            };
          return taskActionSleep;
        }
        if (plan.type === 'Error') {
          throw new Error(`Got a task plan with type Error: ${plan.thought}`);
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
    taskExecutor.description = userPrompt;

    let plans: PlanningAction[] = [];
    const planningTask: ExecutionTaskPlanningApply = {
      type: 'Planning',
      param: {
        userPrompt,
      },
      executor: async (param) => {
        const pageContext = await this.insight.contextRetrieverFn();
        let planResult: { plans: PlanningAction[] };
        const planCache = this.taskCache.readCache(
          pageContext,
          'plan',
          userPrompt,
        );
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

        this.taskCache.saveCache({
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
    const executables = await this.convertPlanToExecutable(plans);
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
    taskExecutor.description = description;
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
    const description = assertion;
    const taskExecutor = new Executor(description);
    taskExecutor.description = description;
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
}
