import * as callerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};
import * as planningActual from '@/ai-model/workflows/planning' with {
  rstest: 'importActual',
};
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@/ai-model/service-caller/index', () => ({
  ...callerActual,
  callAI: rs.fn(),
}));
rs.mock('@/ai-model/workflows/planning', () => ({
  ...planningActual,
  standardPlan: rs.fn(),
}));

import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import { standardPlan } from '@/ai-model/workflows/planning';
import { getMidsceneLocationSchema } from '@/common';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import type { UIContext } from '@/types';
import {
  MIDSCENE_PLANNING_SCREENSHOT_COUNT,
  MIDSCENE_PLANNING_SEPARATE_LOCATE,
  globalConfigManager,
} from '@midscene/shared/env';
import { z } from 'zod';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const context = {
  screenshot: ScreenshotItem.create(image, Date.now()),
  shotSize: { width: 1, height: 1 },
  shrunkShotToLogicalRatio: 1,
  tree: { id: 'root', attributes: {}, children: [] },
} as unknown as UIContext;
const model = getModelRuntime({
  modelName: 'test-model',
  modelDescription: '',
  intent: 'planning',
  slot: 'default',
  modelFamily: 'doubao-seed',
});
const completedPlan = {
  actions: [],
  yamlFlow: [],
  shouldContinuePlanning: false,
  log: '',
  rawResponse: '',
  finalizeSuccess: true,
  finalizeMessage: 'done',
};
function createExecutor() {
  const actionSpace = [
    {
      name: 'Noop',
      description: 'noop',
      paramSchema: z.object({}),
      call: async () => undefined,
    },
  ];
  return new TaskExecutor(
    {
      interfaceType: 'web',
      actionSpace: () => actionSpace,
    } as unknown as AbstractInterface,
    { contextRetrieverFn: async () => context } as unknown as Service,
    { actionSpace, replanningCycleLimit: 3 },
  );
}

describe('planning controls', () => {
  beforeEach(() => {
    rs.stubEnv(MIDSCENE_PLANNING_SCREENSHOT_COUNT, undefined);
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, undefined);
    rs.mocked(callAI).mockReset();
    rs.mocked(standardPlan).mockReset().mockResolvedValue(completedPlan);
  });
  afterEach(() => {
    rs.restoreAllMocks();
    rs.unstubAllEnvs();
  });

  it.each(['balance', 'deepThink', 'fast', 'auto'] as const)(
    'ignores legacy mode %s without classification',
    async (legacy) => {
      const readConfig = rs.spyOn(globalConfigManager, 'getEnvConfigValue');
      const executor = createExecutor();
      const result = await executor.action(
        'Task',
        model,
        model,
        undefined,
        false,
        1,
        legacy,
      );
      expect(callAI).not.toHaveBeenCalled();
      expect(standardPlan).toHaveBeenCalledTimes(1);
      expect(
        result.runner.tasks.some((task) => task.subType === 'DeepThink'),
      ).toBe(false);
      expect(rs.mocked(standardPlan).mock.calls[0][1]).toMatchObject({
        includeLocateInPlanning: true,
        imagesIncludeCount: 1,
      });
      expect(rs.mocked(standardPlan).mock.calls[0][1]).not.toHaveProperty(
        'effort',
      );
      const queried = readConfig.mock.calls.map(([key]) => key);
      for (const removed of [
        'MIDSCENE_PLANNING_MEMORY',
        'MIDSCENE_PLANNING_LOG',
        'MIDSCENE_PLANNING_TASK_SCOPE',
      ])
        expect(queried).not.toContain(removed);
    },
  );

  it.each([1, 2])(
    'sends at most %s execution screenshots and retains reference images',
    async (count) => {
      rs.stubEnv(MIDSCENE_PLANNING_SCREENSHOT_COUNT, String(count));
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, 'true');
      for (const removed of [
        'MIDSCENE_PLANNING_MEMORY',
        'MIDSCENE_PLANNING_LOG',
        'MIDSCENE_PLANNING_TASK_SCOPE',
      ])
        rs.stubEnv(removed, 'false');
      rs.mocked(standardPlan).mockImplementation(planningActual.standardPlan);
      for (const content of [
        '<planning>Read</planning><memory>Source value: River Road</memory><log>Inspect the next state</log><action-type>Noop</action-type><action-param-json>{}</action-param-json>',
        '<planning>Continue</planning><action-type>Noop</action-type><action-param-json>{}</action-param-json>',
        '<planning>Confirmed</planning><complete success="true">done</complete>',
      ])
        rs.mocked(callAI).mockResolvedValueOnce({ content, isStreamed: false });
      const result = await createExecutor().action(
        { prompt: 'Task', images: [{ name: 'reference', url: image }] },
        model,
        model,
      );
      expect(result.output?.output).toBe('done');
      expect(callAI).toHaveBeenCalledTimes(3);
      for (const [index, [messages]] of rs
        .mocked(callAI)
        .mock.calls.entries()) {
        const images = messages.flatMap((message) =>
          Array.isArray(message.content)
            ? message.content.filter((part) => part.type === 'image_url')
            : [],
        );
        expect(images).toHaveLength(1 + Math.min(index + 1, count));
        const prompt = String(messages[0].content);
        for (const tag of [
          '<planning>',
          '<memory>',
          '<log>',
          '<update-plan-content>',
          '<completion_rules>',
        ])
          expect(prompt).toContain(tag);
        if (index > 0) {
          const latest = JSON.stringify(messages.at(-1));
          expect(latest).toContain('Source value: River Road');
          expect(latest).toContain('Noop — Returned successfully');
        }
      }
      for (const task of result.runner.tasks.filter(
        (task) => task.subType === 'Plan',
      )) {
        expect(task.param).toMatchObject({
          imagesIncludeCount: count,
          includeLocateInPlanning: false,
        });
        expect(task.param).not.toHaveProperty('includeMemory');
        expect(task.param).not.toHaveProperty('includeTaskScope');
      }
    },
  );

  it.each([false, true])(
    'executes the requested Locate path (separate=%s) with optional sub-goals',
    async (separateLocate) => {
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, String(separateLocate));
      rs.mocked(standardPlan).mockImplementation(planningActual.standardPlan);
      rs.mocked(callAI)
        .mockResolvedValueOnce({
          content:
            '<planning>Save then verify</planning><update-plan-content><sub-goal index="1" status="pending">Saved</sub-goal></update-plan-content><memory>Reference value retained</memory><log>Save</log><action-type>Tap</action-type><action-param-json>{"locate":{"prompt":"Save","bbox":[0,0,1000,1000]}}</action-param-json>',
          isStreamed: false,
        })
        .mockResolvedValueOnce({
          content:
            '<planning>Confirmed</planning><complete success="true">done</complete>',
          isStreamed: false,
        });
      const tap = rs.fn(async () => undefined);
      const locate = rs.fn(async () => ({
        element: {
          center: [0.5, 0.5],
          rect: { left: 0, top: 0, width: 1, height: 1 },
        },
      }));
      const actionSpace = [
        {
          name: 'Tap',
          description: 'Tap an element',
          paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
          call: tap,
        },
      ];
      const executor = new TaskExecutor(
        {
          interfaceType: 'web',
          actionSpace: () => actionSpace,
        } as unknown as AbstractInterface,
        {
          contextRetrieverFn: async () => context,
          locate,
        } as unknown as Service,
        { actionSpace, replanningCycleLimit: 1 },
      );
      const result = await executor.action('Save', model, model);
      expect(result.output?.output).toBe('done');
      expect(tap).toHaveBeenCalledTimes(1);
      expect(locate).toHaveBeenCalledTimes(separateLocate ? 1 : 0);
      expect(callAI).toHaveBeenCalledTimes(2);
      const plans = result.runner.tasks.filter(
        (task) => task.subType === 'Plan',
      );
      expect(plans[1].param.subGoalStatus).toContain('Saved');
      expect(plans[1].param.memoriesStatus).toContain(
        'Reference value retained',
      );
    },
  );

  it('snapshots controls once and refreshes them on the next invocation', async () => {
    rs.stubEnv(MIDSCENE_PLANNING_SCREENSHOT_COUNT, '2');
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, 'true');
    rs.mocked(standardPlan).mockImplementationOnce(async () => {
      rs.stubEnv(MIDSCENE_PLANNING_SCREENSHOT_COUNT, '1');
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, 'false');
      return {
        ...completedPlan,
        finalizeSuccess: undefined,
        shouldContinuePlanning: true,
      };
    });
    const executor = createExecutor();
    await executor.action('Task', model, model);
    await executor.action('Task', model, model);
    const configs = rs
      .mocked(standardPlan)
      .mock.calls.map(([, opts]) => [
        opts.imagesIncludeCount,
        opts.includeLocateInPlanning,
      ]);
    expect(configs).toEqual([
      [2, false],
      [2, false],
      [1, true],
    ]);
  });

  it.each(['0', '3', '01', '-1', '1.5', '2x'])(
    'rejects unsupported screenshot count %s before planning',
    async (value) => {
      rs.stubEnv(MIDSCENE_PLANNING_SCREENSHOT_COUNT, value);
      await expect(
        createExecutor().action('Task', model, model),
      ).rejects.toThrow('must be 1 or 2');
      expect(standardPlan).not.toHaveBeenCalled();
    },
  );

  it.each([
    MIDSCENE_PLANNING_SCREENSHOT_COUNT,
    MIDSCENE_PLANNING_SEPARATE_LOCATE,
  ])('rejects %s for custom planners', async (key) => {
    rs.stubEnv(key, key === MIDSCENE_PLANNING_SCREENSHOT_COUNT ? '2' : 'true');
    const customModel = getModelRuntime({
      ...model.config,
      modelFamily: 'auto-glm',
    });
    await expect(
      createExecutor().action('Task', customModel, model),
    ).rejects.toThrow(`${key} requires a standard planning adapter.`);
    expect(callAI).not.toHaveBeenCalled();
  });
});
