import { resolveChatCompletion } from '@/ai-model/model-adapter/chat-completion';
import { describe, expect, it } from 'vitest';

describe('chat completion content extraction', () => {
  const defaultExtractContentAndReasoning =
    resolveChatCompletion(undefined).extractContentAndReasoning;

  it('returns empty strings for undefined input', () => {
    expect(defaultExtractContentAndReasoning(undefined)).toEqual({
      content: '',
      reasoning_content: '',
    });
  });

  it('extracts string content and reasoning_content', () => {
    expect(
      defaultExtractContentAndReasoning({
        content: 'visible response',
        reasoning_content: 'reasoning response',
      }),
    ).toEqual({
      content: 'visible response',
      reasoning_content: 'reasoning response',
    });
  });

  it('does not extract reasoning by default when reasoning_content is absent', () => {
    expect(
      defaultExtractContentAndReasoning({
        content: 'visible response',
        reasoning: 'vllm reasoning response',
      } as any),
    ).toEqual({
      content: 'visible response',
      reasoning_content: '',
    });
  });

  it('returns empty content for null content', () => {
    expect(
      defaultExtractContentAndReasoning({
        role: 'assistant',
        content: null,
        refusal: null,
        reasoning_content: 'top-level reasoning. ',
      }),
    ).toEqual({
      content: '',
      reasoning_content: 'top-level reasoning. ',
    });
  });

  it('uses configured reasoning key with default message extraction', () => {
    const adapter = resolveChatCompletion({
      messageExtraction: {
        kind: 'default',
        reasoningContentKeys: ['reasoning'],
      },
    });

    expect(
      adapter.extractContentAndReasoning({
        content: 'visible response',
        reasoning: 'provider reasoning',
      } as any),
    ).toEqual({
      content: 'visible response',
      reasoning_content: 'provider reasoning',
    });
  });

  it('uses the first configured reasoning key with a string value', () => {
    const adapter = resolveChatCompletion({
      messageExtraction: {
        kind: 'default',
        reasoningContentKeys: ['reasoning_content', 'reasoning'],
      },
    });

    expect(
      adapter.extractContentAndReasoning({
        content: 'visible response',
        reasoning_content: 'provider reasoning_content',
        reasoning: 'vllm reasoning',
      } as any),
    ).toEqual({
      content: 'visible response',
      reasoning_content: 'provider reasoning_content',
    });

    expect(
      adapter.extractContentAndReasoning({
        content: 'visible response',
        reasoning: 'vllm reasoning',
      } as any),
    ).toEqual({
      content: 'visible response',
      reasoning_content: 'vllm reasoning',
    });
  });

  it('uses custom message extraction when configured', () => {
    const adapter = resolveChatCompletion({
      messageExtraction: {
        kind: 'custom',
        extractContentAndReasoning: () => ({
          content: 'custom content',
          reasoning_content: 'custom reasoning',
        }),
      },
    });

    expect(adapter.extractContentAndReasoning(undefined)).toEqual({
      content: 'custom content',
      reasoning_content: 'custom reasoning',
    });
  });
});
