import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { buildCodexTurnPayloadFromMessages } from '@/ai-model/service-caller/codex/codex-app-server';
import { toChatMessages } from '@/ai-model/service-caller/openai/chat-completion/utils';
import { toResponsesInput } from '@/ai-model/service-caller/openai/responses/utils';
import type { ModelCallMessages } from '@/ai-model/service-caller/types';
import { describe, expect, it } from '@rstest/core';

describe('protocol image conversion', () => {
  it.each([
    { imageDetail: undefined, perImageDetail: undefined, detail: 'high' },
    { imageDetail: undefined, perImageDetail: 'low', detail: 'low' },
    { imageDetail: undefined, perImageDetail: 'auto', detail: 'auto' },
    { imageDetail: 'original', perImageDetail: 'low', detail: 'original' },
    { imageDetail: 'high', perImageDetail: 'auto', detail: 'high' },
  ] as const)(
    'applies detail priority %j without changing internal history',
    ({ imageDetail, perImageDetail, detail }) => {
      const adapter = new ResolvedModelAdapter(
        {
          ...(imageDetail ? { resolveImageDetail: () => imageDetail } : {}),
        },
        'test',
      );
      const messages: ModelCallMessages = [
        {
          type: 'input-message',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect the screenshot' },
              {
                type: 'image',
                url: 'https://example.com/screenshot.png',
                detail: perImageDetail,
              },
            ],
          },
        },
      ];
      const original = structuredClone(messages);
      expect(toChatMessages(messages, adapter.resolveImageDetail)).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Inspect the screenshot' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/screenshot.png', detail },
            },
          ],
        },
      ]);
      expect(toResponsesInput(messages, adapter.resolveImageDetail)).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Inspect the screenshot' },
            {
              type: 'input_image',
              image_url: 'https://example.com/screenshot.png',
              detail,
            },
          ],
        },
      ]);
      expect(
        buildCodexTurnPayloadFromMessages(messages, adapter.resolveImageDetail)
          .input,
      ).toContainEqual({
        type: 'image',
        url: 'https://example.com/screenshot.png',
        detail,
      });
      expect(messages).toEqual(original);
    },
  );
});
