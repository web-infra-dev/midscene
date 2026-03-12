import {
  buildCodexTurnPayloadFromMessages,
  isCodexAppServerProvider,
  resolveCodexReasoningEffort,
} from '@/ai-model/service-caller/codex-app-server';
import type { IModelConfig } from '@midscene/shared/env';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { describe, expect, it } from 'vitest';

const baseModelConfig: IModelConfig = {
  modelName: 'gpt-5.4',
  modelDescription: 'codex',
  intent: 'default',
};

describe('codex app-server provider helper', () => {
  it('detects codex provider base url', () => {
    expect(isCodexAppServerProvider('codex://app-server')).toBe(true);
    expect(isCodexAppServerProvider('  CODEX://APP-SERVER  ')).toBe(true);
    expect(isCodexAppServerProvider('https://api.openai.com/v1')).toBe(false);
    expect(isCodexAppServerProvider(undefined)).toBe(false);
  });

  it('maps deepThink and reasoning effort to codex effort', () => {
    expect(
      resolveCodexReasoningEffort({
        deepThink: true,
        modelConfig: baseModelConfig,
      }),
    ).toBe('high');

    expect(
      resolveCodexReasoningEffort({
        deepThink: false,
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'xhigh',
        },
      }),
    ).toBe('low');

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'medium',
        },
      }),
    ).toBe('medium');

    expect(
      resolveCodexReasoningEffort({
        deepThink: 'unset',
        modelConfig: {
          ...baseModelConfig,
          reasoningEffort: 'invalid-effort',
        },
      }),
    ).toBeUndefined();
  });

  it('converts chat messages into codex turn payload', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'System rule: return concise output.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please inspect this screenshot.' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.png' },
          },
          {
            type: 'image_url',
            image_url: { url: 'file:///tmp/local-shot.png' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'I will check it now.',
      },
    ];

    const payload = buildCodexTurnPayloadFromMessages(messages);

    expect(payload.developerInstructions).toContain(
      'System rule: return concise output.',
    );
    expect(payload.input[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[USER]'),
    });
    expect((payload.input[0] as any).text).toContain(
      'Please inspect this screenshot.',
    );
    expect((payload.input[0] as any).text).toContain('[ASSISTANT]');
    expect(payload.input).toContainEqual({
      type: 'image',
      url: 'https://example.com/image.png',
    });
    expect(payload.input).toContainEqual({
      type: 'localImage',
      path: '/tmp/local-shot.png',
    });
  });
});
