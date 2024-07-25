import assert from 'assert';
import type { Page as PlaywrightPage } from 'playwright';
import Insight, {
  DumpSubscriber,
  ExecutionDump,
  ExecutionRecorderItem,
  ExecutionTaskActionApply,
  ExecutionTaskApply,
  ExecutionTaskInsightLocateApply,
  ExecutionTaskInsightQueryApply,
  ExecutionTaskPlanningApply,
  Executor,
  InsightDump,
  InsightExtractParam,
  PlanningAction,
  PlanningActionParamHover,
  PlanningActionParamInputOrKeyPress,
  PlanningActionParamScroll,
  PlanningActionParamTap,
  plan,
} from '@midscene/core';
import { commonScreenshotParam, getTmpFile, sleep } from '@midscene/core/utils';
import { base64Encoded } from '@midscene/core/image';
import { parseContextFromPlaywrightPage } from './utils';
import { WebElementInfo } from './element';

export class PlayWrightActionAgent {
  page: PlaywrightPage;

  insight: Insight<WebElementInfo>;

  executor: Executor;

  actionDump?: ExecutionDump;

  constructor(page: PlaywrightPage, opt?: { taskName?: string }) {
    this.page = page;
    this.insight = new Insight<WebElementInfo>(async () => {
      return await parseContextFromPlaywrightPage(page);
    });
    this.executor = new Executor(opt?.taskName || 'MidScene - PlayWrightAI');
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

  private wrapExecutorWithScreenshot(taskApply: ExecutionTaskApply): ExecutionTaskApply {
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
            param: {
              prompt: plan.thought,
            },
            executor: async (param) => {
              let insightDump: InsightDump | undefined;
              const dumpCollector: DumpSubscriber = (dump) => {
                insightDump = dump;
              };
              this.insight.onceDumpUpdatedFn = dumpCollector;
              const element = await this.insight.locate(param.prompt);
              assert(element, `Element not found: ${param.prompt}`);
              return {
                output: {
                  element,
                },
                log: {
                  dump: insightDump,
                },
              };
            },
          };
          return taskFind;
        } else if (plan.type === 'Input') {
          const taskActionInput: ExecutionTaskActionApply<PlanningActionParamInputOrKeyPress> = {
            type: 'Action',
            subType: 'Input',
            param: plan.param,
            executor: async (taskParam) => {
              assert(taskParam.value, 'No value to input');
              await this.page.keyboard.type(taskParam.value);
            },
          };
          // TODO: return a recorder Object
          return taskActionInput;
        } else if (plan.type === 'KeyboardPress') {
          const taskActionKeyboardPress: ExecutionTaskActionApply<PlanningActionParamInputOrKeyPress> = {
            type: 'Action',
            subType: 'KeyboardPress',
            param: plan.param,
            executor: async (taskParam) => {
              assert(taskParam.value, 'No key to press');
              await this.page.keyboard.press(taskParam.value);
            },
          };
          return taskActionKeyboardPress;
        } else if (plan.type === 'Tap') {
          const taskActionTap: ExecutionTaskActionApply<PlanningActionParamTap> = {
            type: 'Action',
            subType: 'Tap',
            executor: async (param, { element }) => {
              assert(element, 'Element not found, cannot tap');
              await this.page.mouse.click(element.center[0], element.center[1]);
            },
          };
          return taskActionTap;
        } else if (plan.type === 'Hover') {
          const taskActionHover: ExecutionTaskActionApply<PlanningActionParamHover> = {
            type: 'Action',
            subType: 'Hover',
            executor: async (param, { element }) => {
              // console.log('executor args', param, element);
              assert(element, 'Element not found, cannot hover');
              await this.page.mouse.move(element.center[0], element.center[1]);
            },
          };
          return taskActionHover;
        } else if (plan.type === 'Scroll') {
          const taskActionScroll: ExecutionTaskActionApply<PlanningActionParamScroll> = {
            type: 'Action',
            subType: 'Scroll',
            param: plan.param,
            executor: async (taskParam) => {
              const scrollToEventName = taskParam.scrollType;
              const innerHeight = await this.page.evaluate(() => window.innerHeight);

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
                  console.error('Unknown scroll event type:', scrollToEventName);
              }
            },
          };
          return taskActionScroll;
        } else if (plan.type === 'Error') {
          throw new Error(`Got a task plan with type Error: ${plan.thought}`);
        } else {
          throw new Error(`Unknown or Unsupported task type: ${plan.type}`);
        }
      })
      .map((task: ExecutionTaskApply) => {
        return this.wrapExecutorWithScreenshot(task);
      });

    return tasks;
  }

  async action(userPrompt: string /* , actionInfo?: { actionType?: EventActions[number]['action'] } */) {
    this.executor.description = userPrompt;
    const pageContext = await this.insight.contextRetrieverFn();

    let plans: PlanningAction[] = [];
    const planningTask: ExecutionTaskPlanningApply = {
      type: 'Planning',
      param: {
        userPrompt,
      },
      async executor(param) {
        const planResult = await plan(pageContext, param.userPrompt);
        assert(planResult.plans.length > 0, 'No plans found');
        // eslint-disable-next-line prefer-destructuring
        plans = planResult.plans;
        return {
          output: planResult,
        };
      },
    };

    try {
      // plan
      await this.executor.append(this.wrapExecutorWithScreenshot(planningTask));
      await this.executor.flush();
      this.actionDump = this.executor.dump();

      // append tasks
      const executables = await this.convertPlanToExecutable(plans);
      await this.executor.append(executables);

      // flush actions
      await this.executor.flush();
      this.actionDump = this.executor.dump();

      assert(
        this.executor.status !== 'error',
        `failed to execute tasks: ${this.executor.status}, msg: ${this.executor.errorMsg || ''}`,
      );
    } catch (e: any) {
      // keep the dump before throwing
      this.actionDump = this.executor.dump();
      const err = new Error(e.message, { cause: e });
      throw err;
    }
  }

  async query(demand: InsightExtractParam) {
    this.executor.description = JSON.stringify(demand);
    let data: any;
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
        data = await this.insight.extract<any>(param.dataDemand);
        return {
          output: data,
          log: { dump: insightDump },
        };
      },
    };
    try {
      await this.executor.append(this.wrapExecutorWithScreenshot(queryTask));
      await this.executor.flush();
      this.actionDump = this.executor.dump();
    } catch (e: any) {
      // keep the dump before throwing
      this.actionDump = this.executor.dump();
      const err = new Error(e.message, { cause: e });
      throw err;
    }
    return data;
  }
}
