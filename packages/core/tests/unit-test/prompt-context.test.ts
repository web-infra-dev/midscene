import {
  buildLocateCacheKey,
  buildLocatePromptWithUserContext,
  buildPlanningCacheKey,
  renderUserContext,
} from '@/agent/prompt-context';
import { describe, expect, it } from '@rstest/core';

describe('buildPlanningCacheKey', () => {
  it('returns the original string prompt when context is undefined or blank', () => {
    expect(buildPlanningCacheKey('Click submit', undefined)).toBe(
      'Click submit',
    );
    expect(buildPlanningCacheKey('Click submit', '   ')).toBe('Click submit');
  });

  it('renders and prepends context to string prompts', () => {
    expect(
      buildPlanningCacheKey('Click submit', 'Use buyer checkout rules.'),
    ).toBe('<CONTEXT>\nUse buyer checkout rules.\n</CONTEXT>\n\nClick submit');
  });

  it('preserves multimodal prompt fields while updating prompt text', () => {
    expect(
      buildPlanningCacheKey(
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

describe('buildLocatePromptWithUserContext', () => {
  it('renders context and locate target in explicit tags', () => {
    expect(
      buildLocatePromptWithUserContext(
        'Favorite button',
        'The favorite button is the star icon in the bottom-right corner.',
      ),
    ).toEqual({
      prompt:
        '<CONTEXT>\nThe favorite button is the star icon in the bottom-right corner.\n</CONTEXT>\n\n<LOCATE_TARGET>\nFavorite button\n</LOCATE_TARGET>',
    });
  });

  it('preserves multimodal fields while wrapping the prompt text', () => {
    expect(
      buildLocatePromptWithUserContext(
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

describe('renderUserContext', () => {
  it('renders every resolved context with the same model-facing structure', () => {
    expect(renderUserContext('Shared business rules.')).toBe(
      '<CONTEXT>\nShared business rules.\n</CONTEXT>',
    );
  });

  it('preserves the distinction between omitted and explicitly blank context', () => {
    expect(renderUserContext(undefined)).toBeUndefined();
    expect(renderUserContext('')).toBe('');
    expect(renderUserContext('   ')).toBe('');
  });
});

describe('historical locate cache keys', () => {
  it('preserves the stored text format independently of model rendering', () => {
    expect(buildLocateCacheKey('订单', '  选择第二项  ')).toBe(
      '<CONTEXT>\n选择第二项\n</CONTEXT>\n\n<LOCATE_TARGET>\n订单\n</LOCATE_TARGET>',
    );
  });

  it('preserves multimodal fields in stored keys', () => {
    const prompt = {
      prompt: '订单',
      images: [{ name: 'reference', url: 'https://example.com/reference.png' }],
      convertHttpImage2Base64: true,
    };
    expect(buildLocateCacheKey(prompt, '选择第二项')).toEqual({
      ...prompt,
      prompt:
        '<CONTEXT>\n选择第二项\n</CONTEXT>\n\n<LOCATE_TARGET>\n订单\n</LOCATE_TARGET>',
    });
    expect(prompt.prompt).toBe('订单');
  });

  it('preserves blank context and empty prompt behavior', () => {
    expect(buildLocateCacheKey('订单', undefined)).toBe('订单');
    expect(buildLocateCacheKey('订单', '   ')).toBe('订单');
    expect(buildLocateCacheKey('', '选择第二项')).toBe('');
    expect(buildLocateCacheKey({ prompt: '' }, '选择第二项')).toEqual({
      prompt:
        '<CONTEXT>\n选择第二项\n</CONTEXT>\n\n<LOCATE_TARGET>\n\n</LOCATE_TARGET>',
    });
  });
});
