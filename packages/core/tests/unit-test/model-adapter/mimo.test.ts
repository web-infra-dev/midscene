import { mimoAdapters } from '@/ai-model/models/mimo';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const mimoAdapter = new ResolvedModelAdapter(
  mimoAdapters['xiaomi-mimo'],
  'xiaomi-mimo',
);

describe('mimo model adapter', () => {
  it('defaults mimo thinking to enabled when reasoning config is unset', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled to thinking.type for xiaomi-mimo', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
      },
    });

    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('ignores unsupported reasoning effort and budget params', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
        reasoningBudget: 1024,
      },
    });

    expect(mimoAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
    });
  });

  it('keeps user temperature in chat completion params', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        temperature: 0.7,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      thinking: { type: 'enabled' },
    });
  });
});
