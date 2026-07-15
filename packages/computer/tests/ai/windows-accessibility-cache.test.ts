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
import type { UiNode } from '@midscene/core/internal/device-cache';
import { cropByRect, imageInfoOfBase64 } from '@midscene/shared/img';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ComputerAgent } from '../../src/agent';
import { ComputerDevice } from '../../src/device';
import {
  escapePowershellSingleQuoted,
  runPowershell,
} from '../../src/powershell';
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
  visible: boolean;
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

interface FixtureClickMetadata {
  clicked: boolean;
  buttonText: string;
  clickedAt: string;
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
    typeof value.visible !== 'boolean' ||
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

function startFixture(readyFile: string, clickedFile: string): void {
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
      '-ClickedFile',
      clickedFile,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
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

async function waitForFixtureClick(
  clickedFile: string,
): Promise<FixtureClickMetadata> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureExited()) {
      throw new Error(
        `Windows accessibility fixture exited before receiving the click (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    if (existsSync(clickedFile)) {
      try {
        const metadata = JSON.parse(
          readFileSync(clickedFile, 'utf8').replace(/^\uFEFF/, ''),
        ) as FixtureClickMetadata;
        if (
          metadata.clicked === true &&
          metadata.buttonText === 'Cache Clicked' &&
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
    `Timed out waiting for Windows fixture click metadata. Last error: ${lastError}. Output:\n${fixtureOutput}`,
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

function saveScreenshot(
  base64: string,
  fileName = 'windows-desktop.png',
): string {
  const screenshotFile = join(DIAGNOSTICS_DIR, fileName);
  const body = base64.replace(/^data:image\/\w+;base64,/, '');
  writeFileSync(screenshotFile, Buffer.from(body, 'base64'));
  return screenshotFile;
}

function readScreenshotPixel(
  screenshotFile: string,
  point: { x: number; y: number },
): { red: number; green: number; blue: number } {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap('${escapePowershellSingleQuoted(screenshotFile)}')
try {
  $color = $bitmap.GetPixel(${point.x}, ${point.y})
  [Console]::Out.Write(([PSCustomObject]@{
    red = $color.R
    green = $color.G
    blue = $color.B
  } | ConvertTo-Json -Compress))
} finally {
  $bitmap.Dispose()
}
`.trim();
  return JSON.parse(runPowershell(script)) as {
    red: number;
    green: number;
    blue: number;
  };
}

afterAll(() => {
  stopFixture();
});

describe.runIf(RUN_SMOKE)('Windows UIA xpath cache smoke', () => {
  it('generates a Midscene report whose cache-hit coordinates click the target', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'midscene-windows-cache-'));
    const fixtureDir = mkdtempSync(join(tmpdir(), 'midscene-winforms-'));
    const readyFile = join(fixtureDir, 'ready.json');
    const clickedFile = join(fixtureDir, 'clicked.json');
    const cacheId = `windows-accessibility-${process.pid}`;
    const device = new ComputerDevice({ headless: false });
    let agent: ComputerAgent<ComputerDevice> | undefined;

    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

    try {
      startFixture(readyFile, clickedFile);
      const fixture = await waitForFixture(readyFile);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'fixture-metadata.json'),
        JSON.stringify(fixture, null, 2),
      );
      expect(fixture.userInteractive).toBe(true);
      expect(fixture.visible).toBe(true);
      expect(fixture.dpiX).toBeCloseTo(96, 0);
      expect(fixture.dpiY).toBeCloseTo(96, 0);

      const { root, target } = await waitForTargetNode(fixture);
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'uia-tree.json'),
        JSON.stringify(root, null, 2),
      );
      expect(target.attrs.Name).toBe(TARGET_NAME);
      expect([undefined, TARGET_ID]).toContain(target.attrs.AutomationId);
      expect(target.attrs.AutomationId).not.toBe(String(fixture.buttonHandle));
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
      const targetPixel = readScreenshotPixel(screenshotFile, {
        x: Math.round(target.bounds.left + 20),
        y: Math.round(target.bounds.top + 20),
      });
      writeFileSync(
        join(DIAGNOSTICS_DIR, 'target-pixel.json'),
        JSON.stringify(targetPixel, null, 2),
      );
      expect(targetPixel.green).toBeGreaterThanOrEqual(170);
      expect(targetPixel.green - targetPixel.red).toBeGreaterThanOrEqual(100);
      expect(targetPixel.green - targetPixel.blue).toBeGreaterThanOrEqual(70);
      const screenshotBounds = {
        left: Math.round(target.bounds.left),
        top: Math.round(target.bounds.top),
        width: Math.max(1, Math.round(target.bounds.width)),
        height: Math.max(1, Math.round(target.bounds.height)),
      };
      const [targetCrop, backgroundCrop] = await Promise.all([
        cropByRect(screenshot, screenshotBounds),
        cropByRect(screenshot, {
          left: 20,
          top: 20,
          width: screenshotBounds.width,
          height: screenshotBounds.height,
        }),
      ]);
      expect(targetCrop.imageBase64).not.toBe(backgroundCrop.imageBase64);

      const center: [number, number] = [
        Math.round(target.bounds.left + target.bounds.width / 2),
        Math.round(target.bounds.top + target.bounds.height / 2),
      ];
      const feature = await device.cacheFeatureForPoint(center);
      const xpath = firstXpath(feature);
      expect(feature).toMatchObject({
        kind: 'native-xpath',
        schemaVersion: 1,
        platform: 'win32',
      });
      const expectedIdentity = target.attrs.AutomationId
        ? { attr: 'AutomationId', value: TARGET_ID }
        : { attr: 'Name', value: TARGET_NAME };
      expect(feature.target).toMatchObject({
        type: target.type,
        ...expectedIdentity,
      });
      expect(xpath).toBe(
        target.attrs.AutomationId
          ? `//*[@AutomationId='${TARGET_ID}']`
          : `//${target.type}[@Name='${TARGET_NAME}']`,
      );
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

      expect(existsSync(clickedFile)).toBe(false);
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
        platform: 'win32',
      });
      expect(cacheHits[0].output?.element?.center).toEqual(center);
      expect(cacheHits[0].output?.element?.rect).toEqual(screenshotBounds);
      const reportScreenshot = cacheHits[0].uiContext?.screenshot?.base64;
      expect(reportScreenshot).toBeTruthy();
      saveScreenshot(reportScreenshot!, 'windows-report-cache-hit.png');
      const reportTargetCrop = await cropByRect(
        reportScreenshot!,
        screenshotBounds,
      );
      expect(reportTargetCrop.imageBase64).toBe(targetCrop.imageBase64);

      await agent.destroy();
      const reportFile = agent.reportFile;
      expect(reportFile).toBeTruthy();
      expect(basename(reportFile!)).toBe(`${REPORT_FILE_NAME}.html`);
      expect(existsSync(reportFile!)).toBe(true);
      const reportHtml = readFileSync(reportFile!, 'utf8');
      expect(reportHtml).toContain('"from":"Cache"');
      expect(reportHtml).toContain('"kind":"native-xpath"');
      expect(reportHtml).toContain('"schemaVersion":1');
      expect(reportHtml).toContain('"platform":"win32"');

      console.log(
        '[WindowsCacheSmoke] hit',
        JSON.stringify({
          xpath,
          target: feature.target,
          bounds: target.bounds,
          screenshotBounds,
          screenshotSize,
          targetPixel,
          screenshotFile,
          clickMetadata,
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
