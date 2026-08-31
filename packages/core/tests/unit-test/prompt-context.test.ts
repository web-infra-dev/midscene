import {
  buildLocatePromptWithContext,
  buildPromptWithContext,
  mergeAIContexts,
} from '@/agent/prompt-context';
import { describe, expect, it } from '@rstest/core';

describe('mergeAIContexts', () => {
  it('joins defined non-empty layers in order', () => {
    expect(
      mergeAIContexts('Global context.', undefined, 'Per-call context.'),
    ).toBe('Global context.\n\nPer-call context.');
  });

  it('distinguishes an omitted context from an explicitly empty context', () => {
    expect(mergeAIContexts(undefined, undefined)).toBeUndefined();
    expect(mergeAIContexts(undefined, '')).toBe('');
    expect(mergeAIContexts('Global context.', '')).toBe('Global context.');
  });
});

describe('buildPromptWithContext', () => {
  it('returns the original string prompt when context is undefined or blank', () => {
    expect(buildPromptWithContext('Click submit', undefined)).toBe(
      'Click submit',
    );
    expect(buildPromptWithContext('Click submit', '   ')).toBe('Click submit');
  });

  it('prepends context to string prompts', () => {
    expect(
      buildPromptWithContext('Click submit', 'Use buyer checkout rules.'),
    ).toBe(
      'Context for this request:\nUse buyer checkout rules.\n\nClick submit',
    );
  });

  it('preserves multimodal prompt fields while updating prompt text', () => {
    expect(
      buildPromptWithContext(
        {
          prompt: 'Click the target shown in the reference image.',
          images: [{ name: 'target', url: './target.png' }],
          convertHttpImage2Base64: true,
        },
        'Use mobile layout.',
      ),
    ).toEqual({
      prompt:
        'Context for this request:\nUse mobile layout.\n\nClick the target shown in the reference image.',
      images: [{ name: 'target', url: './target.png' }],
      convertHttpImage2Base64: true,
    });
  });
});

describe('buildLocatePromptWithContext', () => {
  it('wraps context and locate target in explicit tags', () => {
    expect(
      buildLocatePromptWithContext(
        'Favorite button',
        'The favorite button is the star icon in the bottom-right corner.',
      ),
    ).toBe(
      '<CONTEXT>\nThe favorite button is the star icon in the bottom-right corner.\n</CONTEXT>\n\n<LOCATE_TARGET>\nFavorite button\n</LOCATE_TARGET>',
    );
  });

  it('preserves multimodal fields while wrapping the prompt text', () => {
    expect(
      buildLocatePromptWithContext(
        {
          prompt: 'Favorite button',
          images: [{ name: 'target', url: './target.png' }],
        },
        'Use the mobile layout.',
      ),
    ).toEqual({
      prompt:
        '<CONTEXT>\nUse the mobile layout.\n</CONTEXT>\n\n<LOCATE_TARGET>\nFavorite button\n</LOCATE_TARGET>',
      images: [{ name: 'target', url: './target.png' }],
    });
  });
});
