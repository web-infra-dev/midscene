import {
  evaluateXpath,
  findRectByXpath,
  generateXpathCandidates,
} from '@midscene/core/device-cache';
import { describe, expect, it } from 'vitest';
import { darwinAccessibilityJsonToUiNode } from '../../src/darwin-accessibility-tree';

const SAMPLE_DARWIN_AX_TREE = JSON.stringify({
  type: 'AXApplication',
  attrs: {
    AXRole: 'AXApplication',
    AXName: 'Demo',
  },
  // AXApplication often has no bounds. The adapter should use its children.
  bounds: { left: 0, top: 0, width: 0, height: 0 },
  children: [
    {
      type: 'AXWindow',
      attrs: {
        AXRole: 'AXWindow',
        AXTitle: 'Demo Window',
      },
      bounds: { left: 100, top: 50, width: 800, height: 600 },
      children: [
        {
          type: 'AXButton',
          attrs: {
            AXRole: 'AXButton',
            AXIdentifier: 'loginButton',
            AXTitle: 'Log in',
          },
          bounds: { left: 120, top: 90, width: 100, height: 32 },
          children: [],
        },
      ],
    },
  ],
});

describe('darwinAccessibilityJsonToUiNode', () => {
  it('normalizes global AX bounds into display-local coordinates', () => {
    const root = darwinAccessibilityJsonToUiNode(SAMPLE_DARWIN_AX_TREE, {
      displayOffset: { x: 100, y: 50 },
    });

    expect(root.bounds).toEqual({ left: 0, top: 0, width: 800, height: 600 });
    expect(root.children[0].bounds).toEqual({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });
    expect(root.children[0].children[0].bounds).toEqual({
      left: 20,
      top: 40,
      width: 100,
      height: 32,
    });
  });

  it('emits AXIdentifier selector for the deepest hit', () => {
    const root = darwinAccessibilityJsonToUiNode(SAMPLE_DARWIN_AX_TREE, {
      displayOffset: { x: 100, y: 50 },
    });
    const xpaths = generateXpathCandidates(
      root,
      { x: 70, y: 56 },
      {
        stableAttrs: ['AXIdentifier'],
        textAttrs: ['AXTitle', 'AXDescription'],
      },
    );

    expect(xpaths[0]).toBe("//*[@AXIdentifier='loginButton']");
    for (const xp of xpaths) {
      const matches = evaluateXpath(root, xp);
      expect(matches).toHaveLength(1);
      expect(matches[0].attrs.AXIdentifier).toBe('loginButton');
    }
    expect(findRectByXpath(root, xpaths[0])).toEqual({
      left: 20,
      top: 40,
      width: 100,
      height: 32,
    });
  });

  it('falls back to semantic AXTitle when AXIdentifier is absent', () => {
    const tree = JSON.stringify({
      type: 'AXApplication',
      children: [
        {
          type: 'AXWindow',
          bounds: { left: 0, top: 0, width: 500, height: 500 },
          children: [
            {
              type: 'AXStaticText',
              attrs: { AXTitle: 'Status ready' },
              bounds: { left: 20, top: 30, width: 200, height: 40 },
              children: [],
            },
          ],
        },
      ],
    });

    const root = darwinAccessibilityJsonToUiNode(tree);
    const xpaths = generateXpathCandidates(
      root,
      { x: 100, y: 50 },
      {
        stableAttrs: ['AXIdentifier'],
        textAttrs: ['AXTitle', 'AXDescription'],
      },
    );

    expect(xpaths[0]).toBe("//AXStaticText[@AXTitle='Status ready']");
  });

  it('sanitizes invalid AX role strings before building xpath tags', () => {
    const root = darwinAccessibilityJsonToUiNode(
      JSON.stringify({
        type: 'AX Role With Spaces',
        bounds: { left: 0, top: 0, width: 100, height: 100 },
        children: [],
      }),
    );

    expect(root.type).toBe('AXElement');
    expect(generateXpathCandidates(root, { x: 1, y: 1 })).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => darwinAccessibilityJsonToUiNode('{not json')).toThrow();
  });
});
