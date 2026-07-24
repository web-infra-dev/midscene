import {
  type UiNode,
  generateXpathCacheFeature,
  matchRectByXpathCache,
} from '@/device-cache';
import { describe, expect, it } from 'vitest';

const bounds = (left: number, top: number, width = 100, height = 40) => ({
  left,
  top,
  width,
  height,
});

const node = (
  type: string,
  attrs: Record<string, string | undefined>,
  nodeBounds = bounds(0, 0, 400, 800),
  children: UiNode[] = [],
): UiNode => ({ type, attrs, bounds: nodeBounds, children });

const root = (children: UiNode[]) => node('Window', {}, undefined, children);

function featureFor(
  tree: UiNode,
  point: { x: number; y: number },
  options: {
    stableAttrs?: string[];
    textAttrs?: string[];
    targetDescription?: string;
  },
) {
  const feature = generateXpathCacheFeature(tree, point, 'android', options);
  if (!feature) throw new Error('Expected source tree to generate a feature');
  return feature;
}

describe('native xpath cache cross-state replay', () => {
  it('replays after an application restart when the stable target moved', () => {
    const source = root([
      node('Button', { id: 'login' }, bounds(20, 600, 160, 50)),
    ]);
    const feature = featureFor(
      source,
      { x: 100, y: 625 },
      { stableAttrs: ['id'] },
    );
    const replay = root([
      node('Button', { id: 'login' }, bounds(40, 520, 180, 54)),
    ]);

    expect(matchRectByXpathCache(replay, feature, 'android').rect).toEqual(
      bounds(40, 520, 180, 54),
    );
  });

  it('ignores sibling reorder when stable identity still resolves uniquely', () => {
    const source = root([
      node('Button', { id: 'cancel' }, bounds(20, 100)),
      node('Button', { id: 'save' }, bounds(140, 100)),
    ]);
    const feature = featureFor(
      source,
      { x: 180, y: 120 },
      { stableAttrs: ['id'] },
    );
    const replay = root([
      node('Button', { id: 'save' }, bounds(20, 160)),
      node('Button', { id: 'cancel' }, bounds(140, 160)),
    ]);

    expect(matchRectByXpathCache(replay, feature, 'android').rect).toEqual(
      bounds(20, 160),
    );
  });

  it('misses safely after localization changes a semantic-only identity', () => {
    const source = root([
      node('Text', { label: 'Settings' }, bounds(20, 80, 180, 40)),
    ]);
    const feature = featureFor(
      source,
      { x: 100, y: 100 },
      { textAttrs: ['label'], targetDescription: 'Settings' },
    );
    const replay = root([
      node('Text', { label: 'Parametres' }, bounds(20, 80, 180, 40)),
    ]);

    expect(() => matchRectByXpathCache(replay, feature, 'android')).toThrow(
      /cache target matched 0 node/,
    );
  });

  it('misses safely when a previously unique label becomes duplicated', () => {
    const source = root([node('Button', { label: 'More' }, bounds(20, 80))]);
    const feature = featureFor(
      source,
      { x: 60, y: 100 },
      { textAttrs: ['label'], targetDescription: 'More' },
    );
    const replay = root([
      node('Button', { label: 'More' }, bounds(20, 80)),
      node('Button', { label: 'More' }, bounds(20, 180)),
    ]);

    expect(() => matchRectByXpathCache(replay, feature, 'android')).toThrow(
      /cache target matched 2 node/,
    );
  });

  it('uses the current bounds after scrolling moves a stable target', () => {
    const source = root([
      node('Button', { id: 'download' }, bounds(20, 650, 180, 50)),
    ]);
    const feature = featureFor(
      source,
      { x: 100, y: 675 },
      { stableAttrs: ['id'] },
    );
    const replay = root([
      node('Button', { id: 'download' }, bounds(20, 220, 180, 50)),
    ]);

    expect(matchRectByXpathCache(replay, feature, 'android').rect).toEqual(
      bounds(20, 220, 180, 50),
    );
  });

  it('misses safely when an overlay duplicates the recorded identity', () => {
    const source = root([
      node('Button', { id: 'confirm' }, bounds(20, 600, 180, 50)),
    ]);
    const feature = featureFor(
      source,
      { x: 100, y: 625 },
      { stableAttrs: ['id'] },
    );
    const replay = root([
      node('Button', { id: 'confirm' }, bounds(20, 600, 180, 50)),
      node('Dialog', {}, bounds(0, 0, 400, 800), [
        node('Button', { id: 'confirm' }, bounds(100, 300, 180, 50)),
      ]),
    ]);

    expect(() => matchRectByXpathCache(replay, feature, 'android')).toThrow(
      /cache target matched 2 node/,
    );
  });
});
