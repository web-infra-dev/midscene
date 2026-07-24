import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
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
import type { UiNode } from '@midscene/core/internal/device-cache';
import { imageInfoOfBase64, imagePixelAtPoint } from '@midscene/shared/img';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ComputerAgent } from '../../src/agent';
import { readDarwinAccessibilityTree } from '../../src/darwin-accessibility-tree';
import { ComputerDevice } from '../../src/device';
import { prepareMacosScreenCapture } from './macos-screen-capture-prompt';

const RUN_SMOKE =
  process.platform === 'darwin' &&
  process.env.MIDSCENE_MACOS_ACCESSIBILITY_CACHE_SMOKE === '1';
const TARGET_NAME = 'Midscene Cache Target';
const TARGET_ID = 'midscene-cache-target';
const CACHE_PROMPT = `the button labeled "${TARGET_NAME}"`;
const REPORT_FILE_NAME = 'macos-accessibility-cache-hit-report';
const FIXTURE_PATH = resolve(
  __dirname,
  'fixtures/macos-accessibility-cache-app.swift',
);
const FIXTURE_INFO_PLIST_PATH = resolve(
  __dirname,
  'fixtures/macos-accessibility-cache-app-Info.plist',
);
const RUN_DIR =
  process.env.MIDSCENE_RUN_DIR || resolve(process.cwd(), 'midscene_run');
const DIAGNOSTICS_DIR = join(RUN_DIR, 'diagnostics', 'macos-cache');

interface FixtureMetadata {
  processId: number;
  visible: boolean;
  windowTitle: string;
  targetIdentifier: string;
  targetLabel: string;
}

interface FixtureClickMetadata {
  clicked: boolean;
  buttonTitle: string;
  clickedAt: string;
}

vi.setConfig({ testTimeout: 180_000, hookTimeout: 30_000 });

let fixtureProcess: ChildProcess | undefined;
let fixtureOutput = '';

function firstXpath(feature: ElementCacheFeature): string {
  if (!Array.isArray(feature.xpaths) || typeof feature.xpaths[0] !== 'string') {
    throw new Error('macOS cache smoke did not generate an xpath feature');
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

function fixtureExited(): boolean {
  return fixtureProcess !== undefined && fixtureProcess.exitCode !== null;
}

function stopFixture(): void {
  if (fixtureProcess && fixtureProcess.exitCode === null) {
    fixtureProcess.kill('SIGTERM');
  }
}

function compileAndStartFixture(
  fixtureDir: string,
  readyFile: string,
  clickedFile: string,
): void {
  const appDir = join(fixtureDir, 'Midscene Cache Fixture.app');
  const contentsDir = join(appDir, 'Contents');
  const executableDir = join(contentsDir, 'MacOS');
  const executable = join(executableDir, 'MidsceneCacheFixture');
  mkdirSync(executableDir, { recursive: true });
  copyFileSync(FIXTURE_INFO_PLIST_PATH, join(contentsDir, 'Info.plist'));
  execFileSync(
    'xcrun',
    ['swiftc', '-parse-as-library', FIXTURE_PATH, '-o', executable],
    { stdio: 'pipe' },
  );
  fixtureProcess = spawn(executable, [readyFile, clickedFile], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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

async function waitForFixtureClick(
  clickedFile: string,
): Promise<FixtureClickMetadata> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureExited()) {
      throw new Error(
        `macOS accessibility fixture exited before receiving the click (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    if (existsSync(clickedFile)) {
      try {
        const metadata = JSON.parse(
          readFileSync(clickedFile, 'utf8'),
        ) as FixtureClickMetadata;
        if (
          metadata.clicked === true &&
          metadata.buttonTitle === 'Cache Clicked' &&
          metadata.clickedAt.length > 0
        ) {
          return metadata;
        }
        lastError = new Error(
          `Invalid fixture click metadata: ${JSON.stringify(metadata)}`,
        );
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(
    `Cached coordinates did not click the macOS fixture button. Last error: ${lastError}. Output:\n${fixtureOutput}`,
  );
}

async function waitForFixture(readyFile: string): Promise<FixtureMetadata> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureExited()) {
      throw new Error(
        `macOS accessibility fixture exited early (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    if (existsSync(readyFile)) {
      try {
        const metadata = JSON.parse(
          readFileSync(readyFile, 'utf8'),
        ) as FixtureMetadata;
        if (
          Number.isSafeInteger(metadata.processId) &&
          metadata.visible === true &&
          metadata.windowTitle.length > 0 &&
          metadata.targetIdentifier === TARGET_ID &&
          metadata.targetLabel === TARGET_NAME
        ) {
          return metadata;
        }
        lastError = new Error(
          `Invalid fixture metadata: ${JSON.stringify(metadata)}`,
        );
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(
    `Timed out waiting for macOS fixture metadata. Last error: ${lastError}. Output:\n${fixtureOutput}`,
  );
}

function activateFixture(processId: number): void {
  execFileSync('osascript', [
    '-e',
    `tell application "System Events" to set frontmost of first process whose unix id is ${processId} to true`,
  ]);
}

async function activateFixtureAndSettle(processId: number): Promise<void> {
  activateFixture(processId);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
}

async function waitForTargetNode(
  processId: number,
): Promise<{ root: UiNode; target: UiNode }> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  let lastRoot: UiNode | undefined;
  while (Date.now() < deadline) {
    if (fixtureExited()) {
      throw new Error(
        `macOS accessibility fixture exited early (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    try {
      activateFixture(processId);
      const root = await readDarwinAccessibilityTree();
      lastRoot = root;
      const target = findNode(
        root,
        (node) => node.attrs.AXIdentifier === TARGET_ID,
      );
      if (target) return { root, target };
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  if (lastRoot) {
    writeFileSync(
      join(DIAGNOSTICS_DIR, 'ax-tree-last.json'),
      JSON.stringify(lastRoot, null, 2),
    );
  }
  throw new Error(
    `Timed out waiting for AppKit target in the macOS AX tree. This usually means the runner denied Accessibility access. Last error: ${lastError}. Output:\n${fixtureOutput}`,
  );
}

function saveScreenshot(
  base64: string,
  fileName = 'macos-desktop.png',
): string {
  const screenshotFile = join(DIAGNOSTICS_DIR, fileName);
  const body = base64.replace(/^data:image\/\w+;base64,/, '');
  writeFileSync(screenshotFile, Buffer.from(body, 'base64'));
  return screenshotFile;
}

afterAll(() => {
  stopFixture();
});

describe.runIf(RUN_SMOKE)('macOS AX xpath cache smoke', () => {
  it('generates a Midscene report whose cache-hit coordinates click the target', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'midscene-macos-cache-'));
    const fixtureDir = mkdtempSync(join(tmpdir(), 'midscene-appkit-'));
    const readyFile = join(fixtureDir, 'ready.json');
    const clickedFile = join(fixtureDir, 'clicked.json');
    const cacheId = `macos-accessibility-${process.pid}`;
    const device = new ComputerDevice({
      headless: false,
      keyboardDriver: 'libnut',
    });
    let agent: ComputerAgent<ComputerDevice> | undefined;

    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

    try {
      compileAndStartFixture(fixtureDir, readyFile, clickedFile);
      const fixture = await waitForFixture(readyFile);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'fixture-metadata.json'),
        JSON.stringify(fixture, null, 2),
      );

      const { root, target } = await waitForTargetNode(fixture.processId);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'ax-tree.json'),
        JSON.stringify(root, null, 2),
      );
      expect(target.type).toBe('AXButton');
      expect(target.attrs.AXIdentifier).toBe(TARGET_ID);
      expect(target.bounds.width).toBeGreaterThan(0);
      expect(target.bounds.height).toBeGreaterThan(0);

      await device.connect();
      try {
        const screenCapturePromptResult =
          await prepareMacosScreenCapture(device);
        writeFileSync(
          join(DIAGNOSTICS_DIR, 'screen-capture-prompt.log'),
          `${screenCapturePromptResult}\n`,
        );
      } catch (error) {
        writeFileSync(
          join(DIAGNOSTICS_DIR, 'screen-capture-prompt.log'),
          `${String(error)}\n`,
        );
        throw error;
      }
      expect(existsSync(clickedFile)).toBe(false);
      await activateFixtureAndSettle(fixture.processId);
      const logicalSize = await device.size();
      const screenshot = await device.screenshotBase64();
      const screenshotSize = await imageInfoOfBase64(screenshot);
      const screenshotFile = saveScreenshot(screenshot);
      const screenshotScale = screenshotSize.width / logicalSize.width;
      expect(screenshotSize.height / logicalSize.height).toBeCloseTo(
        screenshotScale,
      );
      const screenshotBounds = {
        left: Math.round(target.bounds.left * screenshotScale),
        top: Math.round(target.bounds.top * screenshotScale),
        width: Math.max(1, Math.round(target.bounds.width * screenshotScale)),
        height: Math.max(1, Math.round(target.bounds.height * screenshotScale)),
      };
      expect(screenshotBounds.left).toBeGreaterThanOrEqual(0);
      expect(screenshotBounds.top).toBeGreaterThanOrEqual(0);
      expect(
        screenshotBounds.left + screenshotBounds.width,
      ).toBeLessThanOrEqual(screenshotSize.width);
      expect(
        screenshotBounds.top + screenshotBounds.height,
      ).toBeLessThanOrEqual(screenshotSize.height);
      const targetPixelPoint = {
        x: Math.round(screenshotBounds.left + 20 * screenshotScale),
        y: Math.round(screenshotBounds.top + 20 * screenshotScale),
      };
      const targetPixel = await imagePixelAtPoint(screenshot, targetPixelPoint);
      expect(targetPixel.green).toBeGreaterThanOrEqual(120);
      expect(targetPixel.green - targetPixel.red).toBeGreaterThanOrEqual(50);
      expect(targetPixel.green - targetPixel.blue).toBeGreaterThanOrEqual(50);
      const center: [number, number] = [
        Math.round(target.bounds.left + target.bounds.width / 2),
        Math.round(target.bounds.top + target.bounds.height / 2),
      ];
      const screenshotCenter: [number, number] = [
        Math.round(center[0] * screenshotScale),
        Math.round(center[1] * screenshotScale),
      ];
      await activateFixtureAndSettle(fixture.processId);
      const feature = await device.cacheFeatureForPoint(center, {
        targetDescription: CACHE_PROMPT,
        expectedRect: target.bounds,
      });
      const xpath = firstXpath(feature);
      expect(feature).toMatchObject({
        kind: 'native-xpath',
        schemaVersion: 1,
        platform: 'darwin',
      });
      expect(feature.target).toEqual({
        type: 'AXButton',
        attr: 'AXIdentifier',
        value: TARGET_ID,
      });
      expect(xpath).toBe(`//*[@AXIdentifier='${TARGET_ID}']`);
      await activateFixtureAndSettle(fixture.processId);
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

      await activateFixtureAndSettle(fixture.processId);
      await agent.aiTap(CACHE_PROMPT);
      const clickMetadata = await waitForFixtureClick(clickedFile);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'click-metadata.json'),
        JSON.stringify(clickMetadata, null, 2),
      );
      const dump = JSON.parse(
        agent.dumpDataString({ inlineScreenshots: true }),
      ) as {
        executions: Array<{
          tasks: Array<{
            hitBy?: {
              from?: string;
              context?: { cacheEntry?: Record<string, unknown> };
            };
            uiContext?: { screenshot?: { base64?: string } };
            output?: {
              element?: {
                center?: [number, number];
                rect?: {
                  left: number;
                  top: number;
                  width: number;
                  height: number;
                };
              };
            };
          }>;
        }>;
      };
      const cacheHits = dump.executions.flatMap((execution) =>
        execution.tasks.filter((task) => task.hitBy?.from === 'Cache'),
      );
      expect(cacheHits).toHaveLength(1);
      expect(cacheHits[0].hitBy?.context?.cacheEntry).toMatchObject({
        kind: 'native-xpath',
        schemaVersion: 1,
        platform: 'darwin',
      });
      expect(cacheHits[0].output?.element?.center).toEqual(screenshotCenter);
      expect(cacheHits[0].output?.element?.rect).toEqual(screenshotBounds);
      const reportScreenshot = cacheHits[0].uiContext?.screenshot?.base64;
      expect(reportScreenshot).toBeTruthy();
      const reportScreenshotFile = saveScreenshot(
        reportScreenshot!,
        'macos-report-cache-hit.png',
      );
      const reportTargetPixel = await imagePixelAtPoint(
        reportScreenshot!,
        targetPixelPoint,
      );
      expect(reportTargetPixel.green).toBeGreaterThanOrEqual(120);
      expect(
        reportTargetPixel.green - reportTargetPixel.red,
      ).toBeGreaterThanOrEqual(50);
      expect(
        reportTargetPixel.green - reportTargetPixel.blue,
      ).toBeGreaterThanOrEqual(50);

      await agent.destroy();
      const reportFile = agent.reportFile;
      expect(reportFile).toBeTruthy();
      expect(basename(reportFile!)).toBe(`${REPORT_FILE_NAME}.html`);
      expect(existsSync(reportFile!)).toBe(true);
      const reportHtml = readFileSync(reportFile!, 'utf8');
      expect(reportHtml).toContain('"from":"Cache"');
      expect(reportHtml).toContain('"kind":"native-xpath"');
      expect(reportHtml).toContain('"schemaVersion":1');
      expect(reportHtml).toContain('"platform":"darwin"');

      console.log(
        '[MacOSCacheSmoke] hit',
        JSON.stringify({
          xpath,
          target: feature.target,
          bounds: target.bounds,
          screenshotBounds,
          logicalSize,
          screenshotSize,
          screenshotScale,
          screenshotFile,
          targetPixel,
          reportTargetPixel,
          reportScreenshotFile,
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
