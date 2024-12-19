import { AIActionType } from '@/ai-model/common';
import { call, callToGetJSONObject } from '@/ai-model/openai';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 20 * 1000,
});
describe('openai sdk connectivity', () => {
  it('connectivity', async () => {
    const result = await call([
      {
        role: 'system',
        content: 'Answer the question',
      },
      {
        role: 'user',
        content: '鲁迅认识周树人吗？回答我：1. 分析原因 2.回答：是/否/无效问题',
      },
    ]);

    expect(result.content.length).toBeGreaterThan(1);
  });

  it('call to get json result', async () => {
    const result = await callToGetJSONObject<{ answer: number }>(
      [
        {
          role: 'system',
          content: 'Answer the question with JSON: {answer: number}',
        },
        {
          role: 'user',
          content: '3 x 5 = ?',
        },
      ],
      AIActionType.EXTRACT_DATA,
    );
    expect(result.content.answer).toBe(15);
  });

  it('image input', async () => {
    const result = await call([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in one sentence.',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://portal.volccdn.com/obj/volcfe/bee_prod/biz_950/tos_38e6e81e1366482ed046045e72b0684d.png',
              detail: 'high',
            },
          },
        ],
      },
    ]);

    expect(result.content.length).toBeGreaterThan(10);
  });
});
