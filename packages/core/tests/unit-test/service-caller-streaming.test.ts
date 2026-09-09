import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import type { CodeGenerationChunk } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockCreate = rs.fn();
rs.mock('openai', () => ({
  default: rs.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const modelConfig: IModelConfig = {
  modelName: 'gpt-5.4',
  modelFamily: 'gpt-5',
  modelDescription: 'test',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://example.com/v1',
  intent: 'default',
  slot: 'default',
};
const messages = [{ role: 'user' as const, content: 'Hello' }];
const usage = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 };

const contentChunk = {
  choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
};
const finishChunk = {
  choices: [{ delta: {}, finish_reason: 'stop' }],
};

describe('service-caller streaming usage', () => {
  beforeEach(() => mockCreate.mockReset());

  it('reads usage after finish_reason and completes only after the stream ends', async () => {
    const events: string[] = [];
    mockCreate.mockResolvedValue(
      (async function* () {
        yield contentChunk;
        yield finishChunk;
        yield { choices: [], usage };
        events.push('stream-end');
      })(),
    );
    const runtime = getModelRuntime({
      ...modelConfig,
      extraBody: {
        stream_options: { include_usage: false, include_obfuscation: false },
      },
    });
    const onUsage = rs.fn(() => events.push('usage'));
    runtime.onUsage = onUsage;
    const chunks: CodeGenerationChunk[] = [];
    const result = await callAI(messages, runtime, {
      stream: true,
      onChunk: (chunk) => {
        chunks.push(chunk);
        if (chunk.isComplete) events.push('complete');
      },
    });
    expect(mockCreate.mock.calls[0][0].stream_options).toEqual({
      include_usage: true,
      include_obfuscation: false,
    });
    expect(events).toEqual(['stream-end', 'complete', 'usage']);
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(result.usage).toMatchObject(usage);
    expect(onUsage).toHaveBeenCalledWith(result.usage);
    expect(result.usage).toMatchObject({
      slot: 'default',
      model_description: 'test',
    });
    expect(result.usage?.time_cost).toEqual(expect.any(Number));
    expect(result.usage?._midscene_call_id).toEqual(expect.any(String));
    expect(chunks.at(-1)?.usage).toEqual(usage);

    expect(chunks.filter((chunk) => chunk.isComplete)).toHaveLength(1);
    expect(chunks.at(-1)).toMatchObject({
      accumulated: 'Hello',
      usage,
      isComplete: true,
    });
  });

  it.each([true, false])(
    'does not estimate missing usage (finish_reason present: %s)',
    async (withFinish) => {
      mockCreate.mockResolvedValue(
        (async function* () {
          yield contentChunk;
          if (withFinish) yield finishChunk;
        })(),
      );
      const runtime = getModelRuntime(modelConfig);
      const onUsage = rs.fn();
      runtime.onUsage = onUsage;
      const onChunk = rs.fn();
      const result = await callAI(messages, runtime, { stream: true, onChunk });
      expect(mockCreate.mock.calls[0][0].stream_options).toEqual({
        include_usage: true,
      });
      expect(result.content).toBe('Hello');
      expect(result.usage).toBeUndefined();
      expect(onUsage).not.toHaveBeenCalled();
      expect(onChunk.mock.calls.at(-1)?.[0]).toMatchObject({
        isComplete: true,
        usage: undefined,
      });
    },
  );

  it('propagates a completion callback error without reporting usage', async () => {
    mockCreate.mockResolvedValue(
      (async function* () {
        yield contentChunk;
        yield { choices: [], usage };
      })(),
    );
    const runtime = getModelRuntime(modelConfig);
    const onUsage = rs.fn();
    runtime.onUsage = onUsage;
    await expect(
      callAI(messages, runtime, {
        stream: true,
        onChunk: (chunk) => {
          if (chunk.isComplete) throw new Error('completion callback failed');
        },
      }),
    ).rejects.toThrow('completion callback failed');
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('propagates a stream error after finish_reason without sending completion', async () => {
    mockCreate.mockResolvedValue(
      (async function* () {
        yield contentChunk;
        yield finishChunk;
        throw new Error('stream interrupted');
      })(),
    );
    const runtime = getModelRuntime(modelConfig);
    const onUsage = rs.fn();
    runtime.onUsage = onUsage;
    const onChunk = rs.fn();
    await expect(
      callAI(messages, runtime, { stream: true, onChunk }),
    ).rejects.toThrow('stream interrupted');
    expect(onChunk.mock.calls.some(([chunk]) => chunk.isComplete)).toBe(false);
    expect(onUsage).not.toHaveBeenCalled();
  });
});
