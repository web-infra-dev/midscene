import {
  type UiNode,
  evaluateXpath,
  findNodeAtPoint,
  generateXpathCandidates,
} from '@/device-cache';
import { describe, expect, it } from 'vitest';

const node = (
  type: string,
  attrs: Record<string, string | undefined>,
  bounds: { left: number; top: number; width: number; height: number },
  children: UiNode[] = [],
): UiNode => ({ type, attrs, bounds, children });

describe('findNodeAtPoint', () => {
  it('returns the deepest containing node', () => {
    const inner = node(
      'Button',
      { name: 'a' },
      {
        left: 10,
        top: 10,
        width: 20,
        height: 20,
      },
    );
    const outer = node(
      'Group',
      {},
      { left: 0, top: 0, width: 100, height: 100 },
      [inner],
    );
    const root = node(
      'Window',
      {},
      { left: 0, top: 0, width: 100, height: 100 },
      [outer],
    );
    const hit = findNodeAtPoint(root, { x: 15, y: 15 });
    expect(hit?.node).toBe(inner);
    expect(hit?.path.map((n) => n.type)).toEqual(['Window', 'Group', 'Button']);
  });

  it('returns undefined when point is outside root', () => {
    const root = node('Window', {}, { left: 0, top: 0, width: 50, height: 50 });
    expect(findNodeAtPoint(root, { x: 200, y: 200 })).toBeUndefined();
  });

  it('skips zero-area nodes', () => {
    const ghost = node('Other', {}, { left: 0, top: 0, width: 0, height: 0 });
    const real = node('Button', {}, { left: 0, top: 0, width: 50, height: 50 });
    const root = node(
      'Window',
      {},
      { left: 0, top: 0, width: 100, height: 100 },
      [ghost, real],
    );
    const hit = findNodeAtPoint(root, { x: 10, y: 10 });
    expect(hit?.node).toBe(real);
  });

  it('prefers the last sibling in document order on overlap', () => {
    const a = node(
      'Button',
      { name: 'a' },
      { left: 0, top: 0, width: 50, height: 50 },
    );
    const b = node(
      'Button',
      { name: 'b' },
      { left: 0, top: 0, width: 50, height: 50 },
    );
    const root = node(
      'Window',
      {},
      { left: 0, top: 0, width: 100, height: 100 },
      [a, b],
    );
    const hit = findNodeAtPoint(root, { x: 10, y: 10 });
    expect(hit?.node).toBe(b);
  });
});

describe('generateXpathCandidates', () => {
  const win = (children: UiNode[]) =>
    node(
      'Window',
      {},
      { left: 0, top: 0, width: 1000, height: 1000 },
      children,
    );

  it('emits a stable-id candidate when a stable attr is set and unique', () => {
    const target = node(
      'Button',
      { 'accessibility-id': 'login_btn', name: '登录' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const noise = node(
      'Button',
      { 'accessibility-id': 'cancel_btn' },
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const root = win([target, noise]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      {
        stableAttrs: ['accessibility-id'],
        textAttrs: ['name'],
      },
    );
    expect(xpaths[0]).toBe("//*[@accessibility-id='login_btn']");
    // verify each emitted xpath actually resolves to the target
    for (const xp of xpaths) {
      expect(evaluateXpath(root, xp)).toEqual([target]);
    }
  });

  it('falls back to type+text when stable id missing', () => {
    const target = node(
      'Button',
      { name: '登录' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const noise = node(
      'Button',
      { name: '取消' },
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const root = win([target, noise]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      {
        stableAttrs: ['accessibility-id'],
        textAttrs: ['name'],
      },
    );
    expect(xpaths[0]).toBe("//Button[@name='登录']");
  });

  it('always emits a positional path as the last candidate', () => {
    const target = node(
      'Button',
      {}, // no usable attrs
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const sibling = node(
      'Button',
      {},
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const root = win([sibling, target]);
    const xpaths = generateXpathCandidates(root, { x: 150, y: 125 }, {});
    expect(xpaths).toEqual(['/Window[1]/Button[2]']);
    expect(evaluateXpath(root, xpaths[0])).toEqual([target]);
  });

  it('drops ambiguous stable-id candidates', () => {
    // two nodes share the same id; the id-based xpath would resolve to both,
    // so it must be dropped in favor of the positional fallback.
    const dupA = node(
      'Button',
      { id: 'shared' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const dupB = node(
      'Button',
      { id: 'shared' },
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const root = win([dupA, dupB]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 350, y: 125 },
      { stableAttrs: ['id'] },
    );
    expect(xpaths.every((xp) => !xp.startsWith('//*[@id='))).toBe(true);
    expect(xpaths.at(-1)).toBe('/Window[1]/Button[2]');
  });

  it('rejects attribute values containing both quote styles', () => {
    const target = node(
      'Button',
      { label: `weird "value" with 'both'` },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const root = win([target]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      { stableAttrs: ['label'] },
    );
    expect(xpaths[0]).toBe('/Window[1]/Button[1]');
  });

  it('rejects attribute values with control characters', () => {
    const target = node(
      'Button',
      { label: 'line1\nline2' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const root = win([target]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      { stableAttrs: ['label'] },
    );
    expect(xpaths.every((xp) => !xp.includes('\n'))).toBe(true);
  });

  it('returns empty when point hits nothing', () => {
    const root = win([]);
    const xpaths = generateXpathCandidates(root, { x: 5000, y: 5000 }, {});
    expect(xpaths).toEqual([]);
  });

  it('respects max candidate count', () => {
    const target = node(
      'Button',
      { 'accessibility-id': 'x', name: '登录' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const root = win([target]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      {
        stableAttrs: ['accessibility-id'],
        textAttrs: ['name'],
        max: 1,
      },
    );
    expect(xpaths).toHaveLength(1);
  });

  it('handles realistic iOS WDA-shaped trees end-to-end', () => {
    // Simulates a slice of XCUIElement output: window > navigation > button.
    const cancel = node(
      'XCUIElementTypeButton',
      { name: '取消' },
      { left: 0, top: 40, width: 80, height: 40 },
    );
    const login = node(
      'XCUIElementTypeButton',
      { name: '登录', 'accessibility-id': 'login_btn' },
      { left: 280, top: 40, width: 80, height: 40 },
    );
    const navBar = node(
      'XCUIElementTypeNavigationBar',
      { name: 'AccountNav' },
      { left: 0, top: 40, width: 360, height: 40 },
      [cancel, login],
    );
    const window = node(
      'XCUIElementTypeWindow',
      {},
      { left: 0, top: 0, width: 360, height: 800 },
      [navBar],
    );
    const xpaths = generateXpathCandidates(
      window,
      { x: 320, y: 60 },
      {
        stableAttrs: ['accessibility-id'],
        textAttrs: ['name', 'label'],
      },
    );
    expect(xpaths).toContain("//*[@accessibility-id='login_btn']");
    for (const xp of xpaths) {
      expect(evaluateXpath(window, xp)).toEqual([login]);
    }
  });

  it('handles realistic Android-shaped trees end-to-end', () => {
    const username = node(
      'android.widget.EditText',
      {
        'resource-id': 'com.example:id/username',
        text: '',
      },
      { left: 40, top: 200, width: 1000, height: 120 },
    );
    const password = node(
      'android.widget.EditText',
      {
        'resource-id': 'com.example:id/password',
      },
      { left: 40, top: 360, width: 1000, height: 120 },
    );
    const loginBtn = node(
      'android.widget.Button',
      {
        'resource-id': 'com.example:id/login',
        text: '登录',
      },
      { left: 40, top: 520, width: 1000, height: 140 },
    );
    const root = node(
      'android.widget.FrameLayout',
      {},
      { left: 0, top: 0, width: 1080, height: 1920 },
      [username, password, loginBtn],
    );
    const xpaths = generateXpathCandidates(
      root,
      { x: 540, y: 590 },
      {
        stableAttrs: ['resource-id'],
        textAttrs: ['text', 'content-desc'],
      },
    );
    expect(xpaths[0]).toBe("//*[@resource-id='com.example:id/login']");
    for (const xp of xpaths) {
      expect(evaluateXpath(root, xp)).toEqual([loginBtn]);
    }
  });
});
