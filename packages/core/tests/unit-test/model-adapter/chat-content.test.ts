import { defaultExtractContentAndReasoning } from '@/ai-model/models/chat-content';
import { describe, expect, it } from 'vitest';

describe('chat content extraction', () => {
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
});
