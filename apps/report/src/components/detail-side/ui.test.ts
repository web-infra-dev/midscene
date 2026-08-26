import { describe, expect, it } from '@rstest/core';
import { extractTaskImages } from './ui';

describe('extractTaskImages', () => {
  it('reads images from an AI instruction', () => {
    expect(
      extractTaskImages({
        userInstruction: {
          images: [{ name: 'reference', url: 'data:image/png;base64,abc' }],
        },
      }),
    ).toEqual([{ name: 'reference', url: 'data:image/png;base64,abc' }]);
  });

  it('reads images from a nested locate prompt', () => {
    expect(
      extractTaskImages({
        locate: {
          prompt: {
            images: [{ name: 'target', url: 'https://example.com/a.png' }],
          },
        },
      }),
    ).toEqual([{ name: 'target', url: 'https://example.com/a.png' }]);
  });

  it('rejects malformed image entries', () => {
    expect(
      extractTaskImages({ prompt: { images: [{ name: 'missing-url' }] } }),
    ).toBeUndefined();
  });
});
