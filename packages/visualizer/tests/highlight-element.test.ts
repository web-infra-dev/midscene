import { describe, expect, it } from 'vitest';
import {
  getCenterHighlightBox,
  normalizeHighlightElementForReport,
} from '../src/utils/highlight-element';

describe('normalizeHighlightElementForReport', () => {
  it('builds the report highlight box from center', () => {
    expect(
      getCenterHighlightBox({
        center: [100, 200],
      }),
    ).toEqual({
      left: 97,
      top: 197,
      width: 8,
      height: 8,
    });
  });

  it('clamps the center highlight box to the image origin', () => {
    expect(
      getCenterHighlightBox({
        center: [1, 2],
      }),
    ).toEqual({
      left: 0,
      top: 0,
      width: 8,
      height: 8,
    });
  });

  it('rebuilds the report highlight rect from center for locate results', () => {
    expect(
      normalizeHighlightElementForReport({
        description: 'the CTA button',
        center: [100, 200],
        rect: {
          left: 20,
          top: 40,
          width: 300,
          height: 500,
        },
      }),
    ).toEqual({
      description: 'the CTA button',
      center: [100, 200],
      rect: {
        left: 97,
        top: 197,
        width: 8,
        height: 8,
      },
    });
  });

  it('keeps the normalized center while replacing the rect', () => {
    expect(
      normalizeHighlightElementForReport({
        description: 'corner target',
        center: [1, 2],
        rect: {
          left: 0,
          top: 0,
          width: 200,
          height: 300,
        },
      }),
    ).toEqual({
      description: 'corner target',
      center: [1, 2],
      rect: {
        left: 0,
        top: 0,
        width: 8,
        height: 8,
      },
    });
  });
});
