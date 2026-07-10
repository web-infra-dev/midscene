import { type ChildProcess, spawn } from 'node:child_process';
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
import { cropByRect, imageInfoOfBase64 } from '@midscene/shared/img';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ComputerAgent } from '../../src/agent';
import { ComputerDevice } from '../../src/device';
import { readWindowsAccessibilityTree } from '../../src/windows-accessibility-tree';

const RUN_SMOKE =
  process.platform === 'win32' &&
  process.env.MIDSCENE_WINDOWS_ACCESSIBILITY_CACHE_SMOKE === '1';
const TARGET_NAME = 'Midscene Cache Target';
const TARGET_ID = 'cache_target_button';
const CACHE_PROMPT = `the button labeled "${TARGET_NAME}"`;
const REPORT_FILE_NAME = 'windows-accessibility-cache-hit-report';
const FIXTURE_PATH = resolve(
  __dirname,
  'fixtures/windows-accessibility-cache-app.ps1',
);
const RUN_DIR =
  process.env.MIDSCENE_RUN_DIR || resolve(process.cwd(), 'midscene_run');
const DIAGNOSTICS_DIR = join(RUN_DIR, 'diagnostics', 'windows-cache');

interface FixtureMetadata {
  processId: number;
  sessionId: number;
  userInteractive: boolean;
  windowHandle: number;
  buttonHandle: number;
  accessibilityObjectType: string;
  dpiX: number;
  dpiY: number;
  screenBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  buttonBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

vi.setConfig({ testTimeout: 180_000, hookTimeout: 30_000 });

let fixtureProcess: ChildProcess | undefined;
let fixtureOutput = '';

function firstXpath(feature: ElementCacheFeature): string {
  if (!Array.isArray(feature.xpaths) || typeof feature.xpaths[0] !== 'string') {
    throw new Error('Windows cache smoke did not generate an xpath feature');
  }
  return feature.xpaths[0];
}

function findNode(
  node: UiNode,
  predicate: (candidate: UiNode) => boolean,
): UiNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return undefined;
}

function assertFixtureMetadata(value: FixtureMetadata): void {
  if (
    !Number.isSafeInteger(value.processId) ||
    !Number.isSafeInteger(value.sessionId) ||
    typeof value.userInteractive !== 'boolean' ||
    !Number.isSafeInteger(value.windowHandle) ||
    value.windowHandle <= 0 ||
    !Number.isSafeInteger(value.buttonHandle) ||
    value.buttonHandle <= 0 ||
    typeof value.accessibilityObjectType !== 'string' ||
    value.accessibilityObjectType.length === 0 ||
    !Number.isFinite(value.dpiX) ||
    !Number.isFinite(value.dpiY) ||
    !Number.isFinite(value.screenBounds?.width) ||
    !Number.isFinite(value.screenBounds?.height) ||
    !Number.isFinite(value.buttonBounds?.width) ||
    !Number.isFinite(value.buttonBounds?.height)
  ) {
    throw new Error(
      `Windows cache fixture returned invalid metadata: ${JSON.stringify(value)}`,
    );
  }
}

function fixtureExited(): boolean {
  return fixtureProcess !== undefined && fixtureProcess.exitCode !== null;
}

function startFixture(readyFile: string): void {
  fixtureProcess = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      FIXTURE_PATH,
      '-ReadyFile',
      readyFile,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  fixtureProcess.stdout?.on('data', (chunk: Buffer) => {
    fixtureOutput += chunk.toString('utf8');
  });
  fixtureProcess.stderr?.on('data', (chunk: Buffer) => {
    fixtureOutput += chunk.toString('utf8');
  });
  fixtureProcess.on('error', (error) => {
    fixtureOutput += `Fixture process error: ${error}\n`;
  });
}

function stopFixture(): void {
  if (fixtureProcess && fixtureProcess.exitCode === null) {
    fixtureProcess.kill();
  }
}

async function waitForFixture(readyFile: string): Promise<FixtureMetadata> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureExited()) {
      throw new Error(
        `Windows accessibility fixture exited early (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    if (existsSync(readyFile)) {
      try {
        const metadata = JSON.parse(
          readFileSync(readyFile, 'utf8').replace(/^\uFEFF/, ''),
        ) as FixtureMetadata;
        assertFixtureMetadata(metadata);
        return metadata;
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(
    `Timed out waiting for Windows fixture metadata. Last error: ${lastError}. Output:\n${fixtureOutput}`,
  );
}

function treeSummary(root: UiNode): Array<{
  depth: number;
  type: string;
  attrs: UiNode['attrs'];
  childCount: number;
}> {
  const summary: Array<{
    depth: number;
    type: string;
    attrs: UiNode['attrs'];
    childCount: number;
  }> = [];
  const visit = (node: UiNode, depth: number): void => {
    summary.push({
      depth,
      type: node.type,
      attrs: node.attrs,
      childCount: node.children.length,
    });
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return summary;
}

async function waitForTargetNode(fixture: FixtureMetadata): Promise<{
  root: UiNode;
  target: UiNode;
}> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  let lastWindowRoot: UiNode | undefined;
  let lastButtonRoot: UiNode | undefined;
  while (Date.now() < deadline) {
    if (fixtureExited()) {
      throw new Error(
        `Windows accessibility fixture exited early (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    try {
      const root = await readWindowsAccessibilityTree({
        windowHandle: fixture.windowHandle,
      });
      lastWindowRoot = root;
      const target = findNode(
        root,
        (node) =>
          node.attrs.AutomationId === TARGET_ID ||
          node.attrs.Name === TARGET_NAME,
      );
      if (target) return { root, target };
      if (!lastButtonRoot) {
        lastButtonRoot = await readWindowsAccessibilityTree({
          windowHandle: fixture.buttonHandle,
        });
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  if (lastWindowRoot) {
    writeFileSync(
      join(DIAGNOSTICS_DIR, 'uia-window-tree-last.json'),
      JSON.stringify(lastWindowRoot, null, 2),
    );
  }
  if (lastButtonRoot) {
    writeFileSync(
      join(DIAGNOSTICS_DIR, 'uia-button-tree-last.json'),
      JSON.stringify(lastButtonRoot, null, 2),
    );
  }
  throw new Error(
    `Timed out waiting for WinForms target in UIA tree. Last error: ${lastError}. Window tree: ${JSON.stringify(lastWindowRoot ? treeSummary(lastWindowRoot) : null)}. Button tree: ${JSON.stringify(lastButtonRoot ? treeSummary(lastButtonRoot) : null)}. Output:\n${fixtureOutput}`,
  );
}

function saveScreenshot(base64: string): string {
  const screenshotFile = join(DIAGNOSTICS_DIR, 'windows-desktop.png');
  const body = base64.replace(/^data:image\/\w+;base64,/, '');
  writeFileSync(screenshotFile, Buffer.from(body, 'base64'));
  return screenshotFile;
}

afterAll(() => {
  stopFixture();
});

describe.runIf(RUN_SMOKE)('Windows UIA xpath cache smoke', () => {
  it('generates a Midscene report containing a real cache-hit locate', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'midscene-windows-cache-'));
    const fixtureDir = mkdtempSync(join(tmpdir(), 'midscene-winforms-'));
    const readyFile = join(fixtureDir, 'ready.json');
    const cacheId = `windows-accessibility-${process.pid}`;
    const device = new ComputerDevice({ headless: false });
    let agent: ComputerAgent<ComputerDevice> | undefined;

    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

    try {
      startFixture(readyFile);
      const fixture = await waitForFixture(readyFile);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'fixture-metadata.json'),
        JSON.stringify(fixture, null, 2),
      );
      expect(fixture.userInteractive).toBe(true);
      expect(fixture.dpiX).toBeCloseTo(96, 0);
      expect(fixture.dpiY).toBeCloseTo(96, 0);

      const { root, target } = await waitForTargetNode(fixture);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'uia-tree.json'),
        JSON.stringify(root, null, 2),
      );
      expect(target.attrs.Name).toBe(TARGET_NAME);
      expect(target.attrs.AutomationId).toBeUndefined();
      expect(target.bounds.width).toBeGreaterThan(0);
      expect(target.bounds.height).toBeGreaterThan(0);
      expect(
        Math.abs(target.bounds.left - fixture.buttonBounds.left),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(target.bounds.top - fixture.buttonBounds.top),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(target.bounds.width - fixture.buttonBounds.width),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(target.bounds.height - fixture.buttonBounds.height),
      ).toBeLessThanOrEqual(2);

      await device.connect();
      const screenshot = await device.screenshotBase64();
      const screenshotSize = await imageInfoOfBase64(screenshot);
      const screenshotFile = saveScreenshot(screenshot);
      expect(screenshotSize.width).toBe(fixture.screenBounds.width);
      expect(screenshotSize.height).toBe(fixture.screenBounds.height);
      expect(target.bounds.left).toBeGreaterThanOrEqual(0);
      expect(target.bounds.top).toBeGreaterThanOrEqual(0);
      expect(target.bounds.left + target.bounds.width).toBeLessThanOrEqual(
        screenshotSize.width,
      );
      expect(target.bounds.top + target.bounds.height).toBeLessThanOrEqual(
        screenshotSize.height,
      );
      const cropSize = {
        width: Math.max(1, Math.round(target.bounds.width)),
        height: Math.max(1, Math.round(target.bounds.height)),
      };
      const [targetCrop, backgroundCrop] = await Promise.all([
        cropByRect(screenshot, {
          left: Math.round(target.bounds.left),
          top: Math.round(target.bounds.top),
          ...cropSize,
        }),
        cropByRect(screenshot, {
          left: 20,
          top: 20,
          ...cropSize,
        }),
      ]);
      expect(targetCrop.imageBase64).not.toBe(backgroundCrop.imageBase64);

      const center: [number, number] = [
        Math.round(target.bounds.left + target.bounds.width / 2),
        Math.round(target.bounds.top + target.bounds.height / 2),
      ];
      const feature = await device.cacheFeatureForPoint(center);
      const xpath = firstXpath(feature);
      expect(feature.target).toMatchObject({
        type: target.type,
        attr: 'Name',
        value: TARGET_NAME,
      });
      expect(xpath).toBe(`//${target.type}[@Name='${TARGET_NAME}']`);

      const cache = new TaskCache(cacheId, false, undefined, {
        writeOnly: true,
        cacheDir,
      });
      cache.appendCache({
        type: 'locate',
        prompt: CACHE_PROMPT,
        cache: feature,
      });

      agent = new ComputerAgent(device, {
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
      expect(located.center).toEqual(center);
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

      console.log(
        '[WindowsCacheSmoke] hit',
        JSON.stringify({
          xpath,
          target: feature.target,
          bounds: target.bounds,
          screenshotSize,
          screenshotFile,
          fixture,
          reportFile,
        }),
      );
    } finally {
      writeFileSync(join(DIAGNOSTICS_DIR, 'fixture-output.log'), fixtureOutput);
      if (agent) {
        await agent.destroy();
      } else {
        await device.destroy();
      }
      stopFixture();
      rmSync(cacheDir, { recursive: true, force: true });
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
