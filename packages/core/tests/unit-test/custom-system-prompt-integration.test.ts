/**
 * Integration test for MIDSCENE_CUSTOM_SYSTEM_PROMPT.
 *
 * Mocks the OpenAI client and verifies that when the env var is set,
 * the custom system prompt is actually prepended to system messages
 * that reach the model API — covering the full callAI → OpenAI path.
 */
import { callAI } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

const baseModelConfig: IModelConfig = {
  modelName: 'private-model-v1',
  modelDescription: 'private model for testing',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://private-api.example.com/v1',
  intent: 'default',
  slot: 'default',
};

describe('MIDSCENE_CUSTOM_SYSTEM_PROMPT integration', () => {
  let savedValue: string | undefined;

  beforeEach(() => {
    savedValue = process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT;
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"type":"Locate","result":[]}' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
  });

  afterEach(() => {
    if (savedValue === undefined) {
      // biome-ignore lint/performance/noDelete: restoring env state in test teardown
      delete process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT;
    } else {
      process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT = savedValue;
    }
  });

  it('prepends custom system prompt in the actual API call', async () => {
    process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT =
      'You are a UI automation assistant for our private app. Always respond in valid JSON.';

    const messages = [
      {
        role: 'system' as const,
        content: 'Locate the element described by the user.',
      },
      {
        role: 'user' as const,
        content: 'Find the submit button',
      },
    ];

    await callAI(messages, baseModelConfig);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calledWith = mockCreate.mock.calls[0][0];

    // System message should have custom prompt prepended
    expect(calledWith.messages[0]).toEqual({
      role: 'system',
      content:
        'You are a UI automation assistant for our private app. Always respond in valid JSON.\n\nLocate the element described by the user.',
    });
    // User message should be unchanged
    expect(calledWith.messages[1]).toEqual({
      role: 'user',
      content: 'Find the submit button',
    });
  });

  it('does not modify messages when env var is absent', async () => {
    // biome-ignore lint/performance/noDelete: testing absent env var behavior
    delete process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT;

    const messages = [
      {
        role: 'system' as const,
        content: 'Original system instruction.',
      },
      {
        role: 'user' as const,
        content: 'Click on login',
      },
    ];

    await callAI(messages, baseModelConfig);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calledWith = mockCreate.mock.calls[0][0];

    expect(calledWith.messages[0]).toEqual({
      role: 'system',
      content: 'Original system instruction.',
    });
    expect(calledWith.messages[1]).toEqual({
      role: 'user',
      content: 'Click on login',
    });
  });

  it('works with multimodal messages (image + text)', async () => {
    process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT =
      'Model-specific: use bbox coordinates for element location.';

    const messages = [
      {
        role: 'system' as const,
        content: 'You are an element locator.',
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: {
              url: 'data:image/png;base64,iVBORw0KGgo=',
              detail: 'high' as const,
            },
          },
          {
            type: 'text' as const,
            text: 'Find the red button in this screenshot.',
          },
        ],
      },
    ];

    await callAI(messages, baseModelConfig);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calledWith = mockCreate.mock.calls[0][0];

    // System message prepended
    expect(calledWith.messages[0]).toEqual({
      role: 'system',
      content:
        'Model-specific: use bbox coordinates for element location.\n\nYou are an element locator.',
    });
    // Multimodal user message preserved as-is
    expect(calledWith.messages[1].role).toBe('user');
    expect(calledWith.messages[1].content).toHaveLength(2);
    expect(calledWith.messages[1].content[0].type).toBe('image_url');
  });

  it('prepends to system messages across different intent configs', async () => {
    process.env.MIDSCENE_CUSTOM_SYSTEM_PROMPT = 'Private model prefix.';

    const planningConfig: IModelConfig = {
      ...baseModelConfig,
      intent: 'planning',
      slot: 'planning',
    };

    const messages = [
      {
        role: 'system' as const,
        content: 'Plan the task step by step.',
      },
      {
        role: 'user' as const,
        content: 'Fill the login form and submit.',
      },
    ];

    await callAI(messages, planningConfig);

    const calledWith = mockCreate.mock.calls[0][0];
    expect(calledWith.messages[0].content).toBe(
      'Private model prefix.\n\nPlan the task step by step.',
    );
  });
});
