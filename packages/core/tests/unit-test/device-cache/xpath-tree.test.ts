import {
  type UiNode,
  evaluateXpath,
  findNodeAtPoint,
  generateXpathCacheFeature,
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
        targetDescription: '点击登录',
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
        targetDescription: '点击登录',
      },
    );
    expect(xpaths[0]).toBe("//Button[@name='登录']");
  });

  it('tries later stable attributes when an earlier value is ambiguous', () => {
    const target = node(
      'Button',
      { AccessibleId: 'shared', id: 'cache-target' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const noise = node(
      'Button',
      { AccessibleId: 'shared', id: 'other' },
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const root = win([target, noise]);

    const feature = generateXpathCacheFeature(
      root,
      { x: 150, y: 125 },
      'android',
      { stableAttrs: ['AccessibleId', 'id'] },
    );

    expect(feature?.xpaths[0]).toBe("//*[@id='cache-target']");
    expect(feature?.target).toEqual({
      type: 'Button',
      attr: 'id',
      value: 'cache-target',
    });
  });

  it('tries later semantic attributes when an earlier value is ambiguous', () => {
    const target = node(
      'Button',
      { Name: 'Action', Description: 'Save changes' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const noise = node(
      'Button',
      { Name: 'Action', Description: 'Discard changes' },
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const root = win([target, noise]);

    const feature = generateXpathCacheFeature(
      root,
      { x: 150, y: 125 },
      'android',
      {
        textAttrs: ['Name', 'Description'],
        targetDescription: 'Save changes',
      },
    );

    expect(feature?.xpaths[0]).toBe("//Button[@Description='Save changes']");
    expect(feature?.target).toEqual({
      type: 'Button',
      attr: 'Description',
      value: 'Save changes',
    });
  });

  it('does not cache a positional path without verifiable identity', () => {
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
    expect(xpaths).toEqual([]);
  });

  it('prefers a smaller semantic target over a later fullscreen container', () => {
    const target = node(
      'Button',
      { name: 'login' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const overlayContainer = node(
      'Other',
      { name: 'fullscreen container' },
      { left: 0, top: 0, width: 1000, height: 1000 },
    );
    const root = win([target, overlayContainer]);

    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      {
        stableAttrs: ['name'],
        textAttrs: ['name'],
      },
    );

    expect(xpaths[0]).toBe("//*[@name='login']");
    expect(evaluateXpath(root, xpaths[0])).toEqual([target]);
  });

  it('does not cache when every identity selector is ambiguous', () => {
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
    expect(xpaths).toEqual([]);
  });

  it('serializes attribute values containing both quote styles with concat', () => {
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
    expect(xpaths[0]).toContain('concat(');
    expect(evaluateXpath(root, xpaths[0])).toEqual([target]);
  });

  it('preserves legal whitespace and brackets in attribute values', () => {
    const target = node(
      'Button',
      { label: 'line1\n[Downloads]\tline2' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const root = win([target]);
    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 125 },
      { stableAttrs: ['label'] },
    );
    expect(xpaths[0]).toContain('[Downloads]');
    expect(evaluateXpath(root, xpaths[0])).toEqual([target]);
  });

  it('rejects XML-illegal control characters', () => {
    const target = node(
      'Button',
      { label: 'before\u0000after' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const root = win([target]);
    expect(
      generateXpathCandidates(
        root,
        { x: 150, y: 125 },
        { stableAttrs: ['label'] },
      ),
    ).toEqual([]);
  });

  it('round-trips a corpus of legal XPath attribute values', () => {
    const values = [
      'plain',
      'with [brackets]',
      'line1\nline2',
      'tab\tvalue',
      `single ' quote`,
      'double " quote',
      `both 'single' and "double"`,
      '中文 semantics',
    ];

    for (const value of values) {
      const target = node(
        'Button',
        { label: value },
        { left: 100, top: 100, width: 100, height: 50 },
      );
      const root = win([target]);
      const xpath = generateXpathCandidates(
        root,
        { x: 150, y: 125 },
        { stableAttrs: ['label'] },
      )[0];
      expect(evaluateXpath(root, xpath), value).toEqual([target]);
    }
  });

  it('uses a compound identity when individual attributes are ambiguous', () => {
    const target = node(
      'Button',
      { id: 'action', text: 'Save' },
      { left: 100, top: 100, width: 100, height: 50 },
    );
    const sameId = node(
      'Button',
      { id: 'action', text: 'Delete' },
      { left: 300, top: 100, width: 100, height: 50 },
    );
    const sameText = node(
      'Button',
      { id: 'secondary', text: 'Save' },
      { left: 500, top: 100, width: 100, height: 50 },
    );
    const root = win([target, sameId, sameText]);

    const feature = generateXpathCacheFeature(
      root,
      { x: 150, y: 125 },
      'android',
      {
        stableAttrs: ['id'],
        textAttrs: ['text'],
        targetDescription: 'Save',
      },
    );

    expect(feature?.xpaths[0]).toBe("//Button[@id='action'][@text='Save']");
    expect(feature?.xpathSources?.[0]).toBe('compound-attributes');
    expect(feature?.target).toEqual({
      type: 'Button',
      attr: 'id',
      value: 'action',
      additionalAttrs: [{ attr: 'text', value: 'Save' }],
    });
  });

  it('uses a stable ancestor to scope a repeated child label', () => {
    const first = node(
      'Panel',
      { id: 'card-a' },
      { left: 0, top: 0, width: 300, height: 300 },
      [
        node(
          'Button',
          { text: 'More' },
          { left: 20, top: 20, width: 80, height: 40 },
        ),
      ],
    );
    const target = node(
      'Button',
      { text: 'More' },
      { left: 320, top: 20, width: 80, height: 40 },
    );
    const second = node(
      'Panel',
      { id: 'card-b' },
      { left: 300, top: 0, width: 300, height: 300 },
      [target],
    );
    const root = win([first, second]);

    const feature = generateXpathCacheFeature(
      root,
      { x: 350, y: 40 },
      'android',
      {
        stableAttrs: ['id'],
        textAttrs: ['text'],
        targetDescription: 'More',
      },
    );

    expect(feature?.xpaths[0]).toBe("//*[@id='card-b']//Button[@text='More']");
    expect(feature?.xpathSources?.[0]).toBe('ancestor-scoped');
    expect(feature?.target).toEqual({
      type: 'Button',
      attr: 'text',
      value: 'More',
      ancestor: { type: 'Panel', attr: 'id', value: 'card-b' },
    });
    expect(evaluateXpath(root, feature!.xpaths[0])).toEqual([target]);
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

  it('does not promote a cacheable ancestor over the smaller target', () => {
    const target = node(
      'Button',
      {},
      { left: 100, top: 100, width: 100, height: 40 },
    );
    const parent = node(
      'Panel',
      { id: 'form' },
      { left: 0, top: 0, width: 500, height: 500 },
      [target],
    );
    const root = win([parent]);

    expect(
      generateXpathCacheFeature(root, { x: 150, y: 120 }, 'android', {
        stableAttrs: ['id'],
      }),
    ).toBeUndefined();
  });

  it('does not cache a uniquely identifiable structural root', () => {
    const root = node(
      'AXWindow',
      { AXName: 'cmux' },
      { left: 0, top: 0, width: 1000, height: 800 },
    );

    expect(
      generateXpathCacheFeature(root, { x: 400, y: 300 }, 'android', {
        textAttrs: ['AXName'],
      }),
    ).toBeUndefined();
  });

  it('does not cache an excluded window when its inner target is absent', () => {
    const window = node(
      'AXWindow',
      { AXName: 'cmux' },
      { left: 0, top: 0, width: 1000, height: 800 },
    );
    const root = node(
      'AXApplication',
      { AXName: 'cmux' },
      { left: 0, top: 0, width: 0, height: 0 },
      [window],
    );

    expect(
      generateXpathCacheFeature(root, { x: 400, y: 300 }, 'android', {
        excludedTargetTypes: ['AXApplication', 'AXWindow'],
        textAttrs: ['AXName'],
      }),
    ).toBeUndefined();
  });

  it('caches an exposed child inside an excluded window', () => {
    const target = node(
      'AXButton',
      { AXIdentifier: 'cache-target' },
      { left: 100, top: 100, width: 120, height: 40 },
    );
    const window = node(
      'AXWindow',
      { AXName: 'Demo' },
      { left: 0, top: 0, width: 1000, height: 800 },
      [target],
    );
    const root = node(
      'AXApplication',
      {},
      { left: 0, top: 0, width: 0, height: 0 },
      [window],
    );

    expect(
      generateXpathCacheFeature(root, { x: 150, y: 120 }, 'android', {
        excludedTargetTypes: ['AXApplication', 'AXWindow'],
        stableAttrs: ['AXIdentifier'],
        textAttrs: ['AXName'],
      })?.target,
    ).toEqual({
      type: 'AXButton',
      attr: 'AXIdentifier',
      value: 'cache-target',
    });
  });

  it('traverses a zero-sized structural root', () => {
    const target = node(
      'Button',
      { id: 'login' },
      { left: 100, top: 0, width: 100, height: 100 },
    );
    const root = node(
      'hierarchy',
      {},
      { left: 0, top: 0, width: 0, height: 0 },
      [target],
    );

    const feature = generateXpathCacheFeature(
      root,
      { x: 150, y: 50 },
      'android',
      { stableAttrs: ['id'] },
    );
    expect(feature?.xpaths).toContain("//*[@id='login']");
    expect(feature?.target).toEqual({
      type: 'Button',
      attr: 'id',
      value: 'login',
    });
  });

  it('uses wildcard steps for native types outside the xpath tag subset', () => {
    const target = node(
      'com.example.Custom$View',
      { 'resource-id': 'login', text: 'Login' },
      { left: 0, top: 0, width: 100, height: 50 },
    );
    const root = win([target]);
    const feature = generateXpathCacheFeature(
      root,
      { x: 10, y: 10 },
      'android',
      {
        stableAttrs: ['resource-id'],
        textAttrs: ['text'],
        targetDescription: 'Login',
      },
    );

    expect(feature?.xpaths).toEqual([
      "//*[@resource-id='login']",
      "//*[@text='Login']",
      '/Window[1]/*[1]',
    ]);
    for (const xpath of feature?.xpaths ?? []) {
      expect(evaluateXpath(root, xpath)).toEqual([target]);
    }
  });

  it('does not treat an unrelated semantic value as target identity', () => {
    const target = node(
      'Button',
      { label: 'Active' },
      { left: 20, top: 100, width: 120, height: 40 },
    );

    expect(
      generateXpathCacheFeature(win([target]), { x: 80, y: 120 }, 'android', {
        textAttrs: ['label'],
        targetDescription: 'click the primary action',
      }),
    ).toBeUndefined();
  });

  it('grounds a detailed semantic description by a meaningful prompt token', () => {
    const target = node(
      'Button',
      { description: `Search [video] for "O'Reilly"` },
      { left: 20, top: 100, width: 120, height: 40 },
    );

    expect(
      generateXpathCacheFeature(win([target]), { x: 80, y: 120 }, 'android', {
        textAttrs: ['description'],
        targetDescription: 'the Lynx search action',
      })?.target,
    ).toEqual({
      type: 'Button',
      attr: 'description',
      value: `Search [video] for "O'Reilly"`,
    });
  });

  it('grounds a longer CJK description by a shared semantic phrase', () => {
    const target = node(
      'Button',
      { description: '搜索视频内容' },
      { left: 20, top: 100, width: 120, height: 40 },
    );

    expect(
      generateXpathCacheFeature(win([target]), { x: 80, y: 120 }, 'android', {
        textAttrs: ['description'],
        targetDescription: '点击搜索入口',
      })?.target.value,
    ).toBe('搜索视频内容');
  });

  it('uses a stable wrapper only when it agrees with the model rect', () => {
    const inner = node(
      'Text',
      {},
      { left: 100, top: 100, width: 100, height: 40 },
    );
    const wrapper = node(
      'Button',
      { id: 'submit' },
      { left: 90, top: 95, width: 120, height: 50 },
      [inner],
    );

    expect(
      generateXpathCacheFeature(win([wrapper]), { x: 150, y: 120 }, 'android', {
        stableAttrs: ['id'],
        expectedRect: wrapper.bounds,
      })?.target,
    ).toEqual({ type: 'Button', attr: 'id', value: 'submit' });
  });

  it('rejects a full-window wrapper that does not agree with the model rect', () => {
    const wrapper = node(
      'AXGroup',
      { AXIdentifier: 'content' },
      { left: 0, top: 0, width: 1000, height: 1000 },
    );

    expect(
      generateXpathCacheFeature(win([wrapper]), { x: 150, y: 120 }, 'darwin', {
        stableAttrs: ['AXIdentifier'],
        expectedRect: { left: 100, top: 100, width: 100, height: 40 },
      }),
    ).toBeUndefined();
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
