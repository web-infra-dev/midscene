import { applyCustomSystemPrompt } from '@/ai-model/service-caller';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('MIDSCENE_SYSTEM_PROMPT_EXTRA', () => {
  let savedValue: string | undefined;

  beforeEach(() => {
    savedValue = process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA;
  });

  afterEach(() => {
    if (savedValue === undefined) {
      // biome-ignore lint/performance/noDelete: restoring env state in test teardown
      delete process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA;
    } else {
      process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA = savedValue;
    }
  });

  it('should prepend custom system prompt to system messages when env var is set', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA =
      'You are a specialized assistant for our internal tool.';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Locate the element on page.' },
      {
        role: 'user',
        content: 'Find the login button',
      },
    ];

    const result = applyCustomSystemPrompt(messages);

    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe(
      'You are a specialized assistant for our internal tool.\n\nLocate the element on page.',
    );
    // User message should be unchanged
    expect(result[1]).toEqual(messages[1]);
  });

  it('should not modify messages when env var is not set', () => {
    // biome-ignore lint/performance/noDelete: testing absent env var behavior
    delete process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA;

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Original system prompt.' },
      { role: 'user', content: 'Hello' },
    ];

    const result = applyCustomSystemPrompt(messages);

    expect(result).toEqual(messages);
  });

  it('should not modify messages when env var is empty string', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA = '';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Original system prompt.' },
      { role: 'user', content: 'Hello' },
    ];

    const result = applyCustomSystemPrompt(messages);

    expect(result).toEqual(messages);
  });

  it('should not modify messages when env var is whitespace only', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA = '   \n  ';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Original system prompt.' },
      { role: 'user', content: 'Hello' },
    ];

    const result = applyCustomSystemPrompt(messages);

    expect(result).toEqual(messages);
  });

  it('should prepend to all system messages when multiple exist', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA = 'Custom prefix.';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'First system message.' },
      { role: 'user', content: 'User input' },
      { role: 'system', content: 'Second system message.' },
    ];

    const result = applyCustomSystemPrompt(messages);

    expect(result[0].content).toBe('Custom prefix.\n\nFirst system message.');
    expect(result[1]).toEqual(messages[1]);
    expect(result[2].content).toBe('Custom prefix.\n\nSecond system message.');
  });

  it('should not mutate the original messages array', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA = 'Custom prefix.';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Original.' },
      { role: 'user', content: 'Hello' },
    ];

    const originalFirstMsg = { ...messages[0] };
    applyCustomSystemPrompt(messages);

    // Original should be unchanged
    expect(messages[0]).toEqual(originalFirstMsg);
  });

  it('should handle messages with no system role', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA = 'Custom prefix.';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const result = applyCustomSystemPrompt(messages);

    // Nothing to prepend to, messages unchanged
    expect(result).toEqual(messages);
  });

  it('should handle multiline custom system prompt', () => {
    process.env.MIDSCENE_SYSTEM_PROMPT_EXTRA =
      'Line 1: You must respond in JSON.\nLine 2: Always include reasoning.';

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Find elements.' },
    ];

    const result = applyCustomSystemPrompt(messages);

    expect(result[0].content).toBe(
      'Line 1: You must respond in JSON.\nLine 2: Always include reasoning.\n\nFind elements.',
    );
  });
});
