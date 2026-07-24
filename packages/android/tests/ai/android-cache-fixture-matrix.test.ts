import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { ElementCacheFeature, Rect, Size } from '@midscene/core';
import { TaskCache } from '@midscene/core/agent';
import {
  generateXpathCacheFeature,
  isNativeXpathCacheEnabled,
  matchRectByXpathCache,
} from '@midscene/core/internal/device-cache';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice } from '../../src';
import { ANDROID_CACHE_CANDIDATE_OPTIONS } from '../../src/cache-policy';
import { uiautomatorXmlToUiNode } from '../../src/uiautomator-tree';
import { ANDROID_CACHE_COMPATIBILITY_FIXTURES } from '../fixtures/cache-compatibility/manifest';

const RUN_SMOKE =
  process.env.AI_TEST_TYPE === 'android' &&
  process.env.MIDSCENE_ANDROID_CACHE_FIXTURE_SMOKE === '1';
const REPORT_FILE_NAME = 'android-cache-fixture-matrix-report';
const RUN_DIR =
  process.env.MIDSCENE_RUN_DIR || resolve(process.cwd(), 'midscene_run');
const DIAGNOSTICS_DIR = join(
  RUN_DIR,
  'diagnostics',
  'android-cache-fixture-matrix',
);
const FIXTURE_DIR = resolve(__dirname, '../fixtures/cache-compatibility');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

function featureKey(feature: ElementCacheFeature): string {
  return JSON.stringify(feature.target);
}

async function fixtureScreenshot(): Promise<string> {
  const svg = `
    <svg width="400" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="800" fill="#f5f7fa"/>
      <rect x="20" y="60" width="360" height="60" rx="4" fill="#ffffff" stroke="#d5dbe3"/>
      <text x="40" y="98" font-family="Arial" font-size="20" fill="#28323d">Android fixture replay</text>
      <rect x="40" y="300" width="320" height="100" rx="4" fill="#1769e0"/>
      <text x="200" y="360" text-anchor="middle" font-family="Arial" font-size="20" fill="#ffffff">Cached target</text>
    </svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${image.toString('base64')}`;
}

class FixtureAndroidDevice extends AndroidDevice {
  constructor(
    private readonly replayRects: Map<string, Rect>,
    private readonly screenshot: string,
  ) {
    super('android-cache-fixture');
  }

  override async size(): Promise<Size> {
    return { width: 400, height: 800 };
  }

  override async screenshotBase64(): Promise<string> {
    return this.screenshot;
  }

  override async rectMatchesCacheFeature(
    feature: ElementCacheFeature,
  ): Promise<Rect> {
    const rect = this.replayRects.get(featureKey(feature));
    if (!rect) throw new Error('Fixture cache target was not registered');
    return rect;
  }

  override async destroy(): Promise<void> {}
}

describe.runIf(RUN_SMOKE)('Android cache compatibility report', () => {
  it('writes a Midscene report with one cache hit per framework fixture', async () => {
    expect(isNativeXpathCacheEnabled()).toBe(true);
    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    const cacheDir = mkdtempSync(join(tmpdir(), 'midscene-android-fixture-'));
    const cacheId = `android-fixture-${process.pid}`;
    const replayRects = new Map<string, Rect>();
    const cache = new TaskCache(cacheId, false, undefined, {
      writeOnly: true,
      cacheDir,
    });
    const matrix = [];

    for (const fixture of ANDROID_CACHE_COMPATIBILITY_FIXTURES) {
      const sourceXml = readFileSync(
        join(FIXTURE_DIR, fixture.sourceFile),
        'utf8',
      );
      const replayXml = readFileSync(
        join(FIXTURE_DIR, fixture.replayFile),
        'utf8',
      );
      const source = uiautomatorXmlToUiNode(sourceXml, 1);
      const replay = uiautomatorXmlToUiNode(replayXml, 1);
      const feature = generateXpathCacheFeature(
        source,
        fixture.sourcePoint,
        'android',
        {
          ...ANDROID_CACHE_CANDIDATE_OPTIONS,
          targetDescription: fixture.prompt,
        },
      );
      expect(feature).toBeDefined();
      expect(feature).toMatchObject({
        kind: 'native-xpath',
        schemaVersion: 1,
        platform: 'android',
      });

      const sourceMatch = matchRectByXpathCache(source, feature!, 'android');
      const replayMatch = matchRectByXpathCache(replay, feature!, 'android');
      expect(replayMatch.rect).toEqual(fixture.replayRect);
      expect(replayMatch.rect).not.toEqual(sourceMatch.rect);
      expect(
        generateXpathCacheFeature(source, fixture.safeMissPoint, 'android', {
          ...ANDROID_CACHE_CANDIDATE_OPTIONS,
          targetDescription: fixture.prompt,
        }),
      ).toBeUndefined();

      replayRects.set(featureKey(feature!), replayMatch.rect);
      cache.appendCache({
        type: 'locate',
        prompt: fixture.prompt,
        cache: feature!,
      });
      cpSync(
        join(FIXTURE_DIR, fixture.sourceFile),
        join(DIAGNOSTICS_DIR, fixture.sourceFile),
      );
      cpSync(
        join(FIXTURE_DIR, fixture.replayFile),
        join(DIAGNOSTICS_DIR, fixture.replayFile),
      );
      matrix.push({
        framework: fixture.framework,
        packageName: fixture.packageName,
        prompt: fixture.prompt,
        cacheKind: feature!.kind,
        cacheSchemaVersion: feature!.schemaVersion,
        cachePlatform: feature!.platform,
        target: feature!.target,
        xpaths: feature!.xpaths,
        xpathSources: feature!.xpathSources,
        sourceRect: sourceMatch.rect,
        replayRect: replayMatch.rect,
        safeMiss: true,
      });
    }

    const screenshot = await fixtureScreenshot();
    const device = new FixtureAndroidDevice(replayRects, screenshot);
    let agent: AndroidAgent | undefined;

    try {
      agent = new AndroidAgent(device, {
        cache: { id: cacheId, strategy: 'read-only', cacheDir },
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'fixture-cache-must-not-call-model',
          MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
          MIDSCENE_MODEL_API_KEY: 'unused',
          MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1/v1',
        },
      });

      for (const fixture of ANDROID_CACHE_COMPATIBILITY_FIXTURES) {
        const located = await agent.aiLocate(fixture.prompt);
        expect(located.rect).toEqual(fixture.replayRect);
        expect(located.center).toEqual([200, 350]);
      }

      const dump = JSON.parse(agent.dumpDataString()) as {
        executions: Array<{
          tasks: Array<{
            hitBy?: {
              from?: string;
              context?: { cacheEntry?: Record<string, unknown> };
            };
          }>;
        }>;
      };
      const cacheHits = dump.executions.flatMap((execution) =>
        execution.tasks.filter((task) => task.hitBy?.from === 'Cache'),
      );
      expect(cacheHits).toHaveLength(
        ANDROID_CACHE_COMPATIBILITY_FIXTURES.length,
      );
      for (const hit of cacheHits) {
        expect(hit.hitBy?.context?.cacheEntry).toMatchObject({
          kind: 'native-xpath',
          schemaVersion: 1,
          platform: 'android',
        });
      }

      await agent.destroy();
      const reportFile = agent.reportFile;
      expect(reportFile).toBeTruthy();
      expect(basename(reportFile!)).toBe(`${REPORT_FILE_NAME}.html`);
      expect(existsSync(reportFile!)).toBe(true);
      const reportHtml = readFileSync(reportFile!, 'utf8');
      expect(reportHtml).toContain('"from":"Cache"');
      expect(reportHtml).toContain('"kind":"native-xpath"');
      expect(reportHtml).toContain('"schemaVersion":1');
      expect(reportHtml).toContain('"platform":"android"');

      const rolloutGate = {
        status:
          cacheHits.length === matrix.length &&
          matrix.every((row) => row.safeMiss)
            ? 'pass'
            : 'fail',
        requirements: {
          requiredReplayHits: matrix.length,
          requiredSafeMisses: matrix.length,
          maxWrongClicks: 0,
        },
        actual: {
          replayHits: cacheHits.length,
          safeMisses: matrix.filter((row) => row.safeMiss).length,
          wrongClicks: 0,
        },
      };
      expect(rolloutGate.status).toBe('pass');

      writeFileSync(
        join(DIAGNOSTICS_DIR, 'compatibility-matrix.json'),
        `${JSON.stringify(
          {
            summary: {
              frameworks: matrix.length,
              generated: matrix.length,
              replayHits: cacheHits.length,
              safeMisses: matrix.filter((row) => row.safeMiss).length,
              wrongClicks: 0,
            },
            policyDecision: {
              ranking: [
                'resource-id',
                'content-desc',
                'text',
                'compound attributes',
                'stable ancestor scope',
                'identity-checked positional fallback',
              ],
              maxCandidates: ANDROID_CACHE_CANDIDATE_OPTIONS.max,
              decision: 'retain',
            },
            rolloutGate,
            reportFile,
            matrix,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'fixture-replay.png'),
        Buffer.from(
          screenshot.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        ),
      );
    } finally {
      if (agent) await agent.destroy();
      else await device.destroy();
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
