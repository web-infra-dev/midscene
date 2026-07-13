import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFileSync, spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import { cropByRect, imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it, vi } from 'vitest';
import {
  ComputerAgent,
  ComputerDevice,
  checkComputerEnvironment,
} from '../../src';

const RUN_LIVE_SMOKE =
  process.platform === 'darwin' &&
  process.env.MIDSCENE_MACOS_DESKTOP_SMOKE === '1';
const FIXTURE_SOURCE = path.join(
  __dirname,
  'fixtures',
  'macos-desktop-smoke-app.swift',
);
const FIXTURE_INFO_PLIST = path.join(
  __dirname,
  'fixtures',
  'macos-desktop-smoke-app-Info.plist',
);
const REPORT_FILE_NAME = 'macos-desktop-smoke';
const REPORT_HTML_FILE_NAME = `${REPORT_FILE_NAME}.html`;
const FIXTURE_READY_TIMEOUT_MS = 30_000;
const STATE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FixtureMetadata {
  processId: number;
  visible: boolean;
  backingScaleFactor: number;
  screen: Bounds;
  window: Bounds;
  button: Bounds;
  textField: Bounds;
  scroll: Bounds;
}

interface FixtureState {
  visible: boolean;
  clickCount: number;
  text: string;
  lastKey: string;
  wheelEventCount: number;
  scrollValue: number;
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

vi.setConfig({ testTimeout: 180_000, hookTimeout: 30_000 });

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

function asFiniteNumber(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a finite number, got ${String(value)}`);
  }
  return numberValue;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeBounds(value: unknown, label: string): Bounds {
  const raw = asRecord(value, label);
  const bounds = {
    left: asFiniteNumber(raw.left, `${label}.left`),
    top: asFiniteNumber(raw.top, `${label}.top`),
    width: asFiniteNumber(raw.width, `${label}.width`),
    height: asFiniteNumber(raw.height, `${label}.height`),
  };
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error(
      `${label} must have positive dimensions, got ${bounds.width}x${bounds.height}`,
    );
  }
  return bounds;
}

function normalizeMetadata(value: unknown): FixtureMetadata {
  const raw = asRecord(value, 'fixture metadata');
  return {
    processId: asFiniteNumber(raw.processId, 'fixture.processId'),
    visible: raw.visible === true,
    backingScaleFactor: asFiniteNumber(
      raw.backingScaleFactor,
      'fixture.backingScaleFactor',
    ),
    screen: normalizeBounds(raw.screen, 'fixture.screen'),
    window: normalizeBounds(raw.window, 'fixture.window'),
    button: normalizeBounds(raw.button, 'fixture.button'),
    textField: normalizeBounds(raw.textField, 'fixture.textField'),
    scroll: normalizeBounds(raw.scroll, 'fixture.scroll'),
  };
}

function normalizeState(value: unknown): FixtureState {
  const raw = asRecord(value, 'fixture state');
  return {
    visible: raw.visible === true,
    clickCount: asFiniteNumber(raw.clickCount, 'state.clickCount'),
    text: String(raw.text ?? ''),
    lastKey: String(raw.lastKey ?? ''),
    wheelEventCount: asFiniteNumber(
      raw.wheelEventCount,
      'state.wheelEventCount',
    ),
    scrollValue: asFiniteNumber(raw.scrollValue, 'state.scrollValue'),
  };
}

async function waitForJson<T>(
  filePath: string,
  normalize: (value: unknown) => T,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  fixtureProcess: ChildProcessWithoutNullStreams,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureProcess.exitCode !== null) {
      throw new Error(
        `macOS fixture exited early with code ${fixtureProcess.exitCode}`,
      );
    }
    try {
      const normalized = normalize(
        JSON.parse(await readFile(filePath, 'utf8')),
      );
      if (predicate(normalized)) {
        return normalized;
      }
      lastError = new Error(
        `Fixture state did not satisfy predicate: ${JSON.stringify(normalized)}`,
      );
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out waiting for ${filePath}. Last error: ${String(lastError)}`,
  );
}

function assertInside(inner: Bounds, outer: Bounds, label: string): void {
  expect(inner.left, `${label}.left`).toBeGreaterThanOrEqual(outer.left);
  expect(inner.top, `${label}.top`).toBeGreaterThanOrEqual(outer.top);
  expect(inner.left + inner.width, `${label}.right`).toBeLessThanOrEqual(
    outer.left + outer.width,
  );
  expect(inner.top + inner.height, `${label}.bottom`).toBeLessThanOrEqual(
    outer.top + outer.height,
  );
}

function screenshotBounds(bounds: Bounds, scale: number): Bounds {
  return {
    left: Math.round(bounds.left * scale),
    top: Math.round(bounds.top * scale),
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}

function locate(bounds: Bounds, scale: number, prompt: string) {
  const scaled = screenshotBounds(bounds, scale);
  return {
    prompt,
    locatedPixelBbox: [
      scaled.left,
      scaled.top,
      scaled.left + scaled.width,
      scaled.top + scaled.height,
    ] as [number, number, number, number],
  };
}

function base64Body(base64: string): string {
  const match = /^data:image\/\w+;base64,(.+)$/s.exec(base64);
  if (!match) {
    throw new Error('macOS screenshot is not a base64 data URL');
  }
  return match[1];
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

async function stopFixture(
  fixtureProcess: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
  if (!fixtureProcess || fixtureProcess.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) =>
    fixtureProcess.once('exit', () => resolve()),
  );
  fixtureProcess.kill('SIGTERM');
  await Promise.race([exited, sleep(5_000)]);
}

describe.skipIf(!RUN_LIVE_SMOKE)('macOS desktop live smoke', () => {
  it('drives a visible AppKit app without calling a model and emits evidence', async () => {
    const diagnosticsEnv = process.env.MIDSCENE_MACOS_DIAGNOSTICS_DIR;
    if (!diagnosticsEnv) {
      throw new Error(
        'MIDSCENE_MACOS_DIAGNOSTICS_DIR is required for the macOS desktop smoke',
      );
    }

    const diagnosticsDir = path.resolve(diagnosticsEnv);
    const readyFile = path.join(diagnosticsDir, 'fixture-ready.json');
    const stateFile = path.join(diagnosticsDir, 'fixture-state.json');
    const fixtureStdoutFile = path.join(diagnosticsDir, 'fixture.stdout.log');
    const fixtureStderrFile = path.join(diagnosticsDir, 'fixture.stderr.log');
    const screenshotFile = path.join(diagnosticsDir, 'desktop.png');
    const dumpFile = path.join(diagnosticsDir, 'agent-dump.json');
    const evidenceFile = path.join(diagnosticsDir, 'evidence.json');
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', REPORT_HTML_FILE_NAME);

    let fixtureProcess: ChildProcessWithoutNullStreams | undefined;
    let fixtureTempDir: string | undefined;
    let device: ComputerDevice | undefined;
    let agent: ComputerAgent<ComputerDevice> | undefined;
    let fixtureStdout = '';
    let fixtureStderr = '';
    const evidence: Record<string, unknown> = {
      platform: process.platform,
      diagnosticsDir,
      reportFile,
    };

    await mkdir(diagnosticsDir, { recursive: true });
    await Promise.all([
      rm(readyFile, { force: true }),
      rm(stateFile, { force: true }),
      rm(reportFile, { force: true }),
    ]);

    try {
      fixtureTempDir = await mkdtemp(
        path.join(tmpdir(), 'midscene-macos-desktop-smoke-'),
      );
      const appDir = path.join(
        fixtureTempDir,
        'Midscene Desktop Smoke Fixture.app',
      );
      const contentsDir = path.join(appDir, 'Contents');
      const executableDir = path.join(contentsDir, 'MacOS');
      const executable = path.join(
        executableDir,
        'MidsceneDesktopSmokeFixture',
      );
      await mkdir(executableDir, { recursive: true });
      await copyFile(FIXTURE_INFO_PLIST, path.join(contentsDir, 'Info.plist'));
      execFileSync(
        'xcrun',
        ['swiftc', '-parse-as-library', FIXTURE_SOURCE, '-o', executable],
        { stdio: 'pipe' },
      );

      fixtureProcess = spawn(executable, [readyFile, stateFile], {
        stdio: 'pipe',
      });
      fixtureProcess.stdin.end();
      fixtureProcess.stdout.setEncoding('utf8');
      fixtureProcess.stderr.setEncoding('utf8');
      fixtureProcess.stdout.on('data', (chunk: string) => {
        fixtureStdout += chunk;
      });
      fixtureProcess.stderr.on('data', (chunk: string) => {
        fixtureStderr += chunk;
      });

      const metadata = await waitForJson(
        readyFile,
        normalizeMetadata,
        (value) => value.visible,
        FIXTURE_READY_TIMEOUT_MS,
        fixtureProcess,
      );
      evidence.fixture = metadata;
      expect(metadata.processId).toBe(fixtureProcess.pid);
      expect(metadata.backingScaleFactor).toBeGreaterThanOrEqual(1);
      for (const [label, bounds] of Object.entries({
        window: metadata.window,
        button: metadata.button,
        textField: metadata.textField,
        scroll: metadata.scroll,
      })) {
        assertInside(bounds, metadata.screen, label);
      }

      const displays = await ComputerDevice.listDisplays();
      evidence.displays = displays;
      expect(displays.length).toBeGreaterThan(0);
      expect(displays.some((display) => display.primary)).toBe(true);

      const environment = await checkComputerEnvironment();
      evidence.environment = environment;
      expect(environment).toMatchObject({
        available: true,
        platform: 'darwin',
      });

      device = new ComputerDevice({});
      await device.connect();
      const logicalSize = await device.size();
      evidence.logicalSize = logicalSize;
      expect(logicalSize).toEqual({
        width: metadata.screen.width,
        height: metadata.screen.height,
      });

      const screenshot = await device.screenshotBase64();
      const screenshotInfo = await imageInfoOfBase64(screenshot);
      const screenshotScale = screenshotInfo.width / logicalSize.width;
      expect(screenshotInfo.height / logicalSize.height).toBeCloseTo(
        screenshotScale,
        2,
      );
      const screenshotBuffer = Buffer.from(base64Body(screenshot), 'base64');
      await writeFile(screenshotFile, screenshotBuffer);
      evidence.screenshot = {
        ...screenshotInfo,
        scale: screenshotScale,
        bytes: screenshotBuffer.length,
      };

      const buttonBounds = screenshotBounds(metadata.button, screenshotScale);
      const sampleWidth = Math.max(20, Math.min(100, buttonBounds.width - 10));
      const sampleHeight = Math.max(20, Math.min(45, buttonBounds.height - 10));
      const [targetCrop, backgroundCrop] = await Promise.all([
        cropByRect(screenshot, {
          left: Math.round(
            buttonBounds.left + (buttonBounds.width - sampleWidth) / 2,
          ),
          top: Math.round(
            buttonBounds.top + (buttonBounds.height - sampleHeight) / 2,
          ),
          width: sampleWidth,
          height: sampleHeight,
        }),
        cropByRect(screenshot, {
          left: Math.round((metadata.window.left + 20) * screenshotScale),
          top: Math.round((metadata.window.top + 70) * screenshotScale),
          width: sampleWidth,
          height: sampleHeight,
        }),
      ]);
      expect(targetCrop.imageBase64).not.toBe(backgroundCrop.imageBase64);

      agent = new ComputerAgent(device, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'macos-ci-model-must-not-run',
          [MIDSCENE_MODEL_API_KEY]: 'macos-ci-unused-key',
          [MIDSCENE_MODEL_BASE_URL]: 'http://127.0.0.1:1/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
          [MIDSCENE_MODEL_TIMEOUT]: '1000',
          [MIDSCENE_MODEL_RETRY_COUNT]: '0',
        },
        groupName: 'macOS desktop live smoke',
        groupDescription:
          'Deterministic AppKit input and screenshot validation on GitHub Actions',
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        generateReport: true,
        waitAfterAction: 200,
      });

      await agent.callActionInActionSpace('Tap', {
        locate: locate(metadata.button, screenshotScale, 'green smoke button'),
      });
      const clickedState = await waitForJson(
        stateFile,
        normalizeState,
        (state) => state.clickCount >= 1,
        STATE_TIMEOUT_MS,
        fixtureProcess,
      );
      expect(clickedState.clickCount).toBe(1);

      const inputText = 'Midscene macOS 输入 😀';
      await agent.callActionInActionSpace('Input', {
        value: inputText,
        mode: 'replace',
        locate: locate(metadata.textField, screenshotScale, 'smoke text field'),
      });
      const inputState = await waitForJson(
        stateFile,
        normalizeState,
        (state) => state.text === inputText,
        STATE_TIMEOUT_MS,
        fixtureProcess,
      );
      expect(inputState.text).toBe(inputText);

      await agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Enter',
        locate: locate(metadata.textField, screenshotScale, 'smoke text field'),
      });
      const keyState = await waitForJson(
        stateFile,
        normalizeState,
        (state) => state.lastKey === 'Enter',
        STATE_TIMEOUT_MS,
        fixtureProcess,
      );
      expect(keyState.lastKey).toBe('Enter');

      const beforeScroll = await waitForJson(
        stateFile,
        normalizeState,
        () => true,
        STATE_TIMEOUT_MS,
        fixtureProcess,
      );
      await agent.callActionInActionSpace('Scroll', {
        scrollType: 'singleAction',
        direction: 'down',
        distance: 180,
        locate: locate(metadata.scroll, screenshotScale, 'scroll smoke area'),
      });
      const scrolledState = await waitForJson(
        stateFile,
        normalizeState,
        (state) =>
          state.wheelEventCount > beforeScroll.wheelEventCount &&
          state.scrollValue !== beforeScroll.scrollValue,
        STATE_TIMEOUT_MS,
        fixtureProcess,
      );
      evidence.finalState = scrolledState;
      expect(scrolledState.visible).toBe(true);

      const dump = JSON.parse(agent.dumpDataString()) as ReportDump;
      await writeFile(dumpFile, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
      const dumpTasks = (dump.executions ?? []).flatMap(
        (execution) => execution.tasks ?? [],
      );
      const locateTasks = dumpTasks.filter(
        (task) => task.type === 'Planning' && task.subType === 'Locate',
      );
      expect(locateTasks).toHaveLength(4);
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
      expect(reportLocateTasks).toHaveLength(4);
      expect(
        reportLocateTasks.every((task) => task.hitBy?.from === 'Plan'),
      ).toBe(true);
      for (const action of ['Tap', 'Input', 'KeyboardPress', 'Scroll']) {
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
      await stopFixture(fixtureProcess).catch((error) => {
        evidence.fixtureStopError = String(error);
      });
      await Promise.all([
        writeFile(fixtureStdoutFile, fixtureStdout, 'utf8'),
        writeFile(fixtureStderrFile, fixtureStderr, 'utf8'),
        writeFile(
          evidenceFile,
          `${JSON.stringify(evidence, null, 2)}\n`,
          'utf8',
        ),
      ]);
      if (fixtureTempDir) {
        await rm(fixtureTempDir, { recursive: true, force: true });
      }
    }
  });
});
