import { findAllMidsceneLocatorField, parseActionParam } from '@/ai-model';
import type { AbstractInterface } from '@/device';
import type Insight from '@/insight';
import type {
  DetailedLocateParam,
  ElementCacheFeature,
  ExecutionTaskActionApply,
  ExecutionTaskApply,
  ExecutionTaskHitBy,
  ExecutionTaskInsightLocateApply,
  InsightDump,
  LocateResultElement,
  LocateResultWithDump,
  PlanningAction,
  PlanningActionParamError,
  PlanningActionParamSleep,
  PlanningLocateParam,
  Rect,
} from '@/types';
import { InsightError } from '@/types';
import { sleep } from '@/utils';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TaskCache } from './task-cache';
import { matchElementFromCache, matchElementFromPlan } from './utils';

const debug = getDebug('agent:task-builder');

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

interface TaskBuilderDeps {
  interfaceInstance: AbstractInterface;
  insight: Insight;
  taskCache?: TaskCache;
}

interface BuildOptions {
  cacheable?: boolean;
}

export class TaskBuilder {
  private readonly interface: AbstractInterface;

  private readonly insight: Insight;

  private readonly taskCache?: TaskCache;

  constructor({ interfaceInstance, insight, taskCache }: TaskBuilderDeps) {
    this.interface = interfaceInstance;
    this.insight = insight;
    this.taskCache = taskCache;
  }

  public async build(
    plans: PlanningAction[],
    modelConfig: IModelConfig,
    options?: BuildOptions,
  ): Promise<{ tasks: ExecutionTaskApply[] }> {
    const tasks: ExecutionTaskApply[] = [];
    const cacheable = options?.cacheable;

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

      if (cacheable !== undefined) {
        detailedLocateParam = {
          ...detailedLocateParam,
          cacheable,
        };
      }

      const taskFind: ExecutionTaskInsightLocateApply = {
        type: 'Insight',
        subType: 'Locate',
        param: detailedLocateParam,
        thought: plan.thought,
        executor: async (param, taskContext) => {
          const { task } = taskContext;
          let { uiContext } = taskContext;

          assert(
            param?.prompt || param?.id || param?.bbox,
            `No prompt or id or position or bbox to locate, param=${JSON.stringify(
              param,
            )}`,
          );

          if (!uiContext) {
            uiContext = await this.insight.contextRetrieverFn();
          }

          assert(uiContext, 'uiContext is required for Insight task');

          let locateDump: InsightDump | undefined;
          let locateResult: LocateResultWithDump | undefined;

          const applyDump = (dump?: InsightDump) => {
            if (!dump) {
              return;
            }
            locateDump = dump;
            task.log = {
              dump,
            };
            task.usage = dump.taskInfo?.usage;
            if (dump.taskInfo?.searchAreaUsage) {
              task.searchAreaUsage = dump.taskInfo.searchAreaUsage;
            }
          };

          // from xpath
          let elementFromXpath: Rect | undefined;
          if (param.xpath && this.interface.rectMatchesCacheFeature) {
            elementFromXpath = await this.interface.rectMatchesCacheFeature({
              xpaths: [param.xpath],
            });
          }
          const userExpectedPathHitFlag = !!elementFromXpath;

          const cachePrompt = param.prompt;
          const locateCacheRecord =
            this.taskCache?.matchLocateCache(cachePrompt);
          const cacheEntry = locateCacheRecord?.cacheContent?.cache;

          const elementFromCache = userExpectedPathHitFlag
            ? null
            : await matchElementFromCache(
                {
                  taskCache: this.taskCache,
                  interfaceInstance: this.interface,
                },
                cacheEntry,
                cachePrompt,
                param.cacheable,
              );
          const cacheHitFlag = !!elementFromCache;

          const elementFromPlan =
            !userExpectedPathHitFlag && !cacheHitFlag
              ? matchElementFromPlan(param, uiContext.tree)
              : undefined;
          const planHitFlag = !!elementFromPlan;

          let elementFromAiLocate: LocateResultElement | null | undefined;
          if (!userExpectedPathHitFlag && !cacheHitFlag && !planHitFlag) {
            try {
              locateResult = await this.insight.locate(
                param,
                {
                  context: uiContext,
                },
                modelConfig,
              );
              applyDump(locateResult.dump);
              elementFromAiLocate = locateResult.element;
            } catch (error) {
              if (error instanceof InsightError) {
                applyDump(error.dump);
              }
              throw error;
            }
          }
          const aiLocateHitFlag = !!elementFromAiLocate;

          const element =
            elementFromXpath ||
            elementFromCache ||
            elementFromPlan ||
            elementFromAiLocate;

          let currentCacheEntry: ElementCacheFeature | undefined;
          if (
            element &&
            this.taskCache &&
            !cacheHitFlag &&
            param?.cacheable !== false
          ) {
            if (this.interface.cacheFeatureForRect) {
              try {
                const feature = await this.interface.cacheFeatureForRect(
                  element.rect,
                  element.isOrderSensitive !== undefined
                    ? { _orderSensitive: element.isOrderSensitive }
                    : undefined,
                );
                if (feature && Object.keys(feature).length > 0) {
                  debug(
                    'update cache, prompt: %s, cache: %o',
                    cachePrompt,
                    feature,
                  );
                  currentCacheEntry = feature;
                  this.taskCache.updateOrAppendCacheRecord(
                    {
                      type: 'locate',
                      prompt: cachePrompt,
                      cache: feature,
                    },
                    locateCacheRecord,
                  );
                } else {
                  debug(
                    'no cache data returned, skip cache update, prompt: %s',
                    cachePrompt,
                  );
                }
              } catch (error) {
                debug('cacheFeatureForRect failed: %s', error);
              }
            } else {
              debug('cacheFeatureForRect is not supported, skip cache update');
            }
          }

          if (!element) {
            if (locateDump) {
              throw new InsightError(
                `Element not found: ${param.prompt}`,
                locateDump,
              );
            }
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
                cacheEntry,
                cacheToSave: currentCacheEntry,
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

          onResult?.(element);

          return {
            output: {
              element,
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
        if (!plan.locate || plan.locate === null) {
          debug('Locate action with id is null, will be ignored', plan);
          continue;
        }
        const taskLocate = taskForLocatePlan(plan, plan.locate);
        tasks.push(taskLocate);
        continue;
      }

      if (plan.type === 'Error') {
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
        continue;
      }

      if (plan.type === 'Finished') {
        const taskActionFinished: ExecutionTaskActionApply<null> = {
          type: 'Action',
          subType: 'Finished',
          param: null,
          thought: plan.thought,
          locate: plan.locate,
          executor: async () => {},
        };
        tasks.push(taskActionFinished);
        continue;
      }

      if (plan.type === 'Sleep') {
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
        continue;
      }

      const planType = plan.type;
      const actionSpace = await this.interface.actionSpace();
      const action = actionSpace.find((item) => item.name === planType);
      const param = plan.param;

      if (!action) {
        throw new Error(`Action type '${planType}' not found`);
      }

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
        executor: async (param, taskContext) => {
          debug(
            'executing action',
            planType,
            param,
            `taskContext.element.center: ${taskContext.element?.center}`,
          );

          const uiContext = taskContext.uiContext;
          assert(uiContext, 'uiContext is required for Action task');

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

          if (action.paramSchema) {
            try {
              param = parseActionParam(param, action.paramSchema);
            } catch (error: any) {
              throw new Error(
                `Invalid parameters for action ${action.name}: ${error.message}\nParameters: ${JSON.stringify(param)}`,
                { cause: error },
              );
            }
          }

          debug('calling action', action.name);
          const actionFn = action.call.bind(this.interface);
          await actionFn(param, taskContext);
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

    return {
      tasks,
    };
  }
}
