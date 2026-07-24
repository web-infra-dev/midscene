// @vitest-environment jsdom

import type { UITreeSnapshot } from '@midscene/core';
import type { ChangeEventHandler, ReactNode } from 'react';
import { act, createElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@ant-design/icons', async () => {
  const React = await import('react');
  return { SearchOutlined: () => React.createElement('span') };
});

vi.mock('antd', async () => {
  const React = await import('react');

  interface MockTreeNode {
    key: string;
    title: string;
    children?: MockTreeNode[];
  }

  const flatten = (nodes: MockTreeNode[]): MockTreeNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);

  const Empty = ({ description }: { description?: ReactNode }) =>
    React.createElement('div', null, description);
  Object.assign(Empty, { PRESENTED_IMAGE_SIMPLE: 'simple' });

  return {
    Alert: ({
      message,
      description,
    }: {
      message?: ReactNode;
      description?: ReactNode;
    }) => React.createElement('div', null, message, description),
    Empty,
    Input: ({
      value,
      onChange,
      placeholder,
      'aria-label': ariaLabel,
    }: {
      value?: string;
      onChange?: ChangeEventHandler<HTMLInputElement>;
      placeholder?: string;
      'aria-label'?: string;
    }) =>
      React.createElement('input', {
        value,
        onChange,
        placeholder,
        'aria-label': ariaLabel,
      }),
    Tree: ({
      treeData,
      onSelect,
    }: {
      treeData: MockTreeNode[];
      onSelect?: (keys: Array<string | number>) => void;
    }) =>
      React.createElement(
        'div',
        { className: 'mock-tree' },
        flatten(treeData).map((node) =>
          React.createElement(
            'button',
            {
              key: node.key,
              type: 'button',
              'data-node-key': node.key,
              onClick: () => onSelect?.([node.key]),
            },
            node.title,
          ),
        ),
      ),
  };
});

import UITreeView from './ui-tree-view';

const snapshot: UITreeSnapshot = {
  platform: 'android',
  capturedAt: 123,
  root: {
    type: 'Window',
    attrs: {},
    bounds: { left: 0, top: 0, width: 200, height: 400 },
    children: [
      {
        type: 'android.widget.Button',
        attrs: {
          'resource-id': 'com.example:id/submit',
          text: 'Submit',
        },
        bounds: { left: 10, top: 20, width: 100, height: 40 },
        children: [],
      },
    ],
  },
  xpathPolicy: {
    stableAttrs: ['resource-id'],
    textAttrs: ['content-desc', 'text'],
    excludedTargetTypes: [],
    max: 3,
  },
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderTree() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(UITreeView, { snapshot })));
  return container;
}

describe('UI tree report interactions', () => {
  it('shows attributes and bounds after selecting a tree node', () => {
    const view = renderTree();
    const child = view.querySelector<HTMLButtonElement>(
      '[data-node-key="0-0"]',
    );
    expect(child).not.toBeNull();

    act(() => child?.click());

    expect(view.textContent).toContain('com.example:id/submit');
    expect(view.textContent).toContain('Bounds');
    expect(view.textContent).toContain('left');
    expect(view.textContent).toContain('100');
  });

  it('turns horizontal wheel input into viewport scrolling', () => {
    const view = renderTree();
    const viewport = view.querySelector<HTMLDivElement>(
      '.ui-tree-horizontal-scroll',
    );
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 1_000 },
    });
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 120,
    });

    viewport.dispatchEvent(wheel);

    expect(viewport.scrollLeft).toBe(120);
    expect(wheel.defaultPrevented).toBe(true);
  });
});
