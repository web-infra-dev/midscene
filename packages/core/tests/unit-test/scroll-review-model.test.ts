import { getModelRuntime } from '@/ai-model/models';
import { callGenerativeAI } from '@/ai-model/service-caller/call-ai';
import { reviewScroll } from '@/ai-model/workflows/planning/scroll-review';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, UIContext } from '@/types';
import { beforeEach, expect, it, rs } from '@rstest/core';
rs.mock('@/ai-model/service-caller/call-ai', () => ({
  callGenerativeAI: rs.fn(),
  callSystemOneAI: rs.fn(),
}));
const context: UIContext = {
  screenshot: ScreenshotItem.create('data:image/png;base64,AA==', 1),
  shotSize: { width: 100, height: 100 },
  shrunkShotToLogicalRatio: 1,
};
const task: ExecutionTask = {
  type: 'Action Space',
  subType: 'Scroll',
  taskId: 'scroll',
  status: 'finished',
  param: {
    direction: 'down',
    locate: {
      description: 'nested results list',
      center: [45, 50],
      rect: { left: 20, top: 30, width: 50, height: 40 },
    },
  },
  uiContext: context,
  executor: async () => ({}),
};
const runtime = getModelRuntime({
  modelName: 'test',
  modelDescription: 'test',
  intent: 'planning',
  slot: 'planning',
  retryCount: 1,
  retryInterval: 0,
});
const good = {
  progress: 'unchanged',
  observation: 'The list did not move; its right edge is clipped.',
  nextSearchDirection: 'right',
};
beforeEach(() => {
  rs.mocked(callGenerativeAI).mockReset();
});
it('retries semantic schema failures and carries the nested target and both screenshots', async () => {
  rs.mocked(callGenerativeAI)
    .mockResolvedValueOnce({ content: '{"progress":"bad"}', isStreamed: false })
    .mockResolvedValueOnce({
      content: JSON.stringify(good),
      isStreamed: false,
    });
  const result = await reviewScroll({
    task,
    current: context,
    modelRuntime: runtime,
  });
  expect(result.content).toEqual(good);
  expect(callGenerativeAI).toHaveBeenCalledTimes(2);
  const messages = rs.mocked(callGenerativeAI).mock.calls[0][0];
  expect(JSON.stringify(messages)).toContain('[45,50]');
  expect(JSON.stringify(messages).match(/data:image\/png/g)).toHaveLength(2);
  expect(
    rs.mocked(callGenerativeAI).mock.calls[1][2]?.semanticRetryAttempt,
  ).toBe(1);
});
it('preserves invalid raw response and usage after bounded schema retries', async () => {
  rs.mocked(callGenerativeAI).mockResolvedValue({
    content: '{"progress":"bad"}',
    isStreamed: false,
    usage: {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
      cached_input: 0,
      time_cost: 1,
      model_name: undefined,
      model_description: undefined,
      response_model_name: undefined,
      intent: undefined,
      slot: undefined,
      request_id: undefined,
    },
  });
  await expect(
    reviewScroll({ task, current: context, modelRuntime: runtime }),
  ).rejects.toMatchObject({
    rawResponse: '{"progress":"bad"}',
    usage: { total_tokens: 3 },
  });
  expect(callGenerativeAI).toHaveBeenCalledTimes(2);
});
it('does not retry or hide cancellation', async () => {
  const controller = new AbortController();
  const error = new Error('cancel review');
  rs.mocked(callGenerativeAI).mockImplementation(async () => {
    controller.abort(error);
    return { content: JSON.stringify(good), isStreamed: false };
  });
  let caught: unknown;
  try {
    await reviewScroll({
      task,
      current: context,
      modelRuntime: runtime,
      abortSignal: controller.signal,
    });
  } catch (reason) {
    caught = reason;
  }
  expect(caught).toBe(error);
  expect(callGenerativeAI).toHaveBeenCalledOnce();
});

it.each([
  { ...good, nextSearchDirection: 'down' },
  { ...good, progress: 'moved' },
  { ...good, progress: 'uncertain' },
])('retries internally contradictory scroll guidance: %j', async (invalid) => {
  rs.mocked(callGenerativeAI)
    .mockResolvedValueOnce({
      content: JSON.stringify(invalid),
      isStreamed: false,
    })
    .mockResolvedValueOnce({
      content: JSON.stringify(good),
      isStreamed: false,
    });
  const result = await reviewScroll({
    task,
    current: context,
    modelRuntime: runtime,
  });
  expect(result.content).toEqual(good);
  expect(callGenerativeAI).toHaveBeenCalledTimes(2);
});

it('derives native progress from execution evidence and asks AI only for overflow evidence', async () => {
  rs.mocked(callGenerativeAI).mockResolvedValueOnce({
    content: JSON.stringify({
      observation: 'The right edge is clipped.',
      nextSearchDirection: 'right',
    }),
    isStreamed: false,
  });
  const state = {
    targetId: 'inner',
    scrollTop: 0,
    scrollLeft: 0,
    rect: { left: 0, top: 0, width: 100, height: 100 },
  };
  const result = await reviewScroll({
    task: {
      ...task,
      scrollProgress: {
        status: 'unchanged',
        before: state,
        after: { ...state, rect: { ...state.rect, top: -50 } },
      },
    },
    current: context,
    modelRuntime: runtime,
  });
  expect(result.content.progress).toBe('unchanged');
  expect(result.content.observation).toContain(
    "target's own scroll offsets did not change",
  );
  expect(result.content.nextSearchDirection).toBe('right');
  expect(
    JSON.stringify(rs.mocked(callGenerativeAI).mock.calls[0][0]),
  ).toContain('Do not reclassify ancestor displacement');
});

it('rejects a model attempting to overwrite measured target progress', async () => {
  rs.mocked(callGenerativeAI)
    .mockResolvedValueOnce({
      content: JSON.stringify({
        ...good,
        progress: 'moved',
        nextSearchDirection: null,
      }),
      isStreamed: false,
    })
    .mockResolvedValueOnce({
      content: JSON.stringify(good),
      isStreamed: false,
    });
  const result = await reviewScroll({
    task: { ...task, scrollProgress: { status: 'unchanged' } },
    current: context,
    modelRuntime: runtime,
  });
  expect(callGenerativeAI).toHaveBeenCalledTimes(2);
  expect(result.content.progress).toBe('unchanged');
});
