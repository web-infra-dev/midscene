import {
  evaluateXpath,
  generateXpathCacheFeature,
} from '@midscene/core/device-cache';
import { describe, expect, it } from 'vitest';
import {
  buildWindowsAccessibilityTreeScript,
  windowsAccessibilityJsonToUiNode,
} from '../../src/windows-accessibility-tree';

const WINDOWS_UIA_TREE = JSON.stringify({
  type: 'UIAWindow',
  attrs: { Name: 'Settings' },
  bounds: { left: 0, top: 0, width: 800, height: 600 },
  children: [
    {
      type: 'UIAButton',
      attrs: {
        AutomationId: 'save-button',
        Name: 'Save',
        ClassName: 'Button',
        FrameworkId: 'WPF',
      },
      bounds: { left: 120, top: 90, width: 100, height: 32 },
      children: [],
    },
  ],
});

describe('Windows UI Automation accessibility tree', () => {
  it('generates a verifiable AutomationId xpath cache feature', () => {
    const root = windowsAccessibilityJsonToUiNode(WINDOWS_UIA_TREE);
    const feature = generateXpathCacheFeature(
      root,
      { x: 150, y: 100 },
      {
        stableAttrs: ['AutomationId'],
        textAttrs: ['Name', 'HelpText'],
      },
    );

    expect(feature?.xpaths[0]).toBe("//*[@AutomationId='save-button']");
    expect(feature?.target).toMatchObject({
      type: 'UIAButton',
      attr: 'AutomationId',
      value: 'save-button',
    });
    expect(evaluateXpath(root, feature!.xpaths[0])).toHaveLength(1);
  });

  it('builds a bounded encoded-command-safe UIA traversal script', () => {
    const script = buildWindowsAccessibilityTreeScript({
      windowHandle: 12345,
      displayId: "\\\\.\\DISPLAY'2",
    });

    expect(script).toContain('AutomationElement]::FromHandle');
    expect(script).toContain('TreeWalker]::RawViewWalker');
    expect(script).toContain('$maxDepth = 5');
    expect(script).toContain('$maxNodes = 300');
    expect(script).toContain("$displayId = '\\\\.\\DISPLAY''2'");
    expect(script).toContain('BoundingRectangleProperty');
    expect(script).toContain('AutomationIdProperty');
    expect(script).toContain('NativeWindowHandleProperty');
    expect(script).toContain('$generatedAutomationId');
  });

  it('rejects an invalid active window handle before spawning PowerShell', () => {
    expect(() =>
      buildWindowsAccessibilityTreeScript({ windowHandle: 0 }),
    ).toThrow('invalid active window handle');
  });
});
