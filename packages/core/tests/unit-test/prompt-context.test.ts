import {
  buildLocatePromptWithContext,
  buildPromptWithContext,
  mergeAIContexts,
  renderAIContext,
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
      buildPromptWithContext(
        'Click submit',
        '<REQUEST_CONTEXT source="call">\nUse buyer checkout rules.\n</REQUEST_CONTEXT>',
      ),
    ).toBe(
      '<REQUEST_CONTEXT source="call">\nUse buyer checkout rules.\n</REQUEST_CONTEXT>\n\nClick submit',
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
        '<GLOBAL_CONTEXT>\nUse mobile layout.\n</GLOBAL_CONTEXT>',
      ),
    ).toEqual({
      prompt:
        '<GLOBAL_CONTEXT>\nUse mobile layout.\n</GLOBAL_CONTEXT>\n\nClick the target shown in the reference image.',
      images: [{ name: 'target', url: './target.png' }],
      convertHttpImage2Base64: true,
    });
  });
});

describe('buildLocatePromptWithContext', () => {
  it('renders call context and locate target in explicit tags', () => {
    expect(
      buildLocatePromptWithContext(
        'Favorite button',
        'The favorite button is the star icon in the bottom-right corner.',
      ),
    ).toBe(
      '<REQUEST_CONTEXT source="call">\nThe favorite button is the star icon in the bottom-right corner.\n</REQUEST_CONTEXT>\n\n<LOCATE_TARGET>\nFavorite button\n</LOCATE_TARGET>',
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
        '<REQUEST_CONTEXT source="call">\nUse the mobile layout.\n</REQUEST_CONTEXT>\n\n<LOCATE_TARGET>\nFavorite button\n</LOCATE_TARGET>',
      images: [{ name: 'target', url: './target.png' }],
    });
  });
});

describe('renderAIContext', () => {
  it('renders default, API, and call contexts with their source', () => {
    expect(
      renderAIContext({
        value: 'Shared business rules.',
        metadata: { source: 'default' },
      }),
    ).toBe('<GLOBAL_CONTEXT>\nShared business rules.\n</GLOBAL_CONTEXT>');
    expect(
      renderAIContext({
        value: 'Return a plain number.',
        metadata: { source: 'api', apiName: 'aiQuery' },
      }),
    ).toBe(
      '<REQUEST_CONTEXT source="api" api="aiQuery">\nReturn a plain number.\n</REQUEST_CONTEXT>',
    );
    expect(
      renderAIContext({
        value: 'Use the cart footer.',
        metadata: { source: 'call' },
      }),
    ).toBe(
      '<REQUEST_CONTEXT source="call">\nUse the cart footer.\n</REQUEST_CONTEXT>',
    );
  });

  it('appends workflow history as a separate read-only block', () => {
    expect(
      renderAIContext(
        {
          value: 'Use the cart footer.',
          metadata: { source: 'call' },
        },
        'Previous step passed.',
      ),
    ).toBe(
      '<REQUEST_CONTEXT source="call">\nUse the cart footer.\n</REQUEST_CONTEXT>\n\n<WORKFLOW_HISTORY read_only="true">\nPrevious step passed.\n</WORKFLOW_HISTORY>',
    );
  });

  it('keeps history when an empty selected context clears inherited context', () => {
    expect(
      renderAIContext(
        { value: '', metadata: { source: 'call' } },
        'Previous step passed.',
      ),
    ).toBe(
      '<WORKFLOW_HISTORY read_only="true">\nPrevious step passed.\n</WORKFLOW_HISTORY>',
    );
    expect(renderAIContext({ value: '', metadata: { source: 'call' } })).toBe(
      '',
    );
  });
});
