import type { AndroidDevicePage, WebPage } from '@/common/page';
import type { PuppeteerWebPage } from '@/puppeteer';
import {
  type AIUsageInfo,
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
  type PageType,
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
import { UITarsModelVersion } from '@midscene/shared/env';
import { uiTarsModelVersion } from '@midscene/shared/env';
import { vlLocateMode } from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  imageInfo,
  imageInfoOfBase64,
  resizeImgBase64,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { WebElementInfo } from '../web-element';
import { TaskCache } from './task-cache';
import { getKeyCommands, taskTitleStr } from './ui-utils';
import type { WebUIContext } from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  executor: Executor;
}

const debug = getDebug('page-task-executor');

const replanningCountLimit = 10;

const isAndroidPage = (page: WebPage): page is AndroidDevicePage => {
  return page.pageType === 'android';
};

export class PageTaskExecutor {
  page: WebPage;

  insight: Insight<WebElementInfo, WebUIContext>;

  taskCache: TaskCache;

  conversationHistory: ChatCompletionMessageParam[] = [];

  onTaskStartCallback?: ExecutionTaskProgressOptions['onTaskStart'];

  constructor(
    page: WebPage,
    insight: Insight<WebElementInfo, WebUIContext>,
    opts: {
      cacheId: string | undefined;
      onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];
    },
  ) {
    this.page = page;
    this.insight = insight;

    this.taskCache = new TaskCache({
      cacheId: opts?.cacheId,
    });

    this.onTaskStartCallback = opts?.onTaskStart;
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
                  await (this.page as PuppeteerWebPage).waitUntilNetworkIdle();
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
        if (
          plan.locate === null ||
          plan.locate?.id === null ||
          plan.locate?.id === 'null'
        ) {
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
            assert(
              param?.prompt || param?.id || param?.bbox,
              'No prompt or id or position or bbox to locate',
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
            const pageContext = await this.insight.contextRetrieverFn('locate');
            const recordItem: ExecutionRecorderItem = {
              type: 'screenshot',
              ts: shotTime,
              screenshot: pageContext.screenshotBase64,
              timing: 'before locate',
            };
            task.recorder = [recordItem];

            const cachePrompt = param.prompt;
            const locateCache = cacheGroup?.matchCache(
              pageContext,
              'locate',
              cachePrompt,
            );
            const idInCache = locateCache?.elements?.[0]?.id;
            let cacheHitFlag = false;

            let quickAnswerId = param?.id;
            if (!quickAnswerId && idInCache) {
              quickAnswerId = idInCache;
            }

            const quickAnswer = {
              id: quickAnswerId,
              bbox: param?.bbox,
            };
            const startTime = Date.now();
            const { element } = await this.insight.locate(param, {
              quickAnswer,
            });
            const aiCost = Date.now() - startTime;

            if (element && element.id === quickAnswerId && idInCache) {
              cacheHitFlag = true;
            }

            if (element) {
              cacheGroup?.saveCache({
                type: 'locate',
                pageContext: {
                  url: pageContext.url,
                  size: pageContext.size,
                },
                prompt: cachePrompt,
                response: {
                  elements: [
                    {
                      id: element.id,
                    },
                  ],
                },
                element,
              });
            }
            if (!element) {
              throw new Error(`Element not found: ${param.prompt}`);
            }

            return {
              output: {
                element,
              },
              pageContext,
              cache: {
                hit: cacheHitFlag,
              },
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
              usage: assertion.usage,
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
              const keys = getKeyCommands(taskParam.value);

              await this.page.keyboard.press(keys);
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
      } else if (plan.type === 'Drag') {
        const taskActionDrag: ExecutionTaskActionApply<{
          start_box: { x: number; y: number };
          end_box: { x: number; y: number };
        }> = {
          type: 'Action',
          subType: 'Drag',
          param: plan.param,
          thought: plan.thought,
          locate: plan.locate,
          executor: async (taskParam) => {
            assert(
              taskParam?.start_box && taskParam?.end_box,
              'No start_box or end_box to drag',
            );
            await this.page.mouse.drag(taskParam.start_box, taskParam.end_box);
          },
        };
        tasks.push(taskActionDrag);
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
                if (
                  taskParam?.direction === 'down' ||
                  !taskParam ||
                  !taskParam.direction
                ) {
                  await this.page.scrollDown(
                    taskParam?.distance || undefined,
                    startingPoint,
                  );
                } else if (taskParam.direction === 'up') {
                  await this.page.scrollUp(
                    taskParam.distance || undefined,
                    startingPoint,
                  );
                } else if (taskParam.direction === 'left') {
                  await this.page.scrollLeft(
                    taskParam.distance || undefined,
                    startingPoint,
                  );
                } else if (taskParam.direction === 'right') {
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
            thought: plan.thought || plan.param?.thought,
            locate: plan.locate,
            executor: async () => {
              throw new Error(
                plan?.thought || plan.param?.thought || 'error without thought',
              );
            },
          };
        tasks.push(taskActionError);
      } else if (plan.type === 'ExpectedFalsyCondition') {
        const taskActionFalsyConditionStatement: ExecutionTaskActionApply<null> =
          {
            type: 'Action',
            subType: 'ExpectedFalsyCondition',
            param: null,
            thought: plan.param?.reason,
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
      } else if (plan.type === 'AndroidHomeButton') {
        const taskActionAndroidHomeButton: ExecutionTaskActionApply<null> = {
          type: 'Action',
          subType: 'AndroidHomeButton',
          param: null,
          thought: plan.thought,
          locate: plan.locate,
          executor: async (param) => {
            // Check if the page has back method (Android devices)
            assert(
              isAndroidPage(this.page),
              'Cannot use home button on non-Android devices',
            );
            await this.page.home();
          },
        };
        tasks.push(taskActionAndroidHomeButton);
      } else if (plan.type === 'AndroidBackButton') {
        const taskActionAndroidBackButton: ExecutionTaskActionApply<null> = {
          type: 'Action',
          subType: 'AndroidBackButton',
          param: null,
          thought: plan.thought,
          locate: plan.locate,
          executor: async (param) => {
            assert(
              isAndroidPage(this.page),
              'Cannot use back button on non-Android devices',
            );
            await this.page.back();
          },
        };
        tasks.push(taskActionAndroidBackButton);
      } else if (plan.type === 'AndroidRecentAppsButton') {
        const taskActionAndroidRecentAppsButton: ExecutionTaskActionApply<null> =
          {
            type: 'Action',
            subType: 'AndroidRecentAppsButton',
            param: null,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (param) => {
              assert(
                isAndroidPage(this.page),
                'Cannot use recent apps button on non-Android devices',
              );
              await this.page.recentApps();
            },
          };
        tasks.push(taskActionAndroidRecentAppsButton);
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
    userInstruction: string,
    cacheGroup: ReturnType<TaskCache['getCacheGroupByPrompt']>,
    log?: string,
    actionContext?: string,
  ) {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      locate: null,
      param: {
        userInstruction,
        log,
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

        const cachePrompt = `${param.userInstruction} @ ${param.log || ''}`;
        const planCache = cacheGroup.matchCache(
          pageContext,
          'plan',
          cachePrompt,
        );
        let planResult: Awaited<ReturnType<typeof plan>>;
        if (planCache) {
          if ('actions' in planCache && Array.isArray(planCache.actions)) {
            planCache.actions = planCache.actions.map((action) => {
              // remove all bbox in actions cache while using
              if (action.locate) {
                // biome-ignore lint/performance/noDelete: intended to remove bbox
                delete action.locate.bbox;
              }
              return action;
            });
          }
          planResult = planCache;
        } else {
          planResult = await plan(param.userInstruction, {
            context: pageContext,
            log: param.log,
            actionContext,
            pageType: this.page.pageType as PageType,
          });
        }

        const {
          actions,
          log,
          more_actions_needed_by_instruction,
          error,
          usage,
          rawResponse,
          sleep,
        } = planResult;

        let stopCollecting = false;
        let bboxCollected = false;
        let planParsingError = '';
        const finalActions = (actions || []).reduce<PlanningAction[]>(
          (acc, planningAction) => {
            if (stopCollecting) {
              return acc;
            }

            if (planningAction.locate) {
              // we only collect bbox once, let qwen re-locate in the following steps
              if (bboxCollected && planningAction.locate.bbox) {
                // biome-ignore lint/performance/noDelete: <explanation>
                delete planningAction.locate.bbox;
              }

              if (planningAction.locate.bbox) {
                bboxCollected = true;
              }

              acc.push({
                type: 'Locate',
                locate: planningAction.locate,
                param: null,
                thought: planningAction.locate.prompt,
              });
            } else if (
              ['Tap', 'Hover', 'Input'].includes(planningAction.type)
            ) {
              planParsingError = `invalid planning response: ${JSON.stringify(planningAction)}`;
              // should include locate but get null
              stopCollecting = true;
              return acc;
            }
            acc.push(planningAction);
            return acc;
          },
          [],
        );

        if (sleep) {
          const timeNow = Date.now();
          const timeRemaining = sleep - (timeNow - shotTime);
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
            error
              ? `Failed to plan: ${error}`
              : planParsingError || 'No plan found',
          );
        }

        cacheGroup.saveCache({
          type: 'plan',
          pageContext: {
            url: pageContext.url,
            size: pageContext.size,
          },
          prompt: cachePrompt,
          response: planResult,
        });

        return {
          output: {
            actions: finalActions,
            more_actions_needed_by_instruction,
            log,
          },
          cache: {
            hit: Boolean(planCache),
          },
          pageContext,
          recorder: [recordItem],
          usage,
          rawResponse,
        };
      },
    };

    return task;
  }

  private planningTaskToGoal(
    userInstruction: string,
    cacheGroup: ReturnType<TaskCache['getCacheGroupByPrompt']>,
  ) {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      locate: null,
      param: {
        userInstruction,
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

        let imagePayload = pageContext.screenshotBase64;
        if (
          vlLocateMode() === 'vlm-ui-tars' &&
          uiTarsModelVersion() === UITarsModelVersion.V1_5
        ) {
          const size = pageContext.size;
          // const imageInfo = await imageInfoOfBase64(imagePayload);
          debug('ui-tars-v1.5, will check image size', size);
          const currentPixels = size.width * size.height;
          const maxPixels = 16384 * 28 * 28; //
          if (currentPixels > maxPixels) {
            const resizeFactor = Math.sqrt(maxPixels / currentPixels);
            const newWidth = Math.floor(size.width * resizeFactor);
            const newHeight = Math.floor(size.height * resizeFactor);
            debug(
              'resize image',
              imageInfo,
              'new width',
              newWidth,
              'new height',
              newHeight,
            );
            imagePayload = await resizeImgBase64(imagePayload, {
              width: newWidth,
              height: newHeight,
            });
          }
        }

        this.appendConversationHistory({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imagePayload,
              },
            },
          ],
        });
        const startTime = Date.now();

        const planCache = cacheGroup.matchCache(
          pageContext,
          'ui-tars-plan',
          userInstruction,
        );
        let planResult: Awaited<ReturnType<typeof vlmPlanning>>;
        if (planCache) {
          planResult = planCache;
        } else {
          planResult = await vlmPlanning({
            userInstruction: param.userInstruction,
            conversationHistory: this.conversationHistory,
            size: pageContext.size,
          });
        }
        cacheGroup.saveCache({
          type: 'ui-tars-plan',
          pageContext: {
            url: pageContext.url,
            size: pageContext.size,
          },
          prompt: userInstruction,
          response: planResult,
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
            thought: actions[0]?.thought,
            actionType: actions[0].type,
            more_actions_needed_by_instruction: true,
            log: '',
          },
          cache: {
            hit: Boolean(planCache),
          },
          aiCost,
        };
      },
    };

    return task;
  }

  async runPlans(
    title: string,
    plans: PlanningAction[],
  ): Promise<ExecutionResult> {
    const taskExecutor = new Executor(title, {
      onTaskStart: this.onTaskStartCallback,
    });
    const cacheGroup = this.taskCache.getCacheGroupByPrompt(title);
    const { tasks } = await this.convertPlanToExecutable(plans, cacheGroup);
    await taskExecutor.append(tasks);
    const result = await taskExecutor.flush();
    return {
      output: result,
      executor: taskExecutor,
    };
  }

  async action(
    userPrompt: string,
    actionContext?: string,
  ): Promise<ExecutionResult> {
    const taskExecutor = new Executor(taskTitleStr('Action', userPrompt), {
      onTaskStart: this.onTaskStartCallback,
    });

    const cacheGroup = this.taskCache.getCacheGroupByPrompt(userPrompt);
    let planningTask: ExecutionTaskPlanningApply | null =
      this.planningTaskFromPrompt(
        userPrompt,
        cacheGroup,
        undefined,
        actionContext,
      );
    let result: any;
    let replanCount = 0;
    const logList: string[] = [];
    while (planningTask) {
      if (replanCount > replanningCountLimit) {
        const errorMsg =
          'Replanning too many times, please split the task into multiple steps';

        return this.appendErrorPlan(taskExecutor, errorMsg);
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

      const plans = planResult.actions || [];

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
      if (planResult?.log) {
        logList.push(planResult.log);
      }

      if (!planResult.more_actions_needed_by_instruction) {
        planningTask = null;
        break;
      }
      planningTask = this.planningTaskFromPrompt(
        userPrompt,
        cacheGroup,
        logList.length > 0 ? `- ${logList.join('\n- ')}` : undefined,
        actionContext,
      );
      replanCount++;
    }

    return {
      output: result,
      executor: taskExecutor,
    };
  }

  async actionToGoal(userPrompt: string) {
    const taskExecutor = new Executor(taskTitleStr('Action', userPrompt), {
      onTaskStart: this.onTaskStartCallback,
    });
    this.conversationHistory = [];
    const cacheGroup = this.taskCache.getCacheGroupByPrompt(userPrompt);
    const isCompleted = false;
    let currentActionNumber = 0;
    const maxActionNumber = 40;

    while (!isCompleted && currentActionNumber < maxActionNumber) {
      currentActionNumber++;
      const planningTask: ExecutionTaskPlanningApply = this.planningTaskToGoal(
        userPrompt,
        cacheGroup,
      );
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

  async query(demand: InsightExtractParam): Promise<ExecutionResult> {
    const description =
      typeof demand === 'string' ? demand : JSON.stringify(demand);
    const taskExecutor = new Executor(taskTitleStr('Query', description), {
      onTaskStart: this.onTaskStartCallback,
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
        const { data, usage } = await this.insight.extract<any>(
          param.dataDemand,
        );
        return {
          output: data,
          log: { dump: insightDump },
          usage,
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
    const taskExecutor = new Executor(taskTitleStr('Assert', description), {
      onTaskStart: this.onTaskStartCallback,
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
    const taskExecutor = new Executor(taskTitleStr('WaitFor', description), {
      onTaskStart: this.onTaskStartCallback,
    });
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

      errorThought =
        output?.thought ||
        `unknown error when waiting for assertion: ${assertion}`;
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
