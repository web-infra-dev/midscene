import type { AndroidDevicePage, WebPage } from '@/common/page';
import type { PuppeteerWebPage } from '@/puppeteer';
import {
  type AIUsageInfo,
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
  type InsightAssertionResponse,
  type InsightDump,
  type InsightExtractOption,
  type InsightExtractParam,
  type LocateResultElement,
  type MidsceneYamlFlowItem,
  type PageType,
  type PlanningAIResponse,
  type PlanningAction,
  type PlanningActionParamAndroidLongPress,
  type PlanningActionParamAndroidPull,
  type PlanningActionParamAssert,
  type PlanningActionParamError,
  type PlanningActionParamHover,
  type PlanningActionParamInputOrKeyPress,
  type PlanningActionParamScroll,
  type PlanningActionParamSleep,
  type PlanningActionParamTap,
  type PlanningActionParamWaitFor,
  type TMultimodalPrompt,
  type TUserPrompt,
  plan,
} from '@midscene/core';
import {
  type ChatCompletionMessageParam,
  elementByPositionWithElementInfo,
  resizeImageForUiTars,
  vlmPlanning,
} from '@midscene/core/ai-model';
import { sleep } from '@midscene/core/utils';
import { NodeType } from '@midscene/shared/constants';
import {
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  getAIConfigInNumber,
} from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { WebElementInfo } from '../web-element';
import type { TaskCache } from './task-cache';
import { getKeyCommands, taskTitleStr } from './ui-utils';
import {
  type WebUIContext,
  matchElementFromCache,
  matchElementFromPlan,
  parsePrompt,
} from './utils';

interface ExecutionResult<OutputType = any> {
  output: OutputType;
  executor: Executor;
}

const debug = getDebug('page-task-executor');
const defaultReplanningCycleLimit = 10;

const isAndroidPage = (page: WebPage): page is AndroidDevicePage => {
  return page.pageType === 'android';
};

export class PageTaskExecutor {
  page: WebPage;

  insight: Insight<WebElementInfo, WebUIContext>;

  taskCache?: TaskCache;

  conversationHistory: ChatCompletionMessageParam[] = [];

  onTaskStartCallback?: ExecutionTaskProgressOptions['onTaskStart'];

  constructor(
    page: WebPage,
    insight: Insight<WebElementInfo, WebUIContext>,
    opts: {
      taskCache?: TaskCache;
      onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];
    },
  ) {
    this.page = page;
    this.insight = insight;

    this.taskCache = opts.taskCache;

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

  private async getElementXpath(
    pageContext: WebUIContext,
    element: LocateResultElement,
  ): Promise<string[] | undefined> {
    let elementId = element?.id;
    if (element?.isOrderSensitive !== undefined) {
      const xpaths = await this.page.getXpathsByPoint(
        {
          left: element.center[0],
          top: element.center[1],
        },
        element?.isOrderSensitive,
      );

      return xpaths;
    }

    // find the nearest xpath for the element
    if (element?.attributes?.nodeType === NodeType.POSITION) {
      await this.insight.contextRetrieverFn('locate');
      const info = elementByPositionWithElementInfo(
        pageContext.tree,
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
      const result = await this.page.getXpathsById(elementId);
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

  public async convertPlanToExecutable(
    plans: PlanningAction[],
    opts?: {
      cacheable?: boolean;
    },
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
          param: plan.locate
            ? {
                ...plan.locate,
                cacheable: opts?.cacheable,
              }
            : undefined,
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
            task.pageContext = pageContext;

            const recordItem: ExecutionRecorderItem = {
              type: 'screenshot',
              ts: shotTime,
              screenshot: pageContext.screenshotBase64,
              timing: 'before Insight',
            };
            task.recorder = [recordItem];

            // try matching xpath
            const elementFromXpath = param.xpath
              ? await this.page.getElementInfoByXpath(param.xpath)
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
                ? matchElementFromPlan(param, pageContext.tree)
                : undefined;
            const planHitFlag = !!elementFromPlan;

            // try ai locate
            const elementFromAiLocate =
              !userExpectedPathHitFlag && !cacheHitFlag && !planHitFlag
                ? (
                    await this.insight.locate(param, {
                      // fallback to ai locate
                      context: pageContext,
                    })
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
                pageContext,
                element,
              );
              if (elementXpaths?.length) {
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

            return {
              output: {
                element,
              },
              pageContext,
              hitBy,
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
            const shotTime = Date.now();
            const pageContext = await this.insight.contextRetrieverFn('assert');
            task.pageContext = pageContext;

            const recordItem: ExecutionRecorderItem = {
              type: 'screenshot',
              ts: shotTime,
              screenshot: pageContext.screenshotBase64,
              timing: 'before Insight',
            };
            task.recorder = [recordItem];

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

              task.error = new Error(assertion.thought);
            }

            return {
              output: assertion,
              pageContext,
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
                await this.page.clearInput(element as unknown as ElementInfo);

                if (!taskParam || !taskParam.value) {
                  return;
                }
              }

              await this.page.keyboard.type(taskParam.value, {
                autoDismissKeyboard: taskParam.autoDismissKeyboard,
              });
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
      } else if (plan.type === 'RightClick') {
        const taskActionRightClick: ExecutionTaskActionApply<PlanningActionParamTap> =
          {
            type: 'Action',
            subType: 'RightClick',
            thought: plan.thought,
            locate: plan.locate,
            executor: async (param, { element }) => {
              assert(element, 'Element not found, cannot right click');
              await this.page.mouse.click(
                element.center[0],
                element.center[1],
                { button: 'right' },
              );
            },
          };
        tasks.push(taskActionRightClick);
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
      } else if (plan.type === 'AndroidLongPress') {
        const taskActionAndroidLongPress: ExecutionTaskActionApply<PlanningActionParamAndroidLongPress> =
          {
            type: 'Action',
            subType: 'AndroidLongPress',
            param: plan.param as PlanningActionParamAndroidLongPress,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (param) => {
              assert(
                isAndroidPage(this.page),
                'Cannot use long press on non-Android devices',
              );
              const { x, y, duration } = param;
              await this.page.longPress(x, y, duration);
            },
          };
        tasks.push(taskActionAndroidLongPress);
      } else if (plan.type === 'AndroidPull') {
        const taskActionAndroidPull: ExecutionTaskActionApply<PlanningActionParamAndroidPull> =
          {
            type: 'Action',
            subType: 'AndroidPull',
            param: plan.param as PlanningActionParamAndroidPull,
            thought: plan.thought,
            locate: plan.locate,
            executor: async (param) => {
              assert(
                isAndroidPage(this.page),
                'Cannot use pull action on non-Android devices',
              );
              const { direction, startPoint, distance, duration } = param;

              const convertedStartPoint = startPoint
                ? { left: startPoint.x, top: startPoint.y }
                : undefined;

              if (direction === 'down') {
                await this.page.pullDown(
                  convertedStartPoint,
                  distance,
                  duration,
                );
              } else if (direction === 'up') {
                await this.page.pullUp(convertedStartPoint, distance, duration);
              } else {
                throw new Error(`Unknown pull direction: ${direction}`);
              }
            },
          };
        tasks.push(taskActionAndroidPull);
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

  private async setupPlanningContext(executorContext: ExecutorContext) {
    const shotTime = Date.now();
    const pageContext = await this.insight.contextRetrieverFn('locate');
    const recordItem: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: shotTime,
      screenshot: pageContext.screenshotBase64,
      timing: 'before Planning',
    };

    executorContext.task.recorder = [recordItem];
    (executorContext.task as ExecutionTaskPlanning).pageContext = pageContext;

    return {
      pageContext,
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
        };
      },
    };

    await taskExecutor.append(task);
    await taskExecutor.flush();

    return {
      executor: taskExecutor,
    };
  }

  private planningTaskFromPrompt(
    userInstruction: string,
    log?: string,
    actionContext?: string,
  ) {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'Plan',
      locate: null,
      param: {
        userInstruction,
        log,
      },
      executor: async (param, executorContext) => {
        const startTime = Date.now();
        const { pageContext } =
          await this.setupPlanningContext(executorContext);

        const planResult = await plan(param.userInstruction, {
          context: pageContext,
          log: param.log,
          actionContext,
          pageType: this.page.pageType as PageType,
        });

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
                // thought is prompt created by ai, always a string
                thought: planningAction.locate.prompt as string,
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
            error
              ? `Failed to plan: ${error}`
              : planParsingError || 'No plan found',
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
          pageContext,
        };
      },
    };

    return task;
  }

  private planningTaskToGoal(userInstruction: string) {
    const task: ExecutionTaskPlanningApply = {
      type: 'Planning',
      subType: 'Plan',
      locate: null,
      param: {
        userInstruction,
      },
      executor: async (param, executorContext) => {
        const { pageContext } =
          await this.setupPlanningContext(executorContext);

        const imagePayload = await resizeImageForUiTars(
          pageContext.screenshotBase64,
          pageContext.size,
        );

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
        const planResult: {
          actions: PlanningAction<any>[];
          action_summary: string;
          usage?: AIUsageInfo;
          yamlFlow?: MidsceneYamlFlowItem[];
          rawResponse?: string;
        } = await vlmPlanning({
          userInstruction: param.userInstruction,
          conversationHistory: this.conversationHistory,
          size: pageContext.size,
        });

        const { actions, action_summary, usage } = planResult;
        executorContext.task.log = {
          ...(executorContext.task.log || {}),
          rawResponse: planResult.rawResponse,
        };
        executorContext.task.usage = usage;
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
            yamlFlow: planResult.yamlFlow,
          },
          cache: {
            hit: false,
          },
        };
      },
    };

    return task;
  }

  async runPlans(
    title: string,
    plans: PlanningAction[],
    opts?: {
      cacheable?: boolean;
    },
  ): Promise<ExecutionResult> {
    const taskExecutor = new Executor(title, {
      onTaskStart: this.onTaskStartCallback,
    });
    const { tasks } = await this.convertPlanToExecutable(plans, opts);
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
    opts?: {
      cacheable?: boolean;
    },
  ): Promise<
    ExecutionResult<
      | {
          yamlFlow?: MidsceneYamlFlowItem[]; // for cache use
        }
      | undefined
    >
  > {
    const taskExecutor = new Executor(taskTitleStr('Action', userPrompt), {
      onTaskStart: this.onTaskStartCallback,
    });

    let planningTask: ExecutionTaskPlanningApply | null =
      this.planningTaskFromPrompt(userPrompt, undefined, actionContext);
    let replanCount = 0;
    const logList: string[] = [];

    const yamlFlow: MidsceneYamlFlowItem[] = [];
    const replanningCycleLimit =
      getAIConfigInNumber(MIDSCENE_REPLANNING_CYCLE_LIMIT) ||
      defaultReplanningCycleLimit;
    while (planningTask) {
      if (replanCount > replanningCycleLimit) {
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
      yamlFlow.push(...(planResult.yamlFlow || []));

      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(plans, opts);
        taskExecutor.append(executables.tasks);
      } catch (error) {
        return this.appendErrorPlan(
          taskExecutor,
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }

      await taskExecutor.flush();
      if (taskExecutor.isInErrorState()) {
        return {
          output: undefined,
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
        logList.length > 0 ? `- ${logList.join('\n- ')}` : undefined,
        actionContext,
      );
      replanCount++;
    }

    return {
      output: {
        yamlFlow,
      },
      executor: taskExecutor,
    };
  }

  async actionToGoal(
    userPrompt: string,
    opts?: {
      cacheable?: boolean;
    },
  ): Promise<
    ExecutionResult<
      | {
          yamlFlow?: MidsceneYamlFlowItem[]; // for cache use
        }
      | undefined
    >
  > {
    const taskExecutor = new Executor(taskTitleStr('Action', userPrompt), {
      onTaskStart: this.onTaskStartCallback,
    });
    this.conversationHistory = [];
    const isCompleted = false;
    let currentActionNumber = 0;
    const maxActionNumber = 40;

    const yamlFlow: MidsceneYamlFlowItem[] = [];
    while (!isCompleted && currentActionNumber < maxActionNumber) {
      currentActionNumber++;
      const planningTask: ExecutionTaskPlanningApply =
        this.planningTaskToGoal(userPrompt);
      await taskExecutor.append(planningTask);
      const output = await taskExecutor.flush();
      if (taskExecutor.isInErrorState()) {
        return {
          output: undefined,
          executor: taskExecutor,
        };
      }
      const plans = output.actions;
      yamlFlow.push(...(output.yamlFlow || []));
      let executables: Awaited<ReturnType<typeof this.convertPlanToExecutable>>;
      try {
        executables = await this.convertPlanToExecutable(plans, opts);
        taskExecutor.append(executables.tasks);
      } catch (error) {
        return this.appendErrorPlan(
          taskExecutor,
          `Error converting plans to executable tasks: ${error}, plans: ${JSON.stringify(
            plans,
          )}`,
        );
      }

      await taskExecutor.flush();

      if (taskExecutor.isInErrorState()) {
        return {
          output: undefined,
          executor: taskExecutor,
        };
      }

      if (plans[0].type === 'Finished') {
        break;
      }
    }
    return {
      output: {
        yamlFlow,
      },
      executor: taskExecutor,
    };
  }

  private async createTypeQueryTask<T>(
    type: 'Query' | 'Boolean' | 'Number' | 'String',
    demand: InsightExtractParam,
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

    const queryTask: ExecutionTaskInsightQueryApply = {
      type: 'Insight',
      subType: type,
      locate: null,
      param: {
        // TODO: display image thumbnail in report
        dataDemand: multimodalPrompt
          ? ({
              demand,
              multimodalPrompt,
            } as never)
          : demand, // for user param presentation in report right sidebar
      },
      executor: async (param) => {
        let insightDump: InsightDump | undefined;
        const dumpCollector: DumpSubscriber = (dump) => {
          insightDump = dump;
        };
        this.insight.onceDumpUpdatedFn = dumpCollector;

        const ifTypeRestricted = type !== 'Query';
        let demandInput = demand;
        if (ifTypeRestricted) {
          demandInput = {
            result: `${type}, ${demand}`,
          };
        }

        const { data, usage } = await this.insight.extract<any>(
          demandInput,
          opt,
          multimodalPrompt,
        );

        let outputResult = data;
        if (ifTypeRestricted) {
          assert(data?.result !== undefined, 'No result in query data');
          outputResult = (data as any).result;
        }

        return {
          output: outputResult,
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

  async query(
    demand: InsightExtractParam,
    opt?: InsightExtractOption,
  ): Promise<ExecutionResult> {
    return this.createTypeQueryTask('Query', demand, opt);
  }

  async boolean(
    prompt: TUserPrompt,
    opt?: InsightExtractOption,
  ): Promise<ExecutionResult<boolean>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    return this.createTypeQueryTask<boolean>(
      'Boolean',
      textPrompt,
      opt,
      multimodalPrompt,
    );
  }

  async number(
    prompt: TUserPrompt,
    opt?: InsightExtractOption,
  ): Promise<ExecutionResult<number>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    return this.createTypeQueryTask<number>(
      'Number',
      textPrompt,
      opt,
      multimodalPrompt,
    );
  }

  async string(
    prompt: TUserPrompt,
    opt?: InsightExtractOption,
  ): Promise<ExecutionResult<string>> {
    const { textPrompt, multimodalPrompt } = parsePrompt(prompt);
    return this.createTypeQueryTask<string>(
      'String',
      textPrompt,
      opt,
      multimodalPrompt,
    );
  }

  async assert(
    assertion: TUserPrompt,
  ): Promise<ExecutionResult<InsightAssertionResponse>> {
    const description = `assert: ${typeof assertion === 'string' ? assertion : assertion.prompt}`;
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
