import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';
import {
  type WdaSourceNode,
  unwrapSourceEnvelope,
} from '../../src/ios-webdriver-client';
import {
  captureIOSUITree,
  countUiNodes,
  countWdaSourceNodes,
  wdaSourceToUiNode,
} from '../../src/ui-tree-capture';

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/wda-source.json'), 'utf8'),
) as { value: WdaSourceNode };

const root = unwrapSourceEnvelope(fixture);

describe('unwrapSourceEnvelope', () => {
  it('unwraps { value: node } envelope', () => {
    const node = unwrapSourceEnvelope({ value: root });
    expect(node.type).toBe('Application');
  });

  it('unwraps { value: { tree: node } } envelope', () => {
    const node = unwrapSourceEnvelope({ value: { tree: root } });
    expect(node.type).toBe('Application');
  });

  it('accepts a bare node', () => {
    const node = unwrapSourceEnvelope(root);
    expect(node.type).toBe('Application');
  });

  it('throws on an unrecognized shape', () => {
    expect(() => unwrapSourceEnvelope({ value: { unexpected: true } })).toThrow(
      /Unrecognized WDA/,
    );
    expect(() => unwrapSourceEnvelope(null)).toThrow(/Unrecognized WDA/);
  });
});

describe('wdaSourceToUiNode', () => {
  it('maps the root and keeps WDA logical-point bounds as-is', () => {
    const uiRoot = wdaSourceToUiNode(root);
    expect(uiRoot.type).toBe('Application');
    expect(uiRoot.bounds).toEqual({
      left: 0,
      top: 0,
      width: 393,
      height: 852,
    });
    // Root label is a whitespace-only string and must be trimmed away.
    expect(uiRoot.attrs.label).toBeUndefined();
  });

  it('maps attrs: label/name/value/enabled/visible/identifier', () => {
    const uiRoot = wdaSourceToUiNode(root);
    const save = findByLabel(uiRoot, 'Save');
    expect(save).toBeDefined();
    expect(save!.type).toBe('Button');
    expect(save!.attrs).toMatchObject({
      label: 'Save',
      name: 'Save',
      value: '1',
      enabled: 'true',
      visible: 'true',
      identifier: 'save-button',
    });
    expect(save!.bounds).toEqual({
      left: 20,
      top: 100,
      width: 100,
      height: 44,
    });
  });

  it('serializes boolean WDA values as strings', () => {
    const toggle = findByLabel(wdaSourceToUiNode(root), 'Airplane mode');
    expect(toggle!.attrs.value).toBe('false');
  });

  it('drops invisible leaves but keeps invisible containers with visible descendants', () => {
    const uiRoot = wdaSourceToUiNode(root);
    // Invisible leaf is pruned.
    expect(findByLabel(uiRoot, 'Decorative')).toBeUndefined();
    // Invisible container survives because its StaticText child is visible.
    const nested = findByLabel(uiRoot, 'Nested visible label');
    expect(nested).toBeDefined();
    expect(nested!.type).toBe('StaticText');
  });

  it('keeps invisible nodes when includeInvisible is true', () => {
    const uiRoot = wdaSourceToUiNode(root, { includeInvisible: true });
    expect(findByLabel(uiRoot, 'Decorative')).toBeDefined();
    expect(findByLabel(uiRoot, 'Nested visible label')).toBeDefined();
  });

  it('truncates at maxDepth (node kept, children dropped)', () => {
    const uiRoot = wdaSourceToUiNode(root, { maxDepth: 4 });
    // The deep chain: Application(0) > Window(1) > Main(2) > Deep chain(3) >
    // Level 1(4) — Level 1 is kept but its children are dropped.
    const level1 = findByLabel(uiRoot, 'Level 1');
    expect(level1).toBeDefined();
    expect(level1!.children).toHaveLength(0);
    expect(findByLabel(uiRoot, 'Level 2')).toBeUndefined();
  });

  it('falls back to zero bounds when rect is missing', () => {
    const noRect = findByLabel(wdaSourceToUiNode(root), 'No rect node');
    expect(noRect!.bounds).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it('prunes invisible nodes from the trimmed count', () => {
    const uiRoot = wdaSourceToUiNode(root);
    expect(countUiNodes(uiRoot)).toBeLessThan(countWdaSourceNodes(root));
  });
});

describe('captureIOSUITree', () => {
  it('captures an ios snapshot through the client', async () => {
    const client = {
      getAccessibilitySource: async () => root,
    } as any;
    const snapshot = await captureIOSUITree(client);
    expect(snapshot.platform).toBe('ios');
    expect(snapshot.capturedAt).toBeGreaterThan(0);
    expect(snapshot.root.type).toBe('Application');
  });

  it('passes pruning options through', async () => {
    const client = {
      getAccessibilitySource: async () => root,
    } as any;
    const pruned = await captureIOSUITree(client, { includeInvisible: false });
    const full = await captureIOSUITree(client, { includeInvisible: true });
    expect(countUiNodes(full.root)).toBeGreaterThan(countUiNodes(pruned.root));
  });
});

function findByLabel(
  node: { attrs: Record<string, string | undefined>; children?: any[] },
  label: string,
): any | undefined {
  if (node.attrs.label === label) return node;
  for (const child of node.children ?? []) {
    const found = findByLabel(child, label);
    if (found) return found;
  }
  return undefined;
}
