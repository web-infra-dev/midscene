import { Agent } from '@/agent';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext, UITreeSnapshot, UiNode } from '@/types';
import { describe, expect, it } from 'vitest';

const target: UiNode = {
  type: 'android.widget.Button',
  attrs: { 'resource-id': 'com.example:id/submit', text: 'Submit' },
  bounds: { left: 40, top: 40, width: 20, height: 20 },
  children: [],
};

const snapshot: UITreeSnapshot = {
  platform: 'android',
  capturedAt: 100,
  root: {
    type: 'android.widget.FrameLayout',
    attrs: {},
    bounds: { left: 0, top: 0, width: 80, height: 80 },
    children: [target],
  },
  xpathPolicy: {
    stableAttrs: ['resource-id'],
    textAttrs: ['content-desc', 'text'],
    excludedTargetTypes: ['android.webkit.WebView'],
    max: 3,
  },
};

const context = (uiTree: UITreeSnapshot | undefined = snapshot): UIContext =>
  ({
    screenshot: ScreenshotItem.create('data:image/png;base64,', 99),
    shotSize: { width: 200, height: 200 },
    shrunkShotToLogicalRatio: 2,
    uiTree,
  }) as UIContext;

const agent = Object.create(Agent.prototype) as Agent;

describe('Agent.getXpathsByPoint', () => {
  it('converts screenshot coordinates to logical coordinates by default', async () => {
    await expect(
      agent.getXpathsByPoint(context(), { x: 100, y: 100 }),
    ).resolves.toEqual([
      "//*[@resource-id='com.example:id/submit']",
      "//android.widget.Button[@text='Submit']",
      '/android.widget.FrameLayout[1]/android.widget.Button[1]',
    ]);
  });

  it('accepts logical coordinates without scaling', async () => {
    await expect(
      agent.getXpathsByPoint(
        context(),
        { x: 50, y: 50 },
        { coordinateSpace: 'logical' },
      ),
    ).resolves.toContain("//*[@resource-id='com.example:id/submit']");
  });

  it('throws when the saved UI tree is missing', async () => {
    const missingTreeContext = context();
    missingTreeContext.uiTree = undefined;
    await expect(
      agent.getXpathsByPoint(missingTreeContext, { x: 10, y: 10 }),
    ).rejects.toThrow('UI tree is missing');
  });

  it('throws for a non-Android snapshot', async () => {
    const wrongPlatform = {
      ...snapshot,
      platform: 'ios',
    } as unknown as UITreeSnapshot;
    await expect(
      agent.getXpathsByPoint(context(wrongPlatform), { x: 10, y: 10 }),
    ).rejects.toThrow('only android is supported');
  });

  it('throws for invalid and out-of-bounds points', async () => {
    await expect(
      agent.getXpathsByPoint(context(), { x: Number.NaN, y: 10 }),
    ).rejects.toThrow('finite, non-negative');
    await expect(
      agent.getXpathsByPoint(context(), { x: 200, y: 10 }),
    ).rejects.toThrow('outside screenshot bounds');
  });

  it('throws when an in-bounds point does not hit the saved tree', async () => {
    await expect(
      agent.getXpathsByPoint(context(), { x: 180, y: 180 }),
    ).rejects.toThrow('no node found');
  });

  it('rejects a structural-only point hit', async () => {
    const structural = {
      ...snapshot,
      root: {
        type: 'android.webkit.WebView',
        attrs: {},
        bounds: { left: 0, top: 0, width: 100, height: 100 },
        children: [],
      },
    };
    await expect(
      agent.getXpathsByPoint(context(structural), { x: 100, y: 100 }),
    ).rejects.toThrow('目标节点未暴露');
  });
});
