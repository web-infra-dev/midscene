import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateXpathCacheFeature,
  matchRectByXpathCache,
} from '@midscene/core/internal/device-cache';
import { describe, expect, it } from 'vitest';
import { ANDROID_CACHE_CANDIDATE_OPTIONS } from '../../src/cache-policy';
import { uiautomatorXmlToUiNode } from '../../src/uiautomator-tree';
import { ANDROID_CACHE_COMPATIBILITY_FIXTURES } from '../fixtures/cache-compatibility/manifest';

const FIXTURE_DIR = join(__dirname, '../fixtures/cache-compatibility');

function readTree(fileName: string) {
  return uiautomatorXmlToUiNode(
    readFileSync(join(FIXTURE_DIR, fileName), 'utf8'),
    1,
  );
}

describe('Android cache compatibility fixture matrix', () => {
  it.each(ANDROID_CACHE_COMPATIBILITY_FIXTURES)(
    '$framework replays the same semantic element after it moves',
    (fixture) => {
      const source = readTree(fixture.sourceFile);
      const replay = readTree(fixture.replayFile);
      const feature = generateXpathCacheFeature(
        source,
        fixture.sourcePoint,
        'android',
        ANDROID_CACHE_CANDIDATE_OPTIONS,
      );

      expect(feature).toBeDefined();
      expect(feature?.xpaths).toHaveLength(feature?.xpathSources?.length ?? 0);
      expect(feature?.xpaths.length).toBeLessThanOrEqual(3);
      expect(matchRectByXpathCache(replay, feature!, 'android')).toMatchObject({
        rect: fixture.replayRect,
      });
    },
  );

  it.each(ANDROID_CACHE_COMPATIBILITY_FIXTURES)(
    '$framework safely skips duplicated semantic labels',
    (fixture) => {
      const source = readTree(fixture.sourceFile);
      expect(
        generateXpathCacheFeature(
          source,
          fixture.safeMissPoint,
          'android',
          ANDROID_CACHE_CANDIDATE_OPTIONS,
        ),
      ).toBeUndefined();
    },
  );

  it('does not cache a WebView shell when its inner control is unexposed', () => {
    const source = readTree('webview.source.xml');
    expect(
      generateXpathCacheFeature(
        source,
        { x: 10, y: 300 },
        'android',
        ANDROID_CACHE_CANDIDATE_OPTIONS,
      ),
    ).toBeUndefined();
  });
});
