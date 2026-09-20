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
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import type { AIUsageInfo, UIContext } from '@/types';
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
    rs.mocked(callAI).mockReset();
    rs.mocked(standardPlan).mockReset().mockResolvedValue(completedPlan);
  });
  afterEach(() => {
    rs.restoreAllMocks();
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

  it('accepts auto in the aiAct node options schema', () => {
    expect(aiActOptionsInputSchema.parse({ deepThink: 'auto' })).toEqual({
      deepThink: 'auto',
    });
    expect(
      aiActOptionsInputSchema.safeParse({ deepThink: 'sometimes' }).success,
    ).toBe(false);
  });
});
