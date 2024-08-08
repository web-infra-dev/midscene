import { call, callToGetJSONObject } from '@/ai-model/openai/base';
import { AIResponseFormat } from '@/types';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 20 * 1000,
});
describe('openai', () => {
  it('basic', async () => {
    const result = await call(
      [
        {
          role: 'system',
          content: 'Answer the question',
        },
        {
          role: 'user',
          content:
            '鲁迅认识周树人吗？回答我：1. 分析原因 2.回答：是/否/无效问题',
        },
      ],
      AIResponseFormat.TEXT,
    );

    expect(result.length).toBeGreaterThan(1);
  });

  it('call to get json result', async () => {
    const result = await callToGetJSONObject<{ answer: number }>([
      {
        role: 'system',
        content: 'Answer the question with JSON: {answer: number}',
      },
      {
        role: 'user',
        content: '3 x 5 = ?',
      },
    ]);
    expect(result.answer).toBe(15);
  });
});
