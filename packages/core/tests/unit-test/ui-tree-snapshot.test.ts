import { pruneUITreeSnapshotToTarget } from '@/agent/ui-tree-snapshot';
import type { UITreeSnapshot, UiNode } from '@/types';
import { describe, expect, it } from 'vitest';

const node = (
  type: string,
  attrs: Record<string, string | undefined>,
  bounds: { left: number; top: number; width: number; height: number },
  children: UiNode[] = [],
): UiNode => ({ type, attrs, bounds, children });

const policy = {
  stableAttrs: ['resource-id'],
  textAttrs: ['content-desc', 'text'],
  excludedTargetTypes: ['android.webkit.WebView'],
  max: 5,
};

describe('pruneUITreeSnapshotToTarget', () => {
  it('keeps only the target lineage and stops at the nearest resource-id ancestor', () => {
    const target = node(
      'android.widget.TextView',
      { text: 'Pay now', index: '2' },
      { left: 40, top: 40, width: 80, height: 40 },
    );
    const snapshot: UITreeSnapshot = {
      platform: 'android',
      capturedAt: 123,
      xpathPolicy: policy,
      root: node('Window', {}, { left: 0, top: 0, width: 500, height: 500 }, [
        node(
          'Page',
          { 'resource-id': 'page-root' },
          { left: 0, top: 0, width: 500, height: 500 },
          [
            node(
              'Card',
              { 'resource-id': 'wallet-card' },
              { left: 20, top: 20, width: 200, height: 120 },
              [
                node(
                  'IgnoredSibling',
                  {},
                  { left: 20, top: 20, width: 10, height: 10 },
                ),
                target,
              ],
            ),
            node(
              'IgnoredBranch',
              {},
              { left: 300, top: 20, width: 100, height: 100 },
            ),
          ],
        ),
      ]),
    };

    const pruned = pruneUITreeSnapshotToTarget(snapshot, { x: 60, y: 60 });

    expect(pruned.capturedAt).toBe(123);
    expect(pruned.root.attrs['resource-id']).toBe('wallet-card');
    expect(pruned.root.children).toHaveLength(1);
    expect(pruned.root.children[0]).toMatchObject({
      type: 'android.widget.TextView',
      attrs: { text: 'Pay now', index: '2' },
      children: [],
    });
  });

  it('retains the original root when no node in the lineage has a resource-id', () => {
    const snapshot: UITreeSnapshot = {
      platform: 'android',
      capturedAt: 1,
      xpathPolicy: policy,
      root: node('Window', {}, { left: 0, top: 0, width: 100, height: 100 }, [
        node(
          'Button',
          { text: 'Continue' },
          { left: 10, top: 10, width: 50, height: 30 },
        ),
      ]),
    };

    expect(
      pruneUITreeSnapshotToTarget(snapshot, { x: 20, y: 20 }).root,
    ).toMatchObject({
      type: 'Window',
      children: [{ type: 'Button', attrs: { text: 'Continue' }, children: [] }],
    });
  });

  it('keeps the nearest id ancestor as context when the target has its own id', () => {
    const snapshot: UITreeSnapshot = {
      platform: 'android',
      capturedAt: 1,
      xpathPolicy: policy,
      root: node('Window', {}, { left: 0, top: 0, width: 100, height: 100 }, [
        node(
          'Toolbar',
          { 'resource-id': 'toolbar' },
          { left: 0, top: 0, width: 100, height: 50 },
          [
            node(
              'Button',
              { 'resource-id': 'search' },
              { left: 50, top: 0, width: 50, height: 50 },
            ),
          ],
        ),
      ]),
    };

    const pruned = pruneUITreeSnapshotToTarget(snapshot, { x: 75, y: 25 });

    expect(pruned.root).toMatchObject({
      type: 'Toolbar',
      attrs: { 'resource-id': 'toolbar' },
      children: [
        {
          type: 'Button',
          attrs: { 'resource-id': 'search' },
          children: [],
        },
      ],
    });
  });

  it('uses the located rect to avoid promoting a smaller child at the center point', () => {
    const snapshot: UITreeSnapshot = {
      platform: 'android',
      capturedAt: 1,
      xpathPolicy: policy,
      root: node('Window', {}, { left: 0, top: 0, width: 200, height: 100 }, [
        node(
          'Button',
          { 'resource-id': 'checkout' },
          { left: 20, top: 20, width: 120, height: 60 },
          [
            node(
              'TextView',
              { text: 'Pay' },
              { left: 60, top: 35, width: 30, height: 20 },
            ),
          ],
        ),
      ]),
    };

    const pruned = pruneUITreeSnapshotToTarget(
      snapshot,
      { x: 75, y: 45 },
      { left: 20, top: 20, width: 120, height: 60 },
    );

    expect(pruned.root.children[0]).toMatchObject({
      type: 'Button',
      attrs: { 'resource-id': 'checkout' },
      children: [],
    });
  });
});
