import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { glmAdapters } from '@/ai-model/models/glm';
import { describe, expect, it } from '@rstest/core';

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

  it('uses json_object response format when expected for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: 0,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    });
  });

  it('does not use json_object response format when disabled', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: { responseFormat: 'none' },
    });

    expect(result.config.response_format).toBeUndefined();
  });
});

describe('glm-5.3-flash always-thinking contract', () => {
  it('never sends thinking.type=disabled for glm-5.3-flash', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'low',
    });
  });

  it('maps a reasoning-disable intent to effort=low for glm-5.3-flash', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: { reasoningEnabled: false },
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'low',
    });
  });

  it('forwards an explicit reasoning effort for glm-5.3-flash', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: { reasoningEnabled: true, reasoningEffort: 'high' },
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'high',
    });
  });

  it('keeps the provider effort default when reasoning is explicitly enabled without effort', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: { reasoningEnabled: true },
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
      thinking: { type: 'enabled', clear_thinking: false },
    });
    expect(result.config.reasoning_effort).toBeUndefined();
  });

  it('ignores an explicit effort in default reasoning mode for glm-5.3-flash', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: { reasoningEnabled: 'default', reasoningEffort: 'high' },
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
    });
  });

  it('follows provider default for glm-5.3-flash when reasoningEnabled=default', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: { reasoningEnabled: 'default' },
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
    });
  });

  it('keeps an explicit user temperature for glm-5.3-flash', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      userConfig: { temperature: 0 },
    });
    expect(result.config).toEqual({
      temperature: 0,
      top_p: 0.95,
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'low',
    });
  });

  it('combines json_object response format with always-thinking params', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5.3-flash',
      expectedJsonObjectResponse: true,
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 1,
      top_p: 0.95,
      response_format: { type: 'json_object' },
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'low',
    });
  });

  it('keeps toggleable thinking for non-flash glm-v models', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      modelName: 'glm-5v-turbo',
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });
});
