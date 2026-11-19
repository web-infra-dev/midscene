import * as planningActual from '@/ai-model/workflows/planning' with {
  rstest: 'importActual',
};
import { afterEach, expect, it, rs } from '@rstest/core';

rs.mock('@/ai-model/workflows/planning', () => ({
  ...planningActual,
  standardPlan: rs.fn(),
}));

import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { standardPlan } from '@/ai-model/workflows/planning';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction, ExecutorContext } from '@/types';
import type Service from '../../src';

afterEach(() => {
  rs.restoreAllMocks();
  rs.useRealTimers();
});

it.each([
  {
    platform: 'ios',
    moving: false,
    effort: 'balance' as const,
    recovery: true,
  },
  {
    platform: 'android',
    moving: false,
    effort: 'balance' as const,
    recovery: false,
  },
  {
    platform: 'harmony',
    moving: false,
    effort: 'balance' as const,
    recovery: false,
  },
  {
    platform: 'web',
    moving: false,
    effort: 'balance' as const,
    recovery: false,
  },
  {
    platform: 'ios',
    moving: true,
    effort: 'balance' as const,
    recovery: false,
  },
  {
    platform: 'ios',
    moving: false,
    effort: 'deepThink' as const,
    recovery: true,
  },
  { platform: 'ios', moving: false, effort: 'fast' as const, recovery: true },
])(
  'sends feedback after three completed mobile stalls: $platform, $moving, $effort',
  async ({ platform, moving, effort, recovery }) => {
    rs.useFakeTimers();
    rs.setSystemTime(1000);
    let image = 'initial';
    let executed = 0;
    const actionSpace: DeviceAction[] = [
      { name: 'Scroll', description: 'scroll', call: async () => undefined },
    ];
    const device = {
      interfaceType: platform,
      captureScrollGeometry:
        platform === 'ios'
          ? async () => ({
              targetId: 'form',
              viewport: { x: 0, y: 0, width: 100, height: 200 },
              offscreenDirections: ['left'],
              anchors: {},
            })
          : undefined,
      actionSpace: () => actionSpace,
    } as AbstractInterface;
    const service = {
      contextRetrieverFn: async () => ({
        screenshot: ScreenshotItem.create(image, Date.now()),
        shotSize: { width: 100, height: 200 },
        shrunkShotToLogicalRatio: 1,
      }),
    } as unknown as Service;
    const model = getModelRuntime({
      modelName: 'test-model',
      modelDescription: 'test-model',
      slot: 'default',
      intent: 'default',
    });
    const executor = new TaskExecutor(device, service, {
      getDefaultModelRuntime: () => model,
      replanningCycleLimit: 6,
      actionSpace,
    });
    rs.spyOn(executor, 'convertPlanToExecutable').mockImplementation(
      async (plans) => ({
        tasks: plans.map((plan) => ({
          type: 'Action Space' as const,
          subType: plan.type,
          param: plan.param,
          executor: async (context: ExecutorContext) => {
            context.task.timing!.callActionEnd = Date.now();
            executed++;
            if (moving || plan.type === 'Tap') image = `changed-${executed}`;
            rs.setSystemTime(Date.now() + 1000);
            return {};
          },
        })),
        yamlFlow: [],
      }),
    );
    const seen: number[] = [];
    const feedback: (string | undefined)[] = [];
    rs.mocked(standardPlan).mockImplementation(async (_prompt, options) => {
      const step = seen.length;
      seen.push(options.imagesIncludeCount!);
      feedback.push(options.executionFeedback);
      return {
        actions:
          step < 3
            ? [{ type: 'Scroll', param: { direction: 'down' } }]
            : step === 3
              ? [{ type: 'Tap', param: {} }]
              : [],
        shouldContinuePlanning: step < 4,
        log: '',
        ...(step === 4 ? { finalizeSuccess: true } : {}),
      };
    });
    const result = await executor.action(
      'Find the target',
      model,
      model,
      undefined,
      false,
      undefined,
      effort,
    );
    expect(seen).toEqual(Array(5).fill(effort === 'deepThink' ? 2 : 1));
    const expected = [
      undefined,
      undefined,
      undefined,
      recovery
        ? expect.stringContaining('Fresh native scroll-view geometry')
        : undefined,
      undefined,
    ];
    expect(feedback).toEqual(expected);
    expect(
      result.runner.tasks
        .filter((task) => task.subType === 'Plan')
        .map((task) => task.param?.executionFeedback),
    ).toEqual(expected);
  },
);
