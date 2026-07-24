import { describe, expect, it } from 'vitest';
import {
  accessibilityJsonToUiNode,
  accessibilityNodeToUiNode,
} from '../../src/accessibility-tree';

describe('desktop accessibility tree conversion', () => {
  it('unions visible child bounds for structural nodes', () => {
    const root = accessibilityNodeToUiNode(
      {
        type: 'ATSPIApplication',
        bounds: { left: 0, top: 0, width: 0, height: 0 },
        children: [
          {
            type: 'ATSPIButton',
            attrs: { Name: 'Save' },
            bounds: { left: 20, top: 30, width: 80, height: 32 },
          },
          {
            type: 'ATSPIButton',
            attrs: { Name: 'Cancel' },
            bounds: { left: 120, top: 30, width: 90, height: 32 },
          },
        ],
      },
      { defaultType: 'ATSPIElement' },
    );

    expect(root.bounds).toEqual({
      left: 20,
      top: 30,
      width: 190,
      height: 32,
    });
  });

  it('normalizes global coordinates and scalar attributes', () => {
    const root = accessibilityJsonToUiNode(
      JSON.stringify({
        type: 'UIAButton',
        attrs: {
          AutomationId: 42,
          Enabled: true,
          Ignored: { nested: true },
        },
        position: { x: -1800, y: 120 },
        size: { width: 100, height: 40 },
      }),
      {
        defaultType: 'UIAElement',
        displayOffset: { x: -1920, y: 0 },
      },
    );

    expect(root.bounds).toEqual({
      left: 120,
      top: 120,
      width: 100,
      height: 40,
    });
    expect(root.attrs).toEqual({
      AutomationId: '42',
      Enabled: 'true',
      Ignored: undefined,
    });
  });

  it('uses the platform fallback type for invalid xpath tags', () => {
    const root = accessibilityNodeToUiNode(
      {
        type: 'role with spaces',
        bounds: { left: 0, top: 0, width: 1, height: 1 },
      },
      { defaultType: 'AccessibilityElement' },
    );

    expect(root.type).toBe('AccessibilityElement');
  });

  it('throws for malformed payloads', () => {
    expect(() =>
      accessibilityJsonToUiNode('[]', {
        defaultType: 'AccessibilityElement',
        errorPrefix: 'testTree',
      }),
    ).toThrow('testTree: payload is not an object');
    expect(() =>
      accessibilityJsonToUiNode('{bad json', {
        defaultType: 'AccessibilityElement',
        errorPrefix: 'testTree',
      }),
    ).toThrow('testTree: invalid JSON');
  });
});
