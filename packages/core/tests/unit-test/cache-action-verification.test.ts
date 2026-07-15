import {
  CacheActionVerificationError,
  type CacheActionVerificationOutput,
} from '@/agent/cache-action-verifier';
import { TaskBuilder } from '@/agent/task-builder';
import { type LocateCache, TaskCache } from '@/agent/task-cache';
import { getMidsceneLocationSchema } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import type {
  CacheActionVerificationStatus,
  DeviceAction,
  ExecutionTask,
  ExecutionTaskApply,
  ServiceDump,
  UIContext,
} from '@/types';
import { uuid } from '@midscene/shared/utils';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const modelRuntime = getModelRuntime({
  modelName: 'mock-model',
  modelDescription: 'mock model',
  intent: 'default',
  slot: 'default',
});

function createContext(capturedAt: number): UIContext {
  return {
    screenshot: ScreenshotItem.create(PNG_BASE64, capturedAt),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  } as UIContext;
}

function createRuntimeTask(task: ExecutionTaskApply): ExecutionTask {
  return {
    ...task,
    taskId: uuid(),
    status: 'running',
    timing: { start: Date.now() },
  } as ExecutionTask;
}

function addLocateCache(taskCache: TaskCache, prompt: string) {
  const internal = taskCache as unknown as {
    cache: { caches: LocateCache[] };
    cacheOriginalLength: number;
  };
  internal.cache.caches.push({
    type: 'locate',
    prompt,
    cache: { xpaths: ['/html/body/input[1]'] },
  });
  internal.cacheOriginalLength = internal.cache.caches.length;
}

async function createTapExecution(options?: {
  cacheHit?: boolean;
  status?: CacheActionVerificationStatus;
  verifyCachedActions?: boolean;
  bypassLocateCache?: boolean;
}) {
  const prompt = 'search input';
  const taskCache = new TaskCache(uuid(), true);
  if (options?.cacheHit !== false) {
    addLocateCache(taskCache, prompt);
  }
  if (options?.bypassLocateCache) {
    taskCache.matchLocateCache(prompt);
    taskCache.markLocateCacheStale(prompt);
  }
  const actionCall = vi.fn().mockResolvedValue(undefined);
  const action: DeviceAction = {
    name: 'Tap',
    description: 'tap an element',
    delayBeforeRunner: 0,
    delayAfterRunner: 0,
    paramSchema: z.object({
      locate: getMidsceneLocationSchema(),
    }),
    call: actionCall,
  };
  const interfaceInstance = {
    interfaceType: 'web',
    actionSpace: () => [action],
    rectMatchesCacheFeature: vi
      .fn()
      .mockResolvedValue(
        options?.cacheHit === false
          ? undefined
          : { left: 10, top: 10, width: 20, height: 20 },
      ),
    cacheFeatureForPoint: vi.fn().mockResolvedValue({
      xpaths: ['/html/body/input[2]'],
    }),
  } as unknown as AbstractInterface;
  const afterContext = createContext(2);
  const service = {
    contextRetrieverFn: vi.fn().mockResolvedValue(afterContext),
    locate: vi.fn().mockResolvedValue({
      element: {
        center: [20, 20],
        rect: { left: 10, top: 10, width: 20, height: 20 },
      },
      dump: {} as ServiceDump,
    }),
  } as unknown as Service;
  const verification: CacheActionVerificationOutput = {
    result: {
      status: options?.status ?? 'passed',
      reason: 'visible input activation evidence',
      request: {
        actionName: 'Tap',
        targetDescription: prompt,
        logicalModelRequestCount: 1,
        screenshotCount: 2,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        dataDemand: {
          status: 'status demand',
          reason: 'reason demand',
        },
      },
    },
    dump: { taskInfo: {} } as ServiceDump,
    modelInputImages: [
      {
        requestIndex: 1,
        role: 'focused-comparison',
        screenshot: afterContext.screenshot,
      },
    ],
  };
  const cacheActionVerifier = vi.fn().mockResolvedValue(verification);
  const builder = new TaskBuilder({
    interfaceInstance,
    service,
    taskCache,
    actionSpace: [action],
    cacheActionVerifier,
  });
  const { tasks } = await builder.build(
    [
      {
        type: 'Tap',
        thought: 'focus the search input',
        param: { locate: { prompt } },
      },
    ],
    modelRuntime,
    modelRuntime,
    {
      verifyCachedActions: options?.verifyCachedActions,
      bypassLocateCache: options?.bypassLocateCache,
    },
  );
  const locateTask = tasks[0];
  const actionTask = tasks[1];
  const beforeContext = createContext(1);
  const locateRuntimeTask = createRuntimeTask(locateTask);
  const locateResult = await locateTask.executor(locateTask.param, {
    task: locateRuntimeTask,
    uiContext: beforeContext,
  });
  const actionRuntimeTask = createRuntimeTask(actionTask);

  return {
    taskCache,
    cacheActionVerifier,
    actionCall,
    beforeContext,
    afterContext,
    actionTask,
    actionRuntimeTask,
    element: locateResult?.output?.element,
  };
}

async function runTapAction(
  execution: Awaited<ReturnType<typeof createTapExecution>>,
) {
  return execution.actionTask.executor(execution.actionTask.param, {
    task: execution.actionRuntimeTask,
    element: execution.element,
    uiContext: execution.beforeContext,
  });
}

describe('cached Tap action verification', () => {
  it('uses AI after a locate cache hit and accepts passed', async () => {
    const execution = await createTapExecution();

    await expect(runTapAction(execution)).resolves.toEqual({
      output: undefined,
    });

    expect(execution.cacheActionVerifier).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: 'Tap',
        targetDescription: 'search input',
        beforeScreenshot: execution.beforeContext.screenshot,
        afterContext: execution.afterContext,
        targetRect: { left: 10, top: 10, width: 20, height: 20 },
      }),
    );
    expect(execution.actionRuntimeTask.cacheActionVerification).toEqual({
      status: 'passed',
      reason: 'visible input activation evidence',
      request: {
        actionName: 'Tap',
        targetDescription: 'search input',
        logicalModelRequestCount: 1,
        screenshotCount: 2,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        dataDemand: {
          status: 'status demand',
          reason: 'reason demand',
        },
      },
    });
    expect(execution.actionRuntimeTask.cacheActionVerificationImages).toEqual([
      {
        requestIndex: 1,
        role: 'focused-comparison',
        screenshot: execution.afterContext.screenshot,
      },
    ]);
  });

  it.each(['failed', 'uncertain'] as const)(
    'invalidates the locate cache when AI returns %s',
    async (status) => {
      const execution = await createTapExecution({ status });
      const markStale = vi.spyOn(execution.taskCache, 'markLocateCacheStale');

      await expect(runTapAction(execution)).rejects.toBeInstanceOf(
        CacheActionVerificationError,
      );

      expect(markStale).toHaveBeenCalledWith('search input');
      expect(execution.actionRuntimeTask.cacheActionVerification?.status).toBe(
        status,
      );
    },
  );

  it('does not call AI for a non-cached Tap', async () => {
    const execution = await createTapExecution({ cacheHit: false });

    await expect(runTapAction(execution)).resolves.toEqual({
      output: undefined,
    });

    expect(execution.cacheActionVerifier).not.toHaveBeenCalled();
  });

  it('bypasses a rejected cache entry and replaces it with the fresh locate', async () => {
    const execution = await createTapExecution({ bypassLocateCache: true });

    await expect(runTapAction(execution)).resolves.toEqual({
      output: undefined,
    });

    expect(execution.cacheActionVerifier).not.toHaveBeenCalled();
    const internal = execution.taskCache as unknown as {
      cache: { caches: LocateCache[] };
    };
    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].cache).toEqual({
      xpaths: ['/html/body/input[2]'],
    });
  });

  it('keeps cached-plan verification scoped to the requested build', async () => {
    const [cachedPlanExecution, ordinaryExecution] = await Promise.all([
      createTapExecution({ cacheHit: false, verifyCachedActions: true }),
      createTapExecution({ cacheHit: false }),
    ]);

    await Promise.all([
      runTapAction(cachedPlanExecution),
      runTapAction(ordinaryExecution),
    ]);

    expect(cachedPlanExecution.cacheActionVerifier).toHaveBeenCalledOnce();
    expect(ordinaryExecution.cacheActionVerifier).not.toHaveBeenCalled();
  });
});
