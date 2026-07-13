import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDumpScript } from '@midscene/core';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_RETRY_COUNT,
  MIDSCENE_MODEL_TIMEOUT,
} from '@midscene/shared/env';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import type ADB from 'appium-adb';
import { describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';

const RUN_LIVE_SMOKE =
  process.env.AI_TEST_TYPE === 'android' &&
  process.env.MIDSCENE_ANDROID_EMULATOR_SMOKE === '1';
const REPORT_FILE_NAME = 'android-emulator-smoke';
const REPORT_HTML_FILE_NAME = `${REPORT_FILE_NAME}.html`;
const UI_DUMP_PATH = '/sdcard/midscene_emulator_smoke_window_dump.xml';
const SETTINGS_SEARCH_BAR_ID = 'com.android.settings:id/search_action_bar';
const SETTINGS_SEARCH_INPUT_IDS = [
  'android:id/search_src_text',
  'com.android.settings:id/search_src_text',
] as const;
const POLL_INTERVAL_MS = 500;
const TARGET_TIMEOUT_MS = 30_000;

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ReportTask {
  type?: string;
  subType?: string;
  hitBy?: { from?: string };
  timing?: { callAiStart?: number; callAiEnd?: number };
  usage?: unknown;
  searchAreaUsage?: unknown;
}

interface ReportExecution {
  id?: string;
  name?: string;
  tasks?: ReportTask[];
}

interface ReportDump {
  executions?: ReportExecution[];
}

vi.setConfig({ testTimeout: 240_000, hookTimeout: 30_000 });

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

async function dumpUiautomatorXml(adb: ADB): Promise<string> {
  await adb.shell(`uiautomator dump --compressed ${UI_DUMP_PATH}`);
  const xml = await adb.shell(`cat ${UI_DUMP_PATH}`);
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new Error('Android emulator returned an empty uiautomator dump');
  }
  return xml;
}

function boundsForResourceId(xml: string, resourceId: string): Bounds[] {
  const nodeTags = xml.match(/<node\b[^>]*>/g) ?? [];
  const resourceAttribute = `resource-id="${resourceId}"`;
  return nodeTags
    .filter((tag) => tag.includes(resourceAttribute))
    .map((tag) => {
      const boundsMatch = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag);
      if (!boundsMatch) {
        throw new Error(`Missing bounds for Android resource ${resourceId}`);
      }
      const left = Number(boundsMatch[1]);
      const top = Number(boundsMatch[2]);
      const right = Number(boundsMatch[3]);
      const bottom = Number(boundsMatch[4]);
      if (right <= left || bottom <= top) {
        throw new Error(
          `Invalid bounds for Android resource ${resourceId}: ${boundsMatch[0]}`,
        );
      }
      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
      };
    });
}

async function waitForResource(
  adb: ADB,
  resourceIds: readonly string[],
): Promise<{ resourceId: string; bounds: Bounds; xml: string }> {
  const deadline = Date.now() + TARGET_TIMEOUT_MS;
  let lastXml = '';
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      lastXml = await dumpUiautomatorXml(adb);
      for (const resourceId of resourceIds) {
        const matches = boundsForResourceId(lastXml, resourceId);
        if (matches.length === 1) {
          return { resourceId, bounds: matches[0], xml: lastXml };
        }
        if (matches.length > 1) {
          lastError = new Error(
            `Expected one ${resourceId}, found ${matches.length}`,
          );
        }
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out waiting for Android resources ${resourceIds.join(', ')}. Last error: ${String(lastError)}. Last XML length: ${lastXml.length}`,
  );
}

function locate(bounds: Bounds, prompt: string) {
  return {
    prompt,
    locatedPixelBbox: [
      bounds.left,
      bounds.top,
      bounds.left + bounds.width,
      bounds.top + bounds.height,
    ] as [number, number, number, number],
  };
}

function screenshotBuffer(base64: string): Buffer {
  const match = /^data:image\/\w+;base64,(.+)$/s.exec(base64);
  if (!match) {
    throw new Error('Android emulator screenshot is not a base64 data URL');
  }
  return Buffer.from(match[1], 'base64');
}

function parseReportDumps(html: string): ReportDump[] {
  const marker = '<script type="midscene_web_dump"';
  const closeTag = '</script>';
  const dumps: ReportDump[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const openIndex = html.indexOf(marker, cursor);
    if (openIndex === -1) break;
    const closeIndex = html.indexOf(closeTag, openIndex);
    if (closeIndex === -1) break;
    const prefix = html.slice(0, closeIndex + closeTag.length);
    try {
      const parsed = JSON.parse(parseDumpScript(prefix)) as ReportDump;
      if (Array.isArray(parsed.executions)) {
        dumps.push(parsed);
      }
    } catch {
      // The report bundle contains the marker as source text; ignore it.
    }
    cursor = closeIndex + closeTag.length;
  }

  return dumps;
}

function latestExecutions(dumps: ReportDump[]): ReportExecution[] {
  const byKey = new Map<string, ReportExecution>();
  let anonymousIndex = 0;
  for (const dump of dumps) {
    for (const execution of dump.executions ?? []) {
      const key =
        execution.id || execution.name || `anonymous-${anonymousIndex++}`;
      byKey.set(key, execution);
    }
  }
  return Array.from(byKey.values());
}

describe.skipIf(!RUN_LIVE_SMOKE)('Android Emulator live smoke', () => {
  it('drives AOSP Settings without calling a model and emits evidence', async () => {
    const diagnosticsEnv = process.env.MIDSCENE_ANDROID_DIAGNOSTICS_DIR;
    if (!diagnosticsEnv) {
      throw new Error(
        'MIDSCENE_ANDROID_DIAGNOSTICS_DIR is required for the Android emulator smoke',
      );
    }

    const diagnosticsDir = path.resolve(diagnosticsEnv);
    const initialXmlFile = path.join(diagnosticsDir, 'settings-initial.xml');
    const searchXmlFile = path.join(diagnosticsDir, 'settings-search.xml');
    const finalXmlFile = path.join(diagnosticsDir, 'settings-final.xml');
    const screenshotFile = path.join(diagnosticsDir, 'settings-search.png');
    const dumpFile = path.join(diagnosticsDir, 'agent-dump.json');
    const evidenceFile = path.join(diagnosticsDir, 'evidence.json');
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', REPORT_HTML_FILE_NAME);

    let device: AndroidDevice | undefined;
    let agent: AndroidAgent | undefined;
    const evidence: Record<string, unknown> = {
      platform: process.platform,
      diagnosticsDir,
      reportFile,
    };

    await mkdir(diagnosticsDir, { recursive: true });
    await rm(reportFile, { force: true });

    try {
      const devices = await getConnectedDevices();
      expect(devices).toHaveLength(1);
      evidence.connectedDevice = devices[0];

      device = new AndroidDevice(devices[0].udid);
      const adb = await device.connect();
      await adb.shell('settings put system font_scale 1.0');
      await adb.shell('am force-stop com.android.settings');
      await adb.shell('am start -W -n com.android.settings/.Settings');

      const logicalSize = await device.size();
      const screenshot = await device.screenshotBase64();
      const screenshotSize = await imageInfoOfBase64(screenshot);
      const density = await adb.getScreenDensity();
      evidence.device = {
        id: devices[0].udid,
        model: (await adb.shell('getprop ro.product.model')).trim(),
        apiLevel: (await adb.shell('getprop ro.build.version.sdk')).trim(),
        density,
        logicalSize,
        screenshotSize,
      };
      expect(logicalSize.width).toBeGreaterThan(0);
      expect(logicalSize.height).toBeGreaterThan(0);
      expect(screenshotSize.width).toBeGreaterThan(logicalSize.width);
      expect(screenshotSize.height).toBeGreaterThan(logicalSize.height);

      const initialTarget = await waitForResource(adb, [
        SETTINGS_SEARCH_BAR_ID,
      ]);
      await writeFile(initialXmlFile, initialTarget.xml, 'utf8');

      agent = new AndroidAgent(device, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'android-ci-model-must-not-run',
          [MIDSCENE_MODEL_API_KEY]: 'android-ci-unused-key',
          [MIDSCENE_MODEL_BASE_URL]: 'http://127.0.0.1:1/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
          [MIDSCENE_MODEL_TIMEOUT]: '1000',
          [MIDSCENE_MODEL_RETRY_COUNT]: '0',
        },
        groupName: 'Android Emulator live smoke',
        groupDescription:
          'Deterministic AOSP Settings input and screenshot validation on GitHub Actions',
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        generateReport: true,
        waitAfterAction: 200,
      });

      await agent.callActionInActionSpace('Tap', {
        locate: locate(initialTarget.bounds, 'Settings search bar'),
      });
      const searchInput = await waitForResource(adb, SETTINGS_SEARCH_INPUT_IDS);

      await agent.callActionInActionSpace('Input', {
        value: 'wifi',
        mode: 'replace',
        autoDismissKeyboard: true,
        locate: locate(searchInput.bounds, 'Settings search input'),
      });
      const searchState = await waitForResource(adb, SETTINGS_SEARCH_INPUT_IDS);
      expect(searchState.xml).toMatch(/text="wifi"/i);
      await writeFile(searchXmlFile, searchState.xml, 'utf8');

      const searchScreenshot = await device.screenshotBase64();
      await writeFile(screenshotFile, screenshotBuffer(searchScreenshot));

      await agent.back();
      const finalTarget = await waitForResource(adb, [SETTINGS_SEARCH_BAR_ID]);
      await writeFile(finalXmlFile, finalTarget.xml, 'utf8');

      const dump = JSON.parse(agent.dumpDataString()) as ReportDump;
      await writeFile(dumpFile, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
      const dumpTasks = (dump.executions ?? []).flatMap(
        (execution) => execution.tasks ?? [],
      );
      const locateTasks = dumpTasks.filter(
        (task) => task.type === 'Planning' && task.subType === 'Locate',
      );
      expect(locateTasks).toHaveLength(2);
      expect(locateTasks.every((task) => task.hitBy?.from === 'Plan')).toBe(
        true,
      );
      expect(agent.metrics.calls).toBe(0);
      expect(
        dumpTasks.some(
          (task) =>
            task.timing?.callAiStart !== undefined ||
            task.timing?.callAiEnd !== undefined ||
            task.usage !== undefined ||
            task.searchAreaUsage !== undefined,
        ),
      ).toBe(false);

      await agent.destroy();
      expect(agent.reportFile).toBe(reportFile);
      const reportHtml = await readFile(reportFile, 'utf8');
      expect(reportHtml).not.toContain('REPLACE_ME_WITH_REPORT_HTML');
      const reportTasks = latestExecutions(
        parseReportDumps(reportHtml),
      ).flatMap((execution) => execution.tasks ?? []);
      const reportLocateTasks = reportTasks.filter(
        (task) => task.type === 'Planning' && task.subType === 'Locate',
      );
      expect(reportLocateTasks).toHaveLength(2);
      expect(
        reportLocateTasks.every((task) => task.hitBy?.from === 'Plan'),
      ).toBe(true);
      for (const action of ['Tap', 'Input', 'AndroidBackButton']) {
        expect(
          reportTasks.some(
            (task) => task.type === 'Action Space' && task.subType === action,
          ),
        ).toBe(true);
      }
      evidence.report = {
        path: reportFile,
        modelCalls: agent.metrics.calls,
        locateHitSources: reportLocateTasks.map((task) => task.hitBy?.from),
      };
    } catch (error) {
      evidence.error =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error);
      throw error;
    } finally {
      if (agent) {
        await agent.destroy().catch((error) => {
          evidence.agentDestroyError = String(error);
        });
      } else if (device) {
        await device.destroy().catch((error) => {
          evidence.deviceDestroyError = String(error);
        });
      }
      await writeFile(
        evidenceFile,
        `${JSON.stringify(evidence, null, 2)}\n`,
        'utf8',
      );
    }
  });
});
