import {
  evaluateXpath,
  generateXpathCacheFeature,
} from '@midscene/core/device-cache';
import { describe, expect, it } from 'vitest';
import {
  LINUX_ACCESSIBILITY_TREE_SCRIPT,
  linuxAccessibilityJsonToUiNode,
} from '../../src/linux-accessibility-tree';

const LINUX_ATSPI_TREE = JSON.stringify({
  type: 'ATSPIApplication',
  attrs: { Name: 'Cache fixture' },
  bounds: { left: 100, top: 50, width: 0, height: 0 },
  children: [
    {
      type: 'ATSPIFrame',
      attrs: { Name: 'Cache fixture window' },
      bounds: { left: 100, top: 50, width: 640, height: 360 },
      children: [
        {
          type: 'ATSPIButton',
          attrs: {
            AccessibleId: 'cache-target',
            Name: 'Midscene Cache Target',
          },
          bounds: { left: 320, top: 210, width: 180, height: 48 },
          children: [],
        },
      ],
    },
  ],
});

describe('Linux AT-SPI accessibility tree', () => {
  it('normalizes screen coordinates and generates an AccessibleId xpath', () => {
    const root = linuxAccessibilityJsonToUiNode(LINUX_ATSPI_TREE, {
      displayOffset: { x: 100, y: 50 },
    });
    const feature = generateXpathCacheFeature(
      root,
      { x: 280, y: 184 },
      {
        stableAttrs: ['AccessibleId', 'id', 'automation-id'],
        textAttrs: ['Name', 'Description', 'HelpText'],
      },
    );

    expect(root.bounds).toEqual({ left: 0, top: 0, width: 640, height: 360 });
    expect(feature?.xpaths[0]).toBe("//*[@AccessibleId='cache-target']");
    expect(feature?.target).toMatchObject({
      type: 'ATSPIButton',
      attr: 'AccessibleId',
      value: 'cache-target',
    });
    expect(evaluateXpath(root, feature!.xpaths[0])).toHaveLength(1);
  });

  it('keeps the Python bridge bounded and selects an active application', () => {
    expect(LINUX_ACCESSIBILITY_TREE_SCRIPT).toContain('Atspi.get_desktop(0)');
    expect(LINUX_ACCESSIBILITY_TREE_SCRIPT).toContain('Atspi.CoordType.SCREEN');
    expect(LINUX_ACCESSIBILITY_TREE_SCRIPT).toContain('Atspi.StateType.ACTIVE');
    expect(LINUX_ACCESSIBILITY_TREE_SCRIPT).toContain('MAX_NODES = 300');
    expect(LINUX_ACCESSIBILITY_TREE_SCRIPT).toContain("'AccessibleId'");
  });

  it('throws instead of accepting malformed AT-SPI output', () => {
    expect(() => linuxAccessibilityJsonToUiNode('null')).toThrow(
      'linuxAccessibilityJsonToUiNode: payload is not an object',
    );
  });
});
