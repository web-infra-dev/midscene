import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { ElementCacheFeature } from '@midscene/core';
import { TaskCache } from '@midscene/core/agent';
import type { UiNode } from '@midscene/core/device-cache';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import type ADB from 'appium-adb';
import { describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';
import { uiautomatorXmlToUiNode } from '../../src/uiautomator-tree';

const RUN_SMOKE =
  process.env.AI_TEST_TYPE === 'android' &&
  process.env.MIDSCENE_ANDROID_EMULATOR_CACHE_SMOKE === '1';
const TARGET_RESOURCE_ID = 'com.android.settings:id/search_action_bar_title';
const CACHE_PROMPT = 'the Search settings title';
const REPORT_FILE_NAME = 'android-emulator-cache-hit-report';
const RUN_DIR =
  process.env.MIDSCENE_RUN_DIR || resolve(process.cwd(), 'midscene_run');
const DIAGNOSTICS_DIR = join(RUN_DIR, 'diagnostics', 'android-emulator-cache');
const UI_DUMP_PATH = '/sdcard/midscene_cache_smoke_window_dump.xml';

vi.setConfig({ testTimeout: 240_000, hookTimeout: 30_000 });

function firstXpath(feature: ElementCacheFeature): string {
  if (!Array.isArray(feature.xpaths) || typeof feature.xpaths[0] !== 'string') {
    throw new Error('Android cache smoke did not generate an xpath feature');
  }
  return feature.xpaths[0];
}

function collectNodes(
  node: UiNode,
  predicate: (candidate: UiNode) => boolean,
  matches: UiNode[] = [],
): UiNode[] {
  if (predicate(node)) matches.push(node);
  for (const child of node.children) {
    collectNodes(child, predicate, matches);
  }
  return matches;
}

async function dumpUiautomatorXml(adb: ADB): Promise<string> {
  await adb.shell(`uiautomator dump --compressed ${UI_DUMP_PATH}`);
  const xml = await adb.shell(`cat ${UI_DUMP_PATH}`);
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new Error('Android emulator returned an empty uiautomator dump');
  }
  return xml;
}

async function waitForTarget(
  adb: ADB,
  devicePixelRatio: number,
): Promise<{ root: UiNode; target: UiNode; xml: string }> {
  const deadline = Date.now() + 30_000;
  let lastXml = '';
  let lastMatchCount = 0;
  while (Date.now() < deadline) {
    lastXml = await dumpUiautomatorXml(adb);
    const root = uiautomatorXmlToUiNode(lastXml, devicePixelRatio);
    const matches = collectNodes(
      root,
      (node) => node.attrs['resource-id'] === TARGET_RESOURCE_ID,
    );
    lastMatchCount = matches.length;
    if (matches.length === 1) {
      return { root, target: matches[0], xml: lastXml };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  writeFileSync(join(DIAGNOSTICS_DIR, 'uiautomator-last.xml'), lastXml);
  throw new Error(
    `Expected exactly one ${TARGET_RESOURCE_ID} node, found ${lastMatchCount}`,
  );
}

function saveScreenshot(base64: string): string {
  const screenshotFile = join(DIAGNOSTICS_DIR, 'android-emulator.png');
  const body = base64.replace(/^data:image\/\w+;base64,/, '');
  writeFileSync(screenshotFile, Buffer.from(body, 'base64'));
  return screenshotFile;
}

describe.runIf(RUN_SMOKE)('Android Emulator xpath cache smoke', () => {
  it('generates a Midscene report containing a real cache-hit locate', async () => {
    const devices = await getConnectedDevices();
    expect(devices).toHaveLength(1);

    const cacheDir = mkdtempSync(join(tmpdir(), 'midscene-android-cache-'));
    const cacheId = `android-emulator-${process.pid}`;
    const device = new AndroidDevice(devices[0].udid);
    let agent: AndroidAgent | undefined;

    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

    try {
      const adb = await device.connect();
      await adb.shell('settings put system font_scale 1.0');
      await adb.shell('am force-stop com.android.settings');
      await adb.shell('am start -W -n com.android.settings/.Settings');

      const logicalSize = await device.size();
      const density = (await adb.getScreenDensity()) ?? 160;
      const devicePixelRatio = density / 160;
      const { root, target, xml } = await waitForTarget(adb, devicePixelRatio);
      writeFileSync(join(DIAGNOSTICS_DIR, 'uiautomator.xml'), xml);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'uiautomator-tree.json'),
        JSON.stringify(root, null, 2),
      );
      expect(target.type).toBe('android.widget.TextView');
      expect(target.attrs['resource-id']).toBe(TARGET_RESOURCE_ID);
      expect(target.bounds.width).toBeGreaterThan(0);
      expect(target.bounds.height).toBeGreaterThan(0);

      const screenshot = await device.screenshotBase64();
      const screenshotSize = await imageInfoOfBase64(screenshot);
      const screenshotFile = saveScreenshot(screenshot);
      const screenshotScale = screenshotSize.width / logicalSize.width;
      expect(screenshotSize.height / logicalSize.height).toBeCloseTo(
        screenshotScale,
        1,
      );

      const center: [number, number] = [
        Math.round(target.bounds.left + target.bounds.width / 2),
        Math.round(target.bounds.top + target.bounds.height / 2),
      ];
      const screenshotCenter: [number, number] = [
        Math.round(center[0] * screenshotScale),
        Math.round(center[1] * screenshotScale),
      ];
      const feature = await device.cacheFeatureForPoint(center);
      const xpath = firstXpath(feature);
      expect(feature.target).toEqual({
        type: 'android.widget.TextView',
        attr: 'resource-id',
        value: TARGET_RESOURCE_ID,
      });
      expect(xpath).toBe(`//*[@resource-id='${TARGET_RESOURCE_ID}']`);
      expect(await device.rectMatchesCacheFeature(feature)).toEqual(
        target.bounds,
      );

      const cache = new TaskCache(cacheId, false, undefined, {
        writeOnly: true,
        cacheDir,
      });
      cache.appendCache({
        type: 'locate',
        prompt: CACHE_PROMPT,
        cache: feature,
      });

      agent = new AndroidAgent(device, {
        cache: { id: cacheId, strategy: 'read-only', cacheDir },
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'cache-smoke-must-not-call-model',
          MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
          MIDSCENE_MODEL_API_KEY: 'unused',
          MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1/v1',
        },
      });

      const located = await agent.aiLocate(CACHE_PROMPT);
      expect(located.center).toEqual(screenshotCenter);
      const dump = JSON.parse(agent.dumpDataString()) as {
        executions: Array<{
          tasks: Array<{ hitBy?: { from?: string } }>;
        }>;
      };
      const cacheHits = dump.executions.flatMap((execution) =>
        execution.tasks.filter((task) => task.hitBy?.from === 'Cache'),
      );
      expect(cacheHits).toHaveLength(1);

      await agent.destroy();
      const reportFile = agent.reportFile;
      expect(reportFile).toBeTruthy();
      expect(basename(reportFile!)).toBe(`${REPORT_FILE_NAME}.html`);
      expect(existsSync(reportFile!)).toBe(true);
      expect(readFileSync(reportFile!, 'utf8')).toContain('"from":"Cache"');

      const metadata = {
        deviceId: devices[0].udid,
        model: (await adb.shell('getprop ro.product.model')).trim(),
        apiLevel: (await adb.shell('getprop ro.build.version.sdk')).trim(),
        density,
        devicePixelRatio,
        logicalSize,
        screenshotSize,
        screenshotScale,
        target: feature.target,
        bounds: target.bounds,
        xpath,
        screenshotFile,
        reportFile,
      };
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'device-metadata.json'),
        JSON.stringify(metadata, null, 2),
      );
      console.log('[AndroidEmulatorCacheSmoke] hit', JSON.stringify(metadata));
    } finally {
      if (agent) {
        await agent.destroy();
      } else {
        await device.destroy();
      }
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
