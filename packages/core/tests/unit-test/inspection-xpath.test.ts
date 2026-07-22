import { generateInspectionXpathCandidates } from '@/agent/inspection-xpath';
import type { UiNode } from '@/types';
import { describe, expect, it } from 'vitest';

const node = (
  type: string,
  attrs: Record<string, string | undefined>,
  bounds: { left: number; top: number; width: number; height: number },
  children: UiNode[] = [],
): UiNode => ({ type, attrs, bounds, children });

const windowWith = (children: UiNode[]) =>
  node('Window', {}, { left: 0, top: 0, width: 500, height: 500 }, children);

const androidPolicy = {
  stableAttrs: ['resource-id'],
  textAttrs: ['content-desc', 'text'],
  excludedTargetTypes: ['android.webkit.WebView'],
  max: 5,
};

describe('generateInspectionXpathCandidates', () => {
  it('sorts unique resource-id, content-desc, and text candidates first', () => {
    const target = node(
      'android.widget.Button',
      {
        'resource-id': 'com.example:id/login',
        'content-desc': 'Login action',
        text: 'Log in',
      },
      { left: 20, top: 40, width: 120, height: 60 },
    );
    const root = windowWith([target]);

    const xpaths = generateInspectionXpathCandidates(
      root,
      { x: 50, y: 60 },
      androidPolicy,
    );

    expect(xpaths.slice(0, 3)).toEqual([
      "//*[@resource-id='com.example:id/login']",
      "//android.widget.Button[@content-desc='Login action']",
      "//android.widget.Button[@text='Log in']",
    ]);
  });

  it('uses a unique attribute combination when individual values repeat', () => {
    const target = node(
      'Button',
      { 'resource-id': 'action', text: 'Save' },
      { left: 20, top: 20, width: 80, height: 40 },
    );
    const root = windowWith([
      target,
      node(
        'Button',
        { 'resource-id': 'action', text: 'Delete' },
        { left: 120, top: 20, width: 80, height: 40 },
      ),
      node(
        'Button',
        { 'resource-id': 'secondary', text: 'Save' },
        { left: 220, top: 20, width: 80, height: 40 },
      ),
    ]);

    expect(
      generateInspectionXpathCandidates(
        root,
        { x: 40, y: 40 },
        androidPolicy,
      )[0],
    ).toBe("//Button[@resource-id='action'][@text='Save']");
  });

  it('does not treat semantic text as unique when another node type shares it', () => {
    const target = node(
      'Button',
      { 'content-desc': 'Shared action' },
      { left: 20, top: 20, width: 80, height: 40 },
    );
    const root = windowWith([
      target,
      node(
        'Image',
        { 'content-desc': 'Shared action' },
        { left: 120, top: 20, width: 80, height: 40 },
      ),
    ]);

    expect(
      generateInspectionXpathCandidates(root, { x: 40, y: 40 }, androidPolicy),
    ).toEqual(['/Window[1]/Button[1]']);
  });

  it('uses a unique stable ancestor to scope a repeated text target', () => {
    const target = node(
      'Button',
      { text: 'More' },
      { left: 220, top: 20, width: 60, height: 40 },
    );
    const root = windowWith([
      node(
        'Panel',
        { 'resource-id': 'card-a' },
        { left: 0, top: 0, width: 180, height: 200 },
        [
          node(
            'Button',
            { text: 'More' },
            { left: 20, top: 20, width: 60, height: 40 },
          ),
        ],
      ),
      node(
        'Panel',
        { 'resource-id': 'card-b' },
        { left: 200, top: 0, width: 180, height: 200 },
        [target],
      ),
    ]);

    expect(
      generateInspectionXpathCandidates(
        root,
        { x: 240, y: 40 },
        androidPolicy,
      )[0],
    ).toBe("//*[@resource-id='card-b']//Button[@text='More']");
  });

  it('promotes an anonymous nested hit to the nearest semantic Lynx node', () => {
    const icon = node(
      'android.view.ViewGroup',
      {},
      { left: 40, top: 40, width: 40, height: 40 },
    );
    const walletAction = node(
      'android.view.ViewGroup',
      { 'content-desc': '抖音月付  按钮', focusable: 'true' },
      { left: 20, top: 20, width: 100, height: 100 },
      [icon],
    );
    const root = windowWith([walletAction]);

    expect(
      generateInspectionXpathCandidates(
        root,
        { x: 60, y: 60 },
        androidPolicy,
      )[0],
    ).toBe("//android.view.ViewGroup[@content-desc='抖音月付  按钮']");
  });

  it('falls back to an absolute positional XPath', () => {
    const target = node(
      'Button',
      {},
      { left: 120, top: 20, width: 80, height: 40 },
    );
    const root = windowWith([
      node('Button', {}, { left: 20, top: 20, width: 80, height: 40 }),
      target,
    ]);

    expect(
      generateInspectionXpathCandidates(root, { x: 140, y: 40 }, androidPolicy),
    ).toEqual(['/Window[1]/Button[2]']);
  });

  it('throws when the point does not hit any node', () => {
    expect(() =>
      generateInspectionXpathCandidates(
        windowWith([]),
        { x: 800, y: 800 },
        androidPolicy,
      ),
    ).toThrow('no node found');
  });

  it('rejects structural nodes when the inner target is not exposed', () => {
    const root = windowWith([
      node(
        'android.webkit.WebView',
        { 'resource-id': 'web-content' },
        { left: 0, top: 0, width: 500, height: 500 },
      ),
    ]);

    expect(() =>
      generateInspectionXpathCandidates(
        root,
        { x: 100, y: 100 },
        androidPolicy,
      ),
    ).toThrow('目标节点未暴露');
  });
});
