import { existsSync } from 'node:fs';
import path from 'node:path';
import { AIActionType } from '@/ai-model/common';
import { call, callToGetJSONObject } from '@/ai-model/openai';
import { base64Encoded } from '@/image';
import dotenv from 'dotenv';
import { getFixture } from 'tests/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 20 * 1000,
});
[
  '.env.qwen',
  '.env.gemini',
  '.env.doubao',
  '.env.init_json',
  '.env.anthropic',
  '.env.openai',
].forEach((envFile) => {
  const configPath = path.resolve(__dirname, `../../${envFile}`);
  if (!existsSync(configPath)) {
    return;
  }

  describe(`LLM service connectivity: ${envFile}`, () => {
    beforeAll(() => {
      const result = dotenv.config({
        debug: true,
        path: configPath,
        override: true,
      });
      if (result.error) {
        throw result.error;
      }
    });

    it('text only', async () => {
      const result = await call([
        {
          role: 'system',
          content: 'Answer the question',
        },
        {
          role: 'user',
          content:
            '鲁迅认识周树人吗？回答我：1. 分析原因 2.回答：是/否/无效问题',
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
      expect(result.content).toEqual({ answer: 15 });
    });

    it('image input', async () => {
      const imagePath = getFixture('baidu.png');
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
                url: base64Encoded(imagePath),
                detail: 'high',
              },
            },
          ],
        },
      ]);

      expect(result.content.length).toBeGreaterThan(10);
    });
  });
});

describe('keep at least one test in each suite', () => {
  it('test', () => {
    expect(1).toBe(1);
  });
});
