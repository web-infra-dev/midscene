import type { UIContext, UITreeSnapshot, UiNode } from '@midscene/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildUITreeViewModel,
  estimateUITreeCanvasWidth,
  hasUITreeView,
  searchUITreeViewModel,
} from './ui-tree-data';
import UITreeView, { UITreeNodeDetails } from './ui-tree-view';

const child: UiNode = {
  type: 'android.widget.Button',
  attrs: {
    'resource-id': 'com.example:id/submit',
    'content-desc': 'Submit form',
    enabled: 'true',
  },
  bounds: { left: 10, top: 20, width: 100, height: 40 },
  children: [],
};

const snapshot: UITreeSnapshot = {
  platform: 'android',
  capturedAt: 123,
  root: {
    type: 'android.widget.FrameLayout',
    attrs: {},
    bounds: { left: 0, top: 0, width: 200, height: 400 },
    children: [child],
  },
  xpathPolicy: {
    stableAttrs: ['resource-id'],
    textAttrs: ['content-desc', 'text'],
    excludedTargetTypes: ['android.webkit.WebView'],
    max: 3,
  },
};

describe('UI tree report data', () => {
  it('shows the UI Tree entry for either a snapshot or a capture error', () => {
    expect(hasUITreeView({ uiTree: snapshot } as UIContext)).toBe(true);
    expect(
      hasUITreeView({ uiTreeError: 'layout dump failed' } as UIContext),
    ).toBe(true);
    expect(hasUITreeView(undefined)).toBe(false);
    expect(hasUITreeView({} as UIContext)).toBe(false);
  });

  it('uses index paths as keys and expands only the root by default', () => {
    const model = buildUITreeViewModel(snapshot);

    expect(model.treeData[0].key).toBe('0');
    expect(model.treeData[0].children?.[0].key).toBe('0-0');
    expect(model.treeData[0].children?.[0].title).toContain(
      'com.example:id/submit',
    );
    expect(model.defaultExpandedKeys).toEqual(['0']);
    expect(model.nodeByKey.get('0-0')).toBe(child);
  });

  it('renders all selected-node attributes and bounds', () => {
    const html = renderToStaticMarkup(
      createElement(UITreeNodeDetails, { node: child }),
    );

    expect(html).toContain('com.example:id/submit');
    expect(html).toContain('Submit form');
    expect(html).toContain('enabled');
    expect(html).toContain('left');
    expect(html).toContain('100');
  });

  it('searches type and all attribute names and values case-insensitively', () => {
    const model = buildUITreeViewModel(snapshot);

    expect(searchUITreeViewModel(model, 'BUTTON submit').matchCount).toBe(1);
    expect(searchUITreeViewModel(model, 'enabled').matchCount).toBe(1);
    expect(searchUITreeViewModel(model, 'SUBMIT FORM').matchCount).toBe(1);
  });

  it('keeps matching ancestors and expands the path to search results', () => {
    const model = buildUITreeViewModel(snapshot);
    const result = searchUITreeViewModel(model, 'com.example:id/submit');

    expect(result.treeData).toHaveLength(1);
    expect(result.treeData[0].key).toBe('0');
    expect(result.treeData[0].children?.map((node) => node.key)).toEqual([
      '0-0',
    ]);
    expect(result.expandedKeys).toEqual(['0']);
    expect(result.matchCount).toBe(1);
  });

  it('restores the complete tree and default expansion for an empty query', () => {
    const model = buildUITreeViewModel(snapshot);
    const result = searchUITreeViewModel(model, '   ');

    expect(result.treeData).toBe(model.treeData);
    expect(result.expandedKeys).toEqual(['0']);
    expect(result.matchCount).toBe(model.nodeCount);
  });

  it('returns an empty tree when no node matches', () => {
    const model = buildUITreeViewModel(snapshot);
    const result = searchUITreeViewModel(model, 'does-not-exist');

    expect(result.treeData).toEqual([]);
    expect(result.expandedKeys).toEqual([]);
    expect(result.matchCount).toBe(0);
  });

  it('renders the uiTreeError state', () => {
    const html = renderToStaticMarkup(
      createElement(UITreeView, { error: 'layout dump failed' }),
    );

    expect(html).toContain('UI tree capture failed');
    expect(html).toContain('layout dump failed');
  });

  it('renders the UI tree search input', () => {
    const html = renderToStaticMarkup(createElement(UITreeView, { snapshot }));

    expect(html).toContain('Search class, attribute, or value');
    expect(html).toContain('aria-label="Search UI tree"');
  });

  it('renders a horizontal scroll viewport around the virtual tree', () => {
    const html = renderToStaticMarkup(createElement(UITreeView, { snapshot }));

    expect(html).toContain('ui-tree-horizontal-scroll');
    expect(html).toContain('ui-tree-scroll-content');
    expect(html).toContain('data-ui-tree-canvas-width');
  });

  it('keeps a stable horizontal canvas for deeply nested virtual rows', () => {
    let nestedNode = child;
    for (let depth = 0; depth < 24; depth++) {
      nestedNode = {
        type: 'android.view.ViewGroup',
        attrs: { 'content-desc': `nested-level-${depth}` },
        bounds: { left: 0, top: 0, width: 200, height: 400 },
        children: [nestedNode],
      };
    }
    const deepModel = buildUITreeViewModel({
      ...snapshot,
      root: nestedNode,
    });

    const shallowWidth = estimateUITreeCanvasWidth(
      buildUITreeViewModel(snapshot).treeData,
    );
    expect(shallowWidth).toBeGreaterThanOrEqual(640);
    expect(estimateUITreeCanvasWidth(deepModel.treeData)).toBeGreaterThan(
      shallowWidth,
    );
  });

  it('does not default-expand every node in a large tree', () => {
    const manyChildren = Array.from({ length: 2_000 }, (_, index) => ({
      type: 'android.widget.TextView',
      attrs: { text: `row-${index}` },
      bounds: { left: 0, top: index, width: 100, height: 1 },
      children: [],
    }));
    const model = buildUITreeViewModel({
      ...snapshot,
      root: { ...snapshot.root, children: manyChildren },
    });

    expect(model.nodeCount).toBe(2_001);
    expect(model.defaultExpandedKeys).toEqual(['0']);
    expect(model.defaultExpandedKeys).not.toHaveLength(model.nodeCount);
  });
});
