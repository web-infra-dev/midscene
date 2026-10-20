import { describe, expect, it } from '@rstest/core';
import { mapScrollTopBetweenMarkdownAnchors } from './markdown-scroll-sync';

describe('mapScrollTopBetweenMarkdownAnchors', () => {
  it('maps shared screenshot anchors exactly', () => {
    const mapping = {
      sourceMaxScrollTop: 1000,
      targetMaxScrollTop: 2000,
      sourceAnchorOffsets: [200, 700],
      targetAnchorOffsets: [500, 1400],
    };

    expect(
      mapScrollTopBetweenMarkdownAnchors({ ...mapping, scrollTop: 0 }),
    ).toBe(0);
    expect(
      mapScrollTopBetweenMarkdownAnchors({ ...mapping, scrollTop: 200 }),
    ).toBe(500);
    expect(
      mapScrollTopBetweenMarkdownAnchors({ ...mapping, scrollTop: 700 }),
    ).toBe(1400);
    expect(
      mapScrollTopBetweenMarkdownAnchors({ ...mapping, scrollTop: 1000 }),
    ).toBe(2000);
  });

  it('interpolates continuously between screenshot anchors', () => {
    expect(
      mapScrollTopBetweenMarkdownAnchors({
        scrollTop: 450,
        sourceMaxScrollTop: 1000,
        targetMaxScrollTop: 2000,
        sourceAnchorOffsets: [200, 700],
        targetAnchorOffsets: [500, 1400],
      }),
    ).toBe(950);
  });

  it('keeps the target at the top before the first shared anchor', () => {
    expect(
      mapScrollTopBetweenMarkdownAnchors({
        scrollTop: 100,
        sourceMaxScrollTop: 1000,
        targetMaxScrollTop: 2000,
        sourceAnchorOffsets: [200, 700],
        targetAnchorOffsets: [500, 1400],
      }),
    ).toBe(0);

    expect(
      mapScrollTopBetweenMarkdownAnchors({
        scrollTop: 250,
        sourceMaxScrollTop: 2000,
        targetMaxScrollTop: 1000,
        sourceAnchorOffsets: [500, 1400],
        targetAnchorOffsets: [200, 700],
      }),
    ).toBe(0);
  });

  it('keeps the target at the top without shared anchors', () => {
    expect(
      mapScrollTopBetweenMarkdownAnchors({
        scrollTop: 250,
        sourceMaxScrollTop: 1000,
        targetMaxScrollTop: 600,
        sourceAnchorOffsets: [],
        targetAnchorOffsets: [],
      }),
    ).toBe(0);
  });

  it('clamps out-of-range positions and handles a non-scrollable pane', () => {
    expect(
      mapScrollTopBetweenMarkdownAnchors({
        scrollTop: 1200,
        sourceMaxScrollTop: 1000,
        targetMaxScrollTop: 600,
        sourceAnchorOffsets: [200],
        targetAnchorOffsets: [300],
      }),
    ).toBe(600);
    expect(
      mapScrollTopBetweenMarkdownAnchors({
        scrollTop: 100,
        sourceMaxScrollTop: 1000,
        targetMaxScrollTop: 0,
        sourceAnchorOffsets: [100],
        targetAnchorOffsets: [0],
      }),
    ).toBe(0);
  });
});
