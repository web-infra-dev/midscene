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

  it('preserves midscene defaults and applies explicit glm-v temperature override', () => {
    const result = glmAdapters[
      'glm-v'
    ].chatCompletion?.buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0,
        seed: 123,
      } as any,
      userConfig: {
        temperature: 0.7,
        reasoningEnabled: true,
      },
    });

    expect(result?.config).toEqual({
      temperature: 0.7,
      seed: 123,
      thinking: { type: 'enabled' },
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

  it('follows provider default for glm-v when reasoningEnabled=default', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: 'default',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
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
