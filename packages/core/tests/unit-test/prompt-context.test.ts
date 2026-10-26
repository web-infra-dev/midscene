import {
  buildLocatePromptWithContext,
  buildPromptWithContext,
  renderAIContext,
} from '@/agent/prompt-context';
import { describe, expect, it } from '@rstest/core';

describe('buildPromptWithContext', () => {
  it('returns the original string prompt when context is undefined or blank', () => {
    expect(buildPromptWithContext('Click submit', undefined)).toBe(
      'Click submit',
    );
    expect(buildPromptWithContext('Click submit', '   ')).toBe('Click submit');
  });

  it('renders and prepends context to string prompts', () => {
    expect(
      buildPromptWithContext('Click submit', 'Use buyer checkout rules.'),
    ).toBe('<CONTEXT>\nUse buyer checkout rules.\n</CONTEXT>\n\nClick submit');
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
        '<CONTEXT>\nUse mobile layout.\n</CONTEXT>\n\nClick the target shown in the reference image.',
      images: [{ name: 'target', url: './target.png' }],
      convertHttpImage2Base64: true,
    });
  });
});

describe('buildLocatePromptWithContext', () => {
  it('renders context and locate target in explicit tags', () => {
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

describe('renderAIContext', () => {
  it('renders every resolved context with the same model-facing structure', () => {
    expect(renderAIContext('Shared business rules.')).toBe(
      '<CONTEXT>\nShared business rules.\n</CONTEXT>',
    );
  });

  it('preserves the distinction between omitted and explicitly blank context', () => {
    expect(renderAIContext(undefined)).toBeUndefined();
    expect(renderAIContext('')).toBe('');
    expect(renderAIContext('   ')).toBe('');
  });
});
