import {
  evaluateXpath,
  generateXpathCandidates,
} from '@midscene/core/internal/device-cache';
import { describe, expect, it } from 'vitest';
import { wdaSourceToUiNode } from '../../src/wda-source-tree';

const SAMPLE_WDA_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Demo" label="Demo" enabled="true" visible="true" x="0" y="0" width="390" height="844">
  <XCUIElementTypeWindow type="XCUIElementTypeWindow" enabled="true" visible="true" x="0" y="0" width="390" height="844">
    <XCUIElementTypeNavigationBar type="XCUIElementTypeNavigationBar" name="Account" enabled="true" visible="true" x="0" y="44" width="390" height="44">
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="cancel_btn" label="取消" enabled="true" visible="true" x="0" y="44" width="80" height="44"/>
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="login_btn" label="登录" enabled="true" visible="true" x="310" y="44" width="80" height="44"/>
    </XCUIElementTypeNavigationBar>
    <XCUIElementTypeOther type="XCUIElementTypeOther" enabled="true" visible="true" x="0" y="88" width="390" height="756">
      <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" value="Hello, world &amp; co" label="Hello, world &amp; co" enabled="true" visible="true" x="20" y="120" width="350" height="40"/>
    </XCUIElementTypeOther>
  </XCUIElementTypeWindow>
</XCUIElementTypeApplication>`;

describe('wdaSourceToUiNode', () => {
  it('parses the WDA source XML into a UiNode tree with logical bounds', () => {
    const root = wdaSourceToUiNode(SAMPLE_WDA_SOURCE);
    expect(root.type).toBe('XCUIElementTypeApplication');
    expect(root.bounds).toEqual({
      left: 0,
      top: 0,
      width: 390,
      height: 844,
    });
    // bounds attrs are stripped from attrs map so xpath predicates can't key off geometry
    expect(root.attrs.x).toBeUndefined();
    expect(root.attrs.width).toBeUndefined();
    expect(root.attrs.name).toBe('Demo');
  });

  it('preserves attribute entities like &amp;', () => {
    const root = wdaSourceToUiNode(SAMPLE_WDA_SOURCE);
    const window = root.children[0];
    const otherSection = window.children[1];
    const text = otherSection.children[0];
    expect(text.attrs.label).toBe('Hello, world & co');
    expect(text.attrs.value).toBe('Hello, world & co');
  });

  it('emits an accessibility-id selector for the deepest hit', () => {
    const root = wdaSourceToUiNode(SAMPLE_WDA_SOURCE);
    const login = root.children[0].children[0].children[1];
    expect(login.attrs['accessibility-id']).toBe('login_btn');
    const xpaths = generateXpathCandidates(
      root,
      { x: 350, y: 66 },
      {
        stableAttrs: ['accessibility-id'],
        textAttrs: ['name', 'label', 'value'],
        targetDescription: '登录',
      },
    );
    expect(xpaths[0]).toBe("//*[@accessibility-id='login_btn']");
    for (const xp of xpaths) {
      const matches = evaluateXpath(root, xp);
      expect(matches).toHaveLength(1);
      expect(matches[0].attrs.name).toBe('login_btn');
    }
  });

  it('does not cache when the only identity is ambiguous', () => {
    const ambiguous = `<?xml version="1.0"?>
<XCUIElementTypeApplication x="0" y="0" width="100" height="100">
  <XCUIElementTypeButton name="dup" x="0" y="0" width="50" height="50"/>
  <XCUIElementTypeButton name="dup" x="50" y="0" width="50" height="50"/>
</XCUIElementTypeApplication>`;
    const root = wdaSourceToUiNode(ambiguous);
    const xpaths = generateXpathCandidates(
      root,
      { x: 75, y: 25 },
      { textAttrs: ['name'], targetDescription: 'dup' },
    );
    expect(xpaths).toEqual([]);
  });

  it('keeps name as semantic text when WDA falls back to the label', () => {
    const root = wdaSourceToUiNode(`
      <XCUIElementTypeApplication x="0" y="0" width="100" height="100">
        <XCUIElementTypeButton name="Settings" label="Settings" x="0" y="0" width="50" height="50"/>
      </XCUIElementTypeApplication>
    `);
    const button = root.children[0];

    expect(button.attrs['accessibility-id']).toBeUndefined();
    expect(
      generateXpathCandidates(
        root,
        { x: 25, y: 25 },
        {
          stableAttrs: ['accessibility-id'],
          textAttrs: ['name', 'label'],
          targetDescription: 'open Settings',
        },
      )[0],
    ).toBe("//XCUIElementTypeButton[@name='Settings']");
  });

  it('throws on malformed XML', () => {
    expect(() => wdaSourceToUiNode('<root><a></root>')).toThrow();
  });
});
