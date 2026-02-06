import { findAllMidsceneLocatorField, parseActionParam } from '@/ai-model';
import type { AbstractInterface } from '@/device';
import type Service from '@/service';
import type {
  DetailedLocateParam,
  DeviceAction,
  ElementCacheFeature,
  ExecutionTaskActionApply,
  ExecutionTaskApply,
  ExecutionTaskHitBy,
  ExecutionTaskPlanningLocateApply,
  LocateResultElement,
  LocateResultWithDump,
  PlanningAction,
  PlanningLocateParam,
  Rect,
  ServiceDump,
} from '@/types';
import { ServiceError } from '@/types';
import { sleep } from '@/utils';
import type { IModelConfig } from '@midscene/shared/env';
import { generateElementByRect } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TaskCache } from './task-cache';
import {
  ifPlanLocateParamIsBbox,
  matchElementFromCache,
  matchElementFromPlan,
} from './utils';

const debug = getDebug('agent:task-builder');

/**
 * Check if a cache object is non-empty
 */
function hasNonEmptyCache(cache: unknown): boolean {
  return (
    cache !== null &&
    cache !== undefined &&
    typeof cache === 'object' &&
    Object.keys(cache).length > 0
  );
}

/**
 * Transform coordinates from screenshot coordinate system to logical coordinate system.
 * When shrunkShotToLogicalRatio > 1, the screenshot is larger than logical size,
 * so we need to divide coordinates by shrunkShotToLogicalRatio.
 *
 * @param element - The locate result element with coordinates in screenshot space
 * @param shrunkShotToLogicalRatio - The ratio of screenshot size to logical size
 * @returns A new element with coordinates transformed to logical space
 */
function transformCoordinatesToLogical(
  element: LocateResultElement,
  shrunkShotToLogicalRatio: number,
): LocateResultElement {
  if (shrunkShotToLogicalRatio === 1) {
    return element;
  }

  return {
    ...element,
    center: [
      Math.round(element.center[0] / shrunkShotToLogicalRatio),
      Math.round(element.center[1] / shrunkShotToLogicalRatio),
    ],
    rect: {
      ...element.rect,
      left: Math.round(element.rect.left / shrunkShotToLogicalRatio),
      top: Math.round(element.rect.top / shrunkShotToLogicalRatio),
      width: Math.round(element.rect.width / shrunkShotToLogicalRatio),
      height: Math.round(element.rect.height / shrunkShotToLogicalRatio),
    },
  };
}

export function locatePlanForLocate(param: string | DetailedLocateParam) {
  const locate = typeof param === 'string' ? { prompt: param } : param;
  const locatePlan: PlanningAction<PlanningLocateParam> = {
    type: 'Locate',
    param: locate,
    thought: '',
  };
  return locatePlan;
}

interface TaskBuilderDeps {
  interfaceInstance: AbstractInterface;
  service: Service;
  taskCache?: TaskCache;
  actionSpace: DeviceAction[];
  waitAfterAction?: number;
}

interface BuildOptions {
  cacheable?: boolean;
  subTask?: boolean;
}

interface PlanBuildContext {
  tasks: ExecutionTaskApply[];
  modelConfigForPlanning: IModelConfig;
  modelConfigForDefaultIntent: IModelConfig;
  cacheable?: boolean;
  subTask: boolean;
}

export class TaskBuilder {
  private readonly interface: AbstractInterface;

  private readonly service: Service;

  private readonly taskCache?: TaskCache;

  private readonly actionSpace: DeviceAction[];

  private readonly waitAfterAction?: number;

  constructor({
    interfaceInstance,
    service,
    taskCache,
    actionSpace,
    waitAfterAction,
  }: TaskBuilderDeps) {
    this.interface = interfaceInstance;
    this.service = service;
    this.taskCache = taskCache;
    this.actionSpace = actionSpace;
    this.waitAfterAction = waitAfterAction;
  }

  public async build(
    plans: PlanningAction[],
    modelConfigForPlanning: IModelConfig,
    modelConfigForDefaultIntent: IModelConfig,
    options?: BuildOptions,
  ): Promise<{ tasks: ExecutionTaskApply[] }> {
    const tasks: ExecutionTaskApply[] = [];
    const cacheable = options?.cacheable;

    const context: PlanBuildContext = {
      tasks,
      modelConfigForPlanning,
      modelConfigForDefaultIntent,
      cacheable,
      subTask: !!options?.subTask,
    };

    type PlanHandler = (plan: PlanningAction) => Promise<void> | void;

    const planHandlers = new Map<string, PlanHandler>([
      [
        'Locate',
        (plan) =>
          this.handleLocatePlan(
            plan as PlanningAction<PlanningLocateParam>,
            context,
          ),
      ],
      ['Finished', (plan) => this.handleFinishedPlan(plan, context)],
    ]);

    const defaultHandler: PlanHandler = (plan) =>
      this.handleActionPlan(plan, context);

    for (const plan of plans) {
      const handler = planHandlers.get(plan.type) ?? defaultHandler;
      await handler(plan);
    }

    return {
      tasks,
    };
  }

  private handleFinishedPlan(
    plan: PlanningAction,
    context: PlanBuildContext,
  ): void {
    const taskActionFinished: ExecutionTaskActionApply<null> = {
      type: 'Action Space',
      subType: 'Finished',
      param: null,
      thought: plan.thought,
      subTask: context.subTask || undefined,
      executor: async () => {},
    };
    context.tasks.push(taskActionFinished);
  }

  private async handleLocatePlan(
    plan: PlanningAction<PlanningLocateParam>,
    context: PlanBuildContext,
  ): Promise<void> {
    const taskLocate = this.createLocateTask(plan, plan.param, context);
    context.tasks.push(taskLocate);
  }

  private async handleActionPlan(
    plan: PlanningAction,
    context: PlanBuildContext,
  ): Promise<void> {
    const planType = plan.type;
    const actionSpace = this.actionSpace;
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
        // Always use createLocateTask for all locate params (including bbox)
        // This ensures cache writing happens even when bbox is available
        const locatePlan = locatePlanForLocate(param[field]);
        debug(
          'will prepend locate param for field',
          `action.type=${planType}`,
          `param=${JSON.stringify(param[field])}`,
          `locatePlan=${JSON.stringify(locatePlan)}`,
          `hasBbox=${ifPlanLocateParamIsBbox(param[field])}`,
        );
        const locateTask = this.createLocateTask(
          locatePlan,
          param[field],
          context,
          (result) => {
            param[field] = result;
          },
        );
        context.tasks.push(locateTask);
      } else {
        assert(
          !requiredLocateFields.includes(field),
          `Required locate field '${field}' is not provided for action ${planType}`,
        );
        debug(`field '${field}' is not provided for action ${planType}`);
      }
    });

    const task: ExecutionTaskApply<
      'Action Space',
      any,
      { success: boolean; action: string; param: any },
      void
    > = {
      type: 'Action Space',
      subType: planType,
      thought: plan.thought,
      param: plan.param,
      subTask: context.subTask || undefined,
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

        // Transform coordinates from screenshot space to logical space if needed
        // This is necessary when shrunkShotToLogicalRatio !== 1
        const shrunkShotToLogicalRatio = uiContext.shrunkShotToLogicalRatio;
        if (!shrunkShotToLogicalRatio) {
          throw new Error('shrunkShotToLogicalRatio is not defined');
        }
        if (shrunkShotToLogicalRatio !== 1) {
          debug(
            `Transforming coordinates for action ${action.name} with shrunkShotToLogicalRatio=${shrunkShotToLogicalRatio}`,
          );
          for (const field of locateFields) {
            if (param[field] && typeof param[field] === 'object') {
              const element = param[field] as LocateResultElement;
              if (element.center && element.rect) {
                param[field] = transformCoordinatesToLogical(
                  element,
                  shrunkShotToLogicalRatio,
                );
                debug(
                  `Transformed ${field}: center ${element.center} -> ${param[field].center}`,
                );
              }
            }
          }
        }

        debug('calling action', action.name);
        const actionFn = action.call.bind(this.interface);
        const actionResult = await actionFn(param, taskContext);
        debug('called action', action.name, 'result:', actionResult);

        const delayAfterRunner =
          action.delayAfterRunner ?? this.waitAfterAction ?? 300;
        if (delayAfterRunner > 0) {
          await sleep(delayAfterRunner);
        }

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
          output: actionResult,
        };
      },
    };

    context.tasks.push(task);
  }

  private createLocateTask(
    plan: PlanningAction<PlanningLocateParam>,
    detailedLocateParam: DetailedLocateParam | string,
    context: PlanBuildContext,
    onResult?: (result: LocateResultElement) => void,
  ): ExecutionTaskPlanningLocateApply {
    const { cacheable, modelConfigForDefaultIntent } = context;

    let locateParam = detailedLocateParam;

    if (typeof locateParam === 'string') {
      locateParam = {
        prompt: locateParam,
      };
    }

    if (cacheable !== undefined) {
      locateParam = {
        ...locateParam,
        cacheable,
      };
    }

    const taskLocator: ExecutionTaskPlanningLocateApply = {
      type: 'Planning',
      subType: 'Locate',
      subTask: context.subTask || undefined,
      param: locateParam,
      thought: plan.thought,
      executor: async (param, taskContext) => {
        const { task } = taskContext;
        let { uiContext } = taskContext;

        assert(
          param?.prompt || param?.bbox,
          `No prompt or id or position or bbox to locate, param=${JSON.stringify(
            param,
          )}`,
        );

        if (!uiContext) {
          uiContext = await this.service.contextRetrieverFn();
        }

        assert(uiContext, 'uiContext is required for Service task');

        let locateDump: ServiceDump | undefined;
        let locateResult: LocateResultWithDump | undefined;

        const applyDump = (dump?: ServiceDump) => {
          if (!dump) {
            return;
          }
          locateDump = dump;
          task.log = {
            dump,
            rawResponse: dump.taskInfo?.rawResponse,
          };
          task.usage = dump.taskInfo?.usage;
          if (dump.taskInfo?.searchAreaUsage) {
            task.searchAreaUsage = dump.taskInfo.searchAreaUsage;
          }
          if (dump.taskInfo?.reasoning_content) {
            task.reasoning_content = dump.taskInfo.reasoning_content;
          }
        };

        // from bbox (plan hit)
        const elementFromBbox = ifPlanLocateParamIsBbox(param)
          ? matchElementFromPlan(param)
          : undefined;
        const isPlanHit = !!elementFromBbox;

        // from xpath
        let rectFromXpath: Rect | undefined;
        if (
          !isPlanHit &&
          param.xpath &&
          this.interface.rectMatchesCacheFeature
        ) {
          try {
            rectFromXpath = await this.interface.rectMatchesCacheFeature({
              xpaths: [param.xpath],
            });
          } catch {
            // xpath locate failed, allow fallback to cache or AI locate
          }
        }
        const elementFromXpath = rectFromXpath
          ? generateElementByRect(
              rectFromXpath,
              typeof param.prompt === 'string'
                ? param.prompt
                : param.prompt?.prompt || '',
            )
          : undefined;
        const isXpathHit = !!elementFromXpath;

        const cachePrompt = param.prompt;
        const locateCacheRecord = this.taskCache?.matchLocateCache(cachePrompt);
        const cacheEntry = locateCacheRecord?.cacheContent?.cache;

        const elementFromCache =
          isPlanHit || isXpathHit
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
        const isCacheHit = !!elementFromCache;

        let elementFromAiLocate: LocateResultElement | null | undefined;
        if (!isXpathHit && !isCacheHit && !isPlanHit) {
          try {
            locateResult = await this.service.locate(
              param,
              {
                context: uiContext,
              },
              modelConfigForDefaultIntent,
            );
            applyDump(locateResult.dump);
            elementFromAiLocate = locateResult.element;
          } catch (error) {
            if (error instanceof ServiceError) {
              applyDump(error.dump);
            }
            throw error;
          }
        }

        const element =
          elementFromBbox ||
          elementFromXpath ||
          elementFromCache ||
          elementFromAiLocate;

        // Check if locate cache already exists (for planHitFlag case)
        const locateCacheAlreadyExists = hasNonEmptyCache(
          locateCacheRecord?.cacheContent?.cache,
        );

        let currentCacheEntry: ElementCacheFeature | undefined;
        // Write cache if:
        // 1. element found
        // 2. taskCache enabled
        // 3. not a cache hit (otherwise we'd be writing what we just read)
        // 4. not already cached for plan hit case (avoid redundant writes), OR allow update if cache validation failed
        // 5. cacheable is not explicitly false
        if (
          element &&
          this.taskCache &&
          !isCacheHit &&
          (!isPlanHit || !locateCacheAlreadyExists) &&
          param?.cacheable !== false
        ) {
          if (this.interface.cacheFeatureForPoint) {
            try {
              // Transform coordinates to logical space for cacheFeatureForPoint
              // cacheFeatureForPoint needs logical coordinates to locate elements in DOM
              // When element comes from AI (isPlanHit or elementFromAiLocate), coordinates are in screenshot space
              // When element comes from xpath, coordinates are already in logical space
              const shrunkShotToLogicalRatio =
                uiContext.shrunkShotToLogicalRatio;
              let pointForCache: [number, number] = element.center;
              if (shrunkShotToLogicalRatio && shrunkShotToLogicalRatio !== 1) {
                pointForCache = [
                  Math.round(element.center[0] / shrunkShotToLogicalRatio),
                  Math.round(element.center[1] / shrunkShotToLogicalRatio),
                ];
                debug(
                  'Transformed coordinates for cacheFeatureForPoint: %o -> %o',
                  element.center,
                  pointForCache,
                );
              }

              const feature = await this.interface.cacheFeatureForPoint(
                pointForCache,
                {
                  targetDescription:
                    typeof param.prompt === 'string'
                      ? param.prompt
                      : param.prompt?.prompt,
                  modelConfig: modelConfigForDefaultIntent,
                },
              );
              if (hasNonEmptyCache(feature)) {
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
              debug('cacheFeatureForPoint failed: %s', error);
            }
          } else {
            debug('cacheFeatureForPoint is not supported, skip cache update');
          }
        }

        if (!element) {
          if (locateDump) {
            throw new ServiceError(
              `Element not found : ${param.prompt}`,
              locateDump,
            );
          }
          throw new Error(`Element not found: ${param.prompt}`);
        }

        let hitBy: ExecutionTaskHitBy | undefined;

        if (isPlanHit) {
          hitBy = {
            from: 'Plan',
            context: {
              bbox: param.bbox,
            },
          };
        } else if (isXpathHit) {
          hitBy = {
            from: 'User expected path',
            context: {
              xpath: param.xpath,
            },
          };
        } else if (isCacheHit) {
          hitBy = {
            from: 'Cache',
            context: {
              cacheEntry,
              cacheToSave: currentCacheEntry,
            },
          };
        }

        onResult?.(element);

        return {
          output: {
            element,
          },
          hitBy,
        };
      },
    };

    return taskLocator;
  }
}
