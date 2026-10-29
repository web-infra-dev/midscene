import { describe, expect, it } from '@rstest/core';
import { deepestElementAtPoint } from '../../src/extractor/shadow-dom';
import {
  buildShadowLocator,
  resolveShadowLocator,
  shadowLocatorPrefix,
} from '../../src/extractor/shadow-locator';

function element(tag: string, text = ''): Element {
  return {
    nodeType: 1,
    localName: tag,
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    textContent: text,
    children: [],
  } as unknown as Element;
}
function append(parent: Element | ShadowRoot, child: Element) {
  (parent.children as unknown as Element[]).push(child);
  Object.assign(child, {
    parentNode: parent,
    parentElement: 'host' in parent ? null : parent,
  });
}
function fixture() {
  const host = element('date-picker');
  const root = { host, children: [] } as unknown as ShadowRoot;
  Object.assign(host, { shadowRoot: root });
  const grid = element('div');
  const day15 = element('button', '15');
  const day16 = element('button', '16');
  append(root, grid);
  append(grid, day15);
  append(grid, day16);
  return { host, root, grid, day15, day16 };
}

describe('shadow cache paths', () => {
  it('distinguishes days and resolves text after sibling reordering', () => {
    const { root, grid, day15, day16 } = fixture();
    const first = buildShadowLocator(day15, root, 'host', false, true);
    const second = buildShadowLocator(day16, root, 'host', false, true);
    expect(first).not.toBe(second);
    (grid.children as unknown as Element[]).reverse();
    expect(resolveShadowLocator(first, () => root.host)).toBe(day15);
    expect(resolveShadowLocator(second, () => root.host)).toBe(day16);
  });
  it('rejects missing and ambiguous text instead of choosing another day', () => {
    const { root, grid, day15 } = fixture();
    const path = buildShadowLocator(day15, root, 'host', false, true);
    Object.assign(day15, { textContent: '17' });
    expect(resolveShadowLocator(path, () => root.host)).toBeNull();
    Object.assign(day15, { textContent: '15' });
    append(grid, element('button', '15'));
    expect(resolveShadowLocator(path, () => root.host)).toBeNull();
  });
  it('preserves positional semantics for order-sensitive requests', () => {
    const { root, grid, day15, day16 } = fixture();
    const path = buildShadowLocator(day15, root, 'host', true, true);
    (grid.children as unknown as Element[]).reverse();
    expect(resolveShadowLocator(path, () => root.host)).toBe(day16);
  });
  it('handles quoted text and locator separators without corrupting paths', () => {
    const { root, day15 } = fixture();
    Object.assign(day15, { textContent: 'A "quote" |shadow| |>>| /' });
    const path = buildShadowLocator(day15, root, 'host', false, true);
    expect(path).not.toContain('|shadow|');
    expect(path).not.toContain('|>>|');
    expect(resolveShadowLocator(path, () => root.host)).toBe(day15);
  });
  it('descends nested roots and refuses unresolved host hits', () => {
    const outer = element('outer');
    const inner = element('inner');
    const day = element('button', '15');
    Object.assign(outer, { shadowRoot: { elementFromPoint: () => inner } });
    Object.assign(inner, { shadowRoot: { elementFromPoint: () => day } });
    expect(deepestElementAtPoint(outer, 10, 20)).toBe(day);
    Object.assign(inner, { shadowRoot: { elementFromPoint: () => inner } });
    expect(deepestElementAtPoint(outer, 10, 20)).toBeNull();
    Object.assign(inner, { shadowRoot: { elementFromPoint: () => null } });
    expect(deepestElementAtPoint(outer, 10, 20)).toBeNull();
  });
});

describe('shadow locator validation', () => {
  it('rejects malformed serialized shapes with a useful error', () => {
    for (const payload of [
      null,
      {},
      {
        host: 'host',
        steps: [
          {
            tag: 'button',
            namespace: null,
            match: { kind: 'index', value: -1 },
          },
        ],
        text: null,
      },
    ]) {
      expect(() =>
        resolveShadowLocator(
          shadowLocatorPrefix + encodeURIComponent(JSON.stringify(payload)),
          () => null,
        ),
      ).toThrow('Invalid shadow locator');
    }
    expect(() =>
      resolveShadowLocator(`${shadowLocatorPrefix}%`, () => null),
    ).toThrow('Invalid encoded shadow locator');
  });
});
