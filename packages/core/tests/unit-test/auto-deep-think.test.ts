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
import { aiActOptionsInputSchema } from '@/agent/test-runner-nodes';
import { getModelRuntime } from '@/ai-model/models';
import { AIResponseParseError, callAI } from '@/ai-model/service-caller/index';
import { standardPlan } from '@/ai-model/workflows/planning';
import { decideDeepThink } from '@/ai-model/workflows/planning/auto-deep-think';
import { getMidsceneLocationSchema } from '@/common';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import type { AIUsageInfo, UIContext } from '@/types';
import {
  MIDSCENE_PLANNING_LOG,
  MIDSCENE_PLANNING_MEMORY,
  MIDSCENE_PLANNING_SEPARATE_LOCATE,
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
});
const usage: AIUsageInfo = {
  cached_input: undefined,
  response_model_name: undefined,
  intent: undefined,
  slot: undefined,
  request_id: undefined,
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
  time_cost: 10,
  model_name: 'test-model',
  model_description: '',
};
const respond = (content: string) =>
  rs.mocked(callAI).mockResolvedValue({
    content,
    isStreamed: false,
    usage,
    rawChoiceMessage: { content },
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

describe('deepThink auto', () => {
  beforeEach(() => {
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, undefined);
    rs.stubEnv(MIDSCENE_PLANNING_MEMORY, undefined);
    rs.stubEnv(MIDSCENE_PLANNING_LOG, undefined);
    rs.mocked(callAI).mockReset();
    rs.mocked(standardPlan).mockReset().mockResolvedValue(completedPlan);
  });
  afterEach(() => {
    rs.restoreAllMocks();
    rs.unstubAllEnvs();
  });

  it.each([true, false])(
    'parses a boolean decision (%s) with all task context',
    async (deepThink) => {
      respond(JSON.stringify({ deepThink, reason: ' Task characteristics. ' }));
      const abortSignal = new AbortController().signal;
      const result = await decideDeepThink(
        {
          text: 'Compare plans',
          referenceImages: [{ name: 'requirements', url: image }],
        },
        {
          context,
          actionContext: 'Budget: 100',
          modelRuntime: model,
          abortSignal,
        },
      );
      expect(result.decision).toEqual({
        deepThink,
        reason: 'Task characteristics.',
      });
      expect(result.usage).toEqual(usage);
      expect(callAI).toHaveBeenCalledTimes(1);
      const [messages, runtime, options] = rs.mocked(callAI).mock.calls[0];
      expect(runtime).toBe(model);
      expect(options?.abortSignal).toBe(abortSignal);
      expect(JSON.stringify(messages)).toContain('Compare plans');
      expect(JSON.stringify(messages)).toContain('Budget: 100');
      expect(JSON.stringify(messages)).toContain('requirements');
      expect(JSON.stringify(messages)).toContain(image);
    },
  );

  it.each([
    '{}',
    '{"deepThink":"false","reason":"simple"}',
    '{"deepThink":0,"reason":"simple"}',
    '{"deepThink":true,"reason":" "}',
    '{"deepThink":null,"reason":"simple"}',
    '[]',
    'not a decision',
  ])('rejects invalid decisions and preserves usage: %s', async (content) => {
    respond(content);
    const promise = decideDeepThink(
      { text: 'Task', referenceImages: [] },
      {
        context,
        modelRuntime: model,
      },
    );
    await expect(promise).rejects.toBeInstanceOf(AIResponseParseError);
    await expect(promise).rejects.toMatchObject({
      rawResponse: content,
      usage,
    });
    expect(callAI).toHaveBeenCalledTimes(1);
  });

  it('does not start a request when aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Cancelled'));
    await expect(
      decideDeepThink(
        { text: 'Task', referenceImages: [] },
        {
          context,
          modelRuntime: model,
          abortSignal: controller.signal,
        },
      ),
    ).rejects.toThrow('Cancelled');
    expect(callAI).not.toHaveBeenCalled();
  });

  function createExecutor() {
    const actionSpace = [
      {
        name: 'Noop',
        description: 'noop',
        paramSchema: z.object({}),
        call: async () => undefined,
      },
    ];
    const snapshots: unknown[] = [];
    const executor = new TaskExecutor(
      {
        interfaceType: 'web',
        actionSpace: () => actionSpace,
      } as unknown as AbstractInterface,
      {
        contextRetrieverFn: rs.fn().mockResolvedValue(context),
      } as unknown as Service,
      {
        replanningCycleLimit: 1,
        actionSpace,
        hooks: {
          onSnapshotChange: (runner) => {
            snapshots.push(runner.tasks);
          },
        },
      },
    );
    rs.spyOn(executor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
    });
    return { executor, snapshots };
  }

  it.each([true, false])(
    'selects once and keeps mode across planning rounds (%s)',
    async (deepThink) => {
      respond(JSON.stringify({ deepThink, reason: 'Decision evidence' }));
      rs.mocked(standardPlan).mockResolvedValueOnce({
        ...completedPlan,
        shouldContinuePlanning: true,
      });
      const { executor } = createExecutor();
      const result = await executor.action(
        'Task',
        model,
        model,
        'User context',
        false,
        1,
        'auto',
      );
      expect(callAI).toHaveBeenCalledTimes(1);
      expect(standardPlan).toHaveBeenCalledTimes(2);
      for (const [, options] of rs.mocked(standardPlan).mock.calls) {
        expect(options).toMatchObject({
          effort: deepThink ? 'deepThink' : 'balance',
          includeMemory: true,
          includeLog: true,
          includeLocateInPlanning: !deepThink,
          imagesIncludeCount: deepThink ? 2 : 1,
        });
      }
      expect(result.runner.tasks[0]).toMatchObject({
        type: 'Planning',
        subType: 'DeepThink',
        status: 'finished',
        param: { deepThink: 'auto', aiActContext: 'User context' },
        output: {
          deepThink,
          reason: 'Decision evidence',
          effort: deepThink ? 'deepThink' : 'balance',
        },
        usage: { ...usage, intent: 'planning' },
        timing: {
          callAiStart: expect.any(Number),
          callAiEnd: expect.any(Number),
        },
      });
      expect(result.output?.output).toBe('done');
    },
  );

  it.each(
    [true, false].flatMap((deepThink) => [
      {
        deepThink,
        memory: 'true',
        log: 'false',
        includeMemory: true,
        includeLog: false,
      },
      {
        deepThink,
        memory: '0',
        log: '1',
        includeMemory: false,
        includeLog: true,
      },
      {
        deepThink,
        memory: 'FALSE',
        log: '0',
        includeMemory: false,
        includeLog: false,
      },
      {
        deepThink,
        memory: '1',
        log: 'TRUE',
        includeMemory: true,
        includeLog: true,
      },
    ]),
  )(
    'uses independent environment switches in Auto: %j',
    async ({ deepThink, memory, log, includeMemory, includeLog }) => {
      rs.stubEnv(MIDSCENE_PLANNING_MEMORY, memory);
      rs.stubEnv(MIDSCENE_PLANNING_LOG, log);
      rs.mocked(callAI).mockImplementation(async () => {
        // The switches must already have been captured before classification.
        rs.stubEnv(MIDSCENE_PLANNING_MEMORY, String(!includeMemory));
        rs.stubEnv(MIDSCENE_PLANNING_LOG, String(!includeLog));
        return {
          content: JSON.stringify({ deepThink, reason: 'Goals' }),
          isStreamed: false,
        };
      });
      const { executor } = createExecutor();
      const result = await executor.action(
        'Task',
        model,
        model,
        undefined,
        false,
        1,
        'auto',
      );
      expect(rs.mocked(standardPlan).mock.calls[0][1]).toMatchObject({
        effort: deepThink ? 'deepThink' : 'balance',
        includeMemory,
        includeLog,
        includeLocateInPlanning: !deepThink,
        imagesIncludeCount: deepThink ? 2 : 1,
      });
      expect(
        result.runner.tasks.find((task) => task.subType === 'Plan')?.param,
      ).toMatchObject({ includeMemory, includeLog });
      expect(String(rs.mocked(callAI).mock.calls[0][0][0].content)).toContain(
        'Memory and action logs are configured independently',
      );
    },
  );

  it.each([MIDSCENE_PLANNING_MEMORY, MIDSCENE_PLANNING_LOG])(
    'rejects explicit %s on custom planners',
    async (key) => {
      rs.stubEnv(key, 'false');
      const { executor } = createExecutor();
      const customModel = getModelRuntime({
        ...model.config,
        modelFamily: 'auto-glm',
      });
      await expect(executor.action('Task', customModel, model)).rejects.toThrow(
        `${key} requires a standard planning adapter.`,
      );
      expect(callAI).not.toHaveBeenCalled();
      expect(standardPlan).not.toHaveBeenCalled();
    },
  );

  it('keeps separate location for an explicitly configured planning model', async () => {
    respond('{"deepThink":false,"reason":"simple"}');
    const { executor } = createExecutor();
    await executor.action(
      'Task',
      { ...model, config: { ...model.config, slot: 'planning' } },
      model,
      undefined,
      false,
      1,
      'auto',
    );
    expect(rs.mocked(standardPlan).mock.calls[0][1]).toMatchObject({
      effort: 'balance',
      includeLocateInPlanning: false,
    });
  });

  it.each(['balance', 'deepThink', 'fast'] as const)(
    'does not classify explicit %s mode',
    async (effort) => {
      const { executor } = createExecutor();
      await executor.action('Task', model, model, undefined, false, 1, effort);
      expect(callAI).not.toHaveBeenCalled();
    },
  );

  it('stops before planning on invalid classification and records the failure', async () => {
    respond('{"deepThink":"true"}');
    const { executor, snapshots } = createExecutor();
    await expect(
      executor.action('Task', model, model, undefined, false, 1, 'auto'),
    ).rejects.toThrow('Invalid deepThink auto decision');
    expect(standardPlan).not.toHaveBeenCalled();
    expect(snapshots.at(-1)).toEqual([
      expect.objectContaining({
        subType: 'DeepThink',
        status: 'failed',
        usage: expect.objectContaining({ ...usage, intent: 'planning' }),
        log: expect.objectContaining({ rawResponse: '{"deepThink":"true"}' }),
      }),
    ]);
  });

  it('propagates request errors without starting planning', async () => {
    rs.mocked(callAI).mockRejectedValue(new Error('Model unavailable'));
    const { executor } = createExecutor();
    await expect(
      executor.action('Task', model, model, undefined, false, 1, 'auto'),
    ).rejects.toThrow('Model unavailable');
    expect(standardPlan).not.toHaveBeenCalled();
  });

  it('does not start planning when aborted during classification', async () => {
    const controller = new AbortController();
    rs.mocked(callAI).mockImplementation(async () => {
      controller.abort('Cancelled during classification');
      return {
        content: '{"deepThink":false,"reason":"simple"}',
        isStreamed: false,
        usage,
      };
    });
    const { executor } = createExecutor();
    await expect(
      executor.action(
        'Task',
        model,
        model,
        undefined,
        false,
        1,
        'auto',
        undefined,
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow('Cancelled during classification');
    expect(standardPlan).not.toHaveBeenCalled();
  });

  const locatableModel = getModelRuntime({
    ...model.config,
    modelFamily: 'doubao-seed',
  });

  it.each([
    { value: 'true', expected: false },
    { value: '1', expected: false },
    { value: ' TRUE ', expected: false },
    { value: 'false', expected: true },
    { value: '0', expected: true },
  ])('overrides every fixed mode with $value', async ({ value, expected }) => {
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, value);
    for (const effort of ['balance', 'deepThink', 'fast'] as const) {
      for (const slot of ['default', 'planning'] as const) {
        const { executor } = createExecutor();
        const result = await executor.action(
          'Task',
          { ...locatableModel, config: { ...locatableModel.config, slot } },
          model,
          undefined,
          false,
          1,
          effort,
        );
        expect(rs.mocked(standardPlan).mock.calls.at(-1)?.[1]).toMatchObject({
          effort,
          includeLocateInPlanning: expected,
          imagesIncludeCount: effort === 'deepThink' ? 2 : 1,
        });
        expect(result.runner.tasks[0].param).toMatchObject({
          separateLocate: !expected,
          includeLocateInPlanning: expected,
        });
      }
    }
    expect(callAI).not.toHaveBeenCalled();
  });

  it('freezes the override before auto and reads it again on the next invocation', async () => {
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, 'false');
    rs.mocked(callAI).mockImplementation(async () => {
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, 'true');
      return {
        content: '{"deepThink":true,"reason":"Dependent goals"}',
        isStreamed: false,
      };
    });
    const { executor } = createExecutor();
    await executor.action(
      'Task',
      locatableModel,
      model,
      undefined,
      false,
      1,
      'auto',
    );
    expect(rs.mocked(standardPlan).mock.calls[0][1]).toMatchObject({
      effort: 'deepThink',
      includeLocateInPlanning: true,
    });
    await executor.action(
      'Next task',
      locatableModel,
      model,
      undefined,
      false,
      1,
      'auto',
    );
    expect(rs.mocked(standardPlan).mock.calls[1][1]).toMatchObject({
      effort: 'deepThink',
      includeLocateInPlanning: false,
    });
  });

  it.each(['invalid', 'yes', '2'])(
    'rejects invalid override %s before the auto request',
    async (value) => {
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, value);
      const { executor } = createExecutor();
      await expect(
        executor.action(
          'Task',
          locatableModel,
          model,
          undefined,
          false,
          1,
          'auto',
        ),
      ).rejects.toThrow('must be true, false, 1, or 0');
      expect(callAI).not.toHaveBeenCalled();
      expect(standardPlan).not.toHaveBeenCalled();
    },
  );

  it('treats an empty override as unset', async () => {
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, '  ');
    const { executor } = createExecutor();
    await executor.action(
      'Task',
      model,
      model,
      undefined,
      false,
      1,
      'deepThink',
    );
    expect(
      rs.mocked(standardPlan).mock.calls[0][1].includeLocateInPlanning,
    ).toBe(false);
  });

  it('rejects combined planning without a locate-capable Planning model before auto', async () => {
    rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, 'false');
    const { executor } = createExecutor();
    await expect(
      executor.action('Task', model, model, undefined, false, 1, 'auto'),
    ).rejects.toThrow(
      'requires a Planning model family with a locate result codec',
    );
    expect(callAI).not.toHaveBeenCalled();
    expect(standardPlan).not.toHaveBeenCalled();
  });

  it.each(['true', 'false'])(
    'rejects override %s for custom planners',
    async (value) => {
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, value);
      const { executor } = createExecutor();
      const customModel = getModelRuntime({
        ...model.config,
        modelFamily: 'auto-glm',
      });
      await expect(executor.action('Task', customModel, model)).rejects.toThrow(
        'requires a standard planning adapter',
      );
      expect(callAI).not.toHaveBeenCalled();
      expect(standardPlan).not.toHaveBeenCalled();
    },
  );

  it.each([
    { separateLocate: false, deepThink: true },
    { separateLocate: true, deepThink: false },
    { separateLocate: false, deepThink: false },
    { separateLocate: true, deepThink: true },
  ])(
    'executes the real plan and locate path: separate=$separateLocate, deepThink=$deepThink',
    async ({ separateLocate, deepThink }) => {
      rs.stubEnv(MIDSCENE_PLANNING_SEPARATE_LOCATE, String(separateLocate));
      rs.mocked(standardPlan).mockImplementation(planningActual.standardPlan);
      rs.mocked(callAI)
        .mockResolvedValueOnce({
          content: JSON.stringify({
            deepThink,
            reason: 'Task characteristics',
          }),
          isStreamed: false,
        })
        .mockResolvedValueOnce({
          content: `${deepThink ? '<update-plan-content><sub-goal index="1" status="pending">Saved</sub-goal></update-plan-content><memory>Reference value retained</memory>' : ''}
<log>Save</log><action-type>Tap</action-type><action-param-json>{"locate":{"prompt":"Save","bbox":[0,0,1000,1000]}}</action-param-json>`,
          isStreamed: false,
        })
        .mockResolvedValueOnce({
          content: '<complete success="true">done</complete>',
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
      const result = await executor.action(
        'Save',
        locatableModel,
        locatableModel,
        undefined,
        false,
        1,
        'auto',
      );
      expect(result.output?.output).toBe('done');
      expect(tap).toHaveBeenCalledTimes(1);
      expect(locate).toHaveBeenCalledTimes(separateLocate ? 1 : 0);
      expect(callAI).toHaveBeenCalledTimes(3);
      const plans = result.runner.tasks.filter(
        (task) => task.subType === 'Plan',
      );
      expect(plans).toHaveLength(2);
      expect(plans[0].param).toMatchObject({
        effort: deepThink ? 'deepThink' : 'balance',
        includeLocateInPlanning: !separateLocate,
      });
      if (deepThink) {
        expect(plans[1].param.subGoalStatus).toContain('Saved');
        expect(plans[1].param.memoriesStatus).toContain(
          'Reference value retained',
        );
      } else {
        expect(plans[1].param.subGoalStatus).toBeUndefined();
      }
    },
  );

  it('accepts auto in the aiAct node options schema', () => {
    expect(aiActOptionsInputSchema.parse({ deepThink: 'auto' })).toEqual({
      deepThink: 'auto',
    });
    expect(
      aiActOptionsInputSchema.safeParse({ deepThink: 'sometimes' }).success,
    ).toBe(false);
  });
});
