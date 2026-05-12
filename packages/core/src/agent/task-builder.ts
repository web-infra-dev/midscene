import { findAllMidsceneLocatorField, parseActionParam } from '@/ai-model';
import type { AbstractInterface } from '@/device';
import type Service from '@/service';
import { setTimingFieldOnce } from '@/task-timing';
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
  transformLogicalElementToScreenshot,
  transformLogicalRectToScreenshotRect,
} from './utils';

const debug = getDebug('agent:task-builder');
const EXPERIMENTAL_DEEP_LOCATE_ZOOM_RATIO = 4;
const EXPERIMENTAL_DEEP_LOCATE_ZOOM_DURATION_MS = 500;
const UI_CONTEXT_CACHE_TTL_BYPASS_MS = 350;

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

function transformZoomedScreenshotElementToScreenshot(
  element: LocateResultElement,
  scale: number,
): LocateResultElement {
  if (scale === 1) {
    return element;
  }

  return {
    ...element,
    center: [
      Math.round(element.center[0] / scale),
      Math.round(element.center[1] / scale),
    ],
    rect: {
      ...element.rect,
      left: Math.round(element.rect.left / scale),
      top: Math.round(element.rect.top / scale),
      width: Math.round(element.rect.width / scale),
      height: Math.round(element.rect.height / scale),
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
  deepLocate?: boolean;
  abortSignal?: AbortSignal;
}

interface PlanBuildContext {
  tasks: ExecutionTaskApply[];
  modelConfigForPlanning: IModelConfig;
  modelConfigForDefaultIntent: IModelConfig;
  cacheable?: boolean;
  deepLocate?: boolean;
  abortSignal?: AbortSignal;
}

interface WebDeepLocateZoomState {
  centerX: number;
  centerY: number;
  startDistance: number;
  endDistance: number;
  duration: number;
}

export class TaskBuilder {
  private readonly interface: AbstractInterface;

  private readonly service: Service;

  private readonly taskCache?: TaskCache;

  private readonly actionSpace: DeviceAction[];

  private readonly waitAfterAction?: number;

  private activeWebDeepLocateZoom?: WebDeepLocateZoomState;

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

  private getWebPinchApi():
    | ((
        centerX: number,
        centerY: number,
        startDistance: number,
        endDistance: number,
        duration?: number,
      ) => Promise<void>)
    | undefined {
    const pinch = (this.interface as any).pinch;
    if (typeof pinch !== 'function') {
      return undefined;
    }
    return pinch.bind(this.interface);
  }

  private async activateWebDeepLocateZoom(
    element: LocateResultElement,
    shrunkShotToLogicalRatio: number,
  ): Promise<void> {
    const pinch = this.getWebPinchApi();
    if (!pinch || this.activeWebDeepLocateZoom) {
      return;
    }

    const { width, height } = await this.interface.size();
    const baseDistance = Math.round(Math.min(width, height) / 4);
    const logicalCenterX = Math.round(
      element.center[0] / shrunkShotToLogicalRatio,
    );
    const logicalCenterY = Math.round(
      element.center[1] / shrunkShotToLogicalRatio,
    );
    const zoomState: WebDeepLocateZoomState = {
      centerX: logicalCenterX,
      centerY: logicalCenterY,
      startDistance: baseDistance,
      endDistance: Math.round(
        baseDistance * EXPERIMENTAL_DEEP_LOCATE_ZOOM_RATIO,
      ),
      duration: EXPERIMENTAL_DEEP_LOCATE_ZOOM_DURATION_MS,
    };

    debug('activate experimental web deepLocate pinch zoom', zoomState);
    await pinch(
      zoomState.centerX,
      zoomState.centerY,
      zoomState.startDistance,
      zoomState.endDistance,
      zoomState.duration,
    );
    this.activeWebDeepLocateZoom = zoomState;
  }

  private async restoreWebDeepLocateZoom(): Promise<void> {
    const pinch = this.getWebPinchApi();
    const zoomState = this.activeWebDeepLocateZoom;
    this.activeWebDeepLocateZoom = undefined;
    if (!pinch || !zoomState) {
      return;
    }

    debug('restore experimental web deepLocate pinch zoom', zoomState);
    await pinch(
      zoomState.centerX,
      zoomState.centerY,
      zoomState.endDistance,
      zoomState.startDistance,
      zoomState.duration,
    );
  }

  private async getVisualViewportScale(): Promise<number> {
    const evaluateJavaScript = this.interface.evaluateJavaScript;
    if (
      !this.activeWebDeepLocateZoom ||
      typeof evaluateJavaScript !== 'function'
    ) {
      return 1;
    }

    const scale = (await evaluateJavaScript.call(
      this.interface,
      'window.visualViewport?.scale ?? 1',
    )) as unknown;

    return typeof scale === 'number' && Number.isFinite(scale) ? scale : 1;
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
      deepLocate: options?.deepLocate,
      abortSignal: options?.abortSignal,
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
      executor: async (param, taskContext) => {
        const timing = taskContext.task.timing;

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

        setTimingFieldOnce(timing, 'beforeInvokeActionHookStart');
        const delayBeforeRunner = action.delayBeforeRunner ?? 200;
        try {
          await Promise.all([
            (async () => {
              if (this.interface.beforeInvokeAction) {
                debug(
                  `will call "beforeInvokeAction" for interface with action name ${action.name}`,
                );
                await this.interface.beforeInvokeAction(action.name, param);
                debug(
                  `called "beforeInvokeAction" for interface with action name ${action.name}`,
                );
              }
            })(),
            delayBeforeRunner > 0
              ? sleep(delayBeforeRunner)
              : Promise.resolve(),
          ]);
        } catch (originalError: any) {
          const originalMessage =
            originalError?.message || String(originalError);
          throw new Error(
            `error in running beforeInvokeAction for ${action.name}: ${originalMessage}`,
            { cause: originalError },
          );
        }
        setTimingFieldOnce(timing, 'beforeInvokeActionHookEnd');

        const { shrunkShotToLogicalRatio } = uiContext;
        if (shrunkShotToLogicalRatio === undefined) {
          throw new Error(
            'shrunkShotToLogicalRatio is not defined in Action task',
          );
        }

        if (action.paramSchema) {
          try {
            param = parseActionParam(param, action.paramSchema, {
              shrunkShotToLogicalRatio,
            });
          } catch (error: any) {
            throw new Error(
              `Invalid parameters for action ${action.name}: ${error.message}\nParameters: ${JSON.stringify(param)}`,
              { cause: error },
            );
          }
        }

        let actionResult;
        let pendingError: unknown;
        let restoreError: unknown;

        try {
          setTimingFieldOnce(timing, 'callActionStart');

          debug('calling action', action.name);
          const actionFn = action.call.bind(this.interface);
          actionResult = await actionFn(param, taskContext);
          setTimingFieldOnce(timing, 'callActionEnd');
          debug('called action', action.name, 'result:', actionResult);

          setTimingFieldOnce(timing, 'afterInvokeActionHookStart');

          const delayAfterRunner =
            action.delayAfterRunner ?? this.waitAfterAction ?? 300;
          if (delayAfterRunner > 0) {
            await sleep(delayAfterRunner);
          }

          try {
            if (this.interface.afterInvokeAction) {
              debug(
                `will call "afterInvokeAction" for interface with action name ${action.name}`,
              );
              await this.interface.afterInvokeAction(action.name, param);
              debug(
                `called "afterInvokeAction" for interface with action name ${action.name}`,
              );
            }
          } catch (originalError: any) {
            const originalMessage =
              originalError?.message || String(originalError);
            throw new Error(
              `error in running afterInvokeAction for ${action.name}: ${originalMessage}`,
              { cause: originalError },
            );
          }

          setTimingFieldOnce(timing, 'afterInvokeActionHookEnd');
        } catch (error) {
          pendingError = error;
        } finally {
          if (this.activeWebDeepLocateZoom) {
            try {
              await this.restoreWebDeepLocateZoom();
            } catch (error) {
              restoreError = error;
              if (pendingError) {
                console.warn(
                  '[Midscene] failed to restore experimental deepLocate zoom:',
                  error,
                );
              }
            }
          }
        }

        if (pendingError) {
          throw pendingError;
        }

        if (restoreError) {
          throw restoreError;
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
    const { cacheable, modelConfigForDefaultIntent, deepLocate, abortSignal } =
      context;

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

    if (deepLocate && !locateParam.deepLocate) {
      locateParam = {
        ...locateParam,
        deepLocate: true,
      };
    }

    const taskLocator: ExecutionTaskPlanningLocateApply = {
      type: 'Planning',
      subType: 'Locate',
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

        const { shrunkShotToLogicalRatio } = uiContext;

        if (shrunkShotToLogicalRatio === undefined) {
          throw new Error(
            'shrunkShotToLogicalRatio is not defined in locate task',
          );
        }

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

        const planLocatedElement = ifPlanLocateParamIsBbox(param)
          ? matchElementFromPlan(param)
          : undefined;

        // from bbox (plan hit)
        // when deepLocate is enabled, bbox should be used as search area hint,
        // not as a final direct hit
        const elementFromBbox = param.deepLocate
          ? undefined
          : planLocatedElement;
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
              // rectFromXpath is in logical coordinates, which should be transformed to screenshot coordinates;
              transformLogicalRectToScreenshotRect(
                rectFromXpath,
                shrunkShotToLogicalRatio,
              ),
              typeof param.prompt === 'string'
                ? param.prompt
                : param.prompt?.prompt || '',
            )
          : undefined;

        const isXpathHit = !!elementFromXpath;

        const cachePrompt = param.prompt;
        const locateCacheRecord = this.taskCache?.matchLocateCache(cachePrompt);
        const cacheEntry = locateCacheRecord?.cacheContent?.cache;

        const elementFromCacheResult =
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

        // elementFromCacheResult is in logical coordinates, which should be transformed to screenshot coordinates;
        const elementFromCache = elementFromCacheResult
          ? transformLogicalElementToScreenshot(
              elementFromCacheResult,
              shrunkShotToLogicalRatio,
            )
          : undefined;

        const isCacheHit = !!elementFromCache;

        let elementFromAiLocate: LocateResultElement | null | undefined;
        const timing = taskContext.task.timing;
        if (!isXpathHit && !isCacheHit && !isPlanHit) {
          try {
            setTimingFieldOnce(timing, 'callAiStart');
            const experimentalPinchDeepLocate =
              !!param.deepLocate && !!this.getWebPinchApi();
            const locateParamForAi = experimentalPinchDeepLocate
              ? {
                  ...param,
                  deepLocate: false,
                }
              : param;

            locateResult = await this.service.locate(
              locateParamForAi,
              {
                context: uiContext,
                planLocatedElement,
              },
              modelConfigForDefaultIntent,
              abortSignal,
            );
            applyDump(locateResult.dump);
            elementFromAiLocate = locateResult.element;

            if (
              experimentalPinchDeepLocate &&
              elementFromAiLocate &&
              !this.activeWebDeepLocateZoom
            ) {
              await this.activateWebDeepLocateZoom(
                elementFromAiLocate,
                shrunkShotToLogicalRatio,
              );
              await sleep(UI_CONTEXT_CACHE_TTL_BYPASS_MS);
              uiContext = await this.service.contextRetrieverFn();
              locateResult = await this.service.locate(
                locateParamForAi,
                {
                  context: uiContext,
                },
                modelConfigForDefaultIntent,
                abortSignal,
              );
              applyDump(locateResult.dump);
              elementFromAiLocate = locateResult.element;
              if (elementFromAiLocate) {
                const zoomScale = await this.getVisualViewportScale();
                elementFromAiLocate =
                  transformZoomedScreenshotElementToScreenshot(
                    elementFromAiLocate,
                    zoomScale,
                  );
              }
            }
          } catch (error) {
            if (error instanceof ServiceError) {
              applyDump(error.dump);
            }
            throw error;
          } finally {
            setTimingFieldOnce(timing, 'callAiEnd');
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
              let pointForCache: [number, number] = element.center;
              if (shrunkShotToLogicalRatio !== 1) {
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
            element: {
              ...element,
              // backward compatibility for aiLocate, which return value needs a dpr field
              dpr: uiContext.deprecatedDpr,
            },
          },
          hitBy,
        };
      },
    };

    return taskLocator;
  }
}
