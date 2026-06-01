import { glmAdapters } from '@/ai-model/models/glm';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const glmAdapter = new ResolvedModelAdapter(glmAdapters['glm-v'], 'glm-v');

describe('glm model adapter', () => {
  it('defaults glm-v thinking to disabled when reasoning config is unset', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(glmAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('maps reasoningEnabled to thinking.type for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled=false to thinking.type=disabled for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('ignores unsupported reasoning fields for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });
});
