import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
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
import { describe, expect, it } from 'vitest';
import {
  ComputerAgent,
  ComputerDevice,
  checkComputerEnvironment,
} from '../../src';

const RUN_LIVE_SMOKE =
  process.platform === 'win32' &&
  process.env.MIDSCENE_WINDOWS_DESKTOP_SMOKE === '1';

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'windows-desktop-smoke-app.ps1',
);
const REPORT_FILE_NAME = 'windows-desktop-smoke';
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
  userInteractive: boolean;
  sessionId: number;
  processId?: number;
  visible: boolean;
  dpi: number;
  screenDeviceName: string;
  screen: Bounds;
  form: Bounds;
  button: Bounds;
  textBox: Bounds;
  scroll: Bounds;
}

interface FixtureState {
  visible: boolean;
  clickCount: number;
  text: string;
  lastKey: string;
  wheelEventCount: number;
  wheelDelta: number;
  scrollValue: number;
}

interface PixelChannels {
  r: number;
  g: number;
  b: number;
}

interface ScreenshotAnalysis {
  target: PixelChannels;
  background: PixelChannels;
  channelDifference: number;
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

function normalizeBounds(value: unknown, label: string): Bounds {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} bounds are missing`);
  }

  const raw = value as Record<string, unknown>;
  const left = asFiniteNumber(raw.left ?? raw.x, `${label}.left`);
  const top = asFiniteNumber(raw.top ?? raw.y, `${label}.top`);
  const width = asFiniteNumber(raw.width, `${label}.width`);
  const height = asFiniteNumber(raw.height, `${label}.height`);

  if (width <= 0 || height <= 0) {
    throw new Error(`${label} bounds must be positive, got ${width}x${height}`);
  }

  return { left, top, width, height };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeMetadata(value: unknown): FixtureMetadata {
  const raw = asRecord(value, 'fixture metadata');
  const rawScreen = asRecord(raw.screen, 'fixture.screen');
  const rawForm = asRecord(raw.form, 'fixture.form');
  const rawButton = asRecord(raw.button, 'fixture.button');
  const rawTextBox = asRecord(raw.textBox, 'fixture.textBox');
  const rawScroll = asRecord(raw.scroll, 'fixture.scroll');
  return {
    userInteractive: raw.userInteractive === true,
    sessionId: asFiniteNumber(raw.sessionId, 'fixture.sessionId'),
    processId:
      raw.processId === undefined
        ? undefined
        : asFiniteNumber(raw.processId, 'fixture.processId'),
    visible: raw.visible === true || rawForm.visible === true,
    dpi: asFiniteNumber(raw.dpi, 'fixture.dpi'),
    screenDeviceName: String(rawScreen.deviceName ?? ''),
    screen: normalizeBounds(rawScreen, 'fixture.screen'),
    form: normalizeBounds(rawForm, 'fixture.form'),
    button: normalizeBounds(rawButton, 'fixture.button'),
    textBox: normalizeBounds(rawTextBox, 'fixture.textBox'),
    scroll: normalizeBounds(rawScroll, 'fixture.scroll'),
  };
}

function normalizeState(value: unknown): FixtureState {
  if (!value || typeof value !== 'object') {
    throw new Error('fixture state must be an object');
  }

  const raw = value as Record<string, unknown>;
  return {
    visible: raw.visible === true,
    clickCount: asFiniteNumber(raw.clickCount ?? 0, 'state.clickCount'),
    text: String(raw.text ?? ''),
    lastKey: String(raw.lastKey ?? ''),
    wheelEventCount: asFiniteNumber(
      raw.wheelEventCount ?? 0,
      'state.wheelEventCount',
    ),
    wheelDelta: asFiniteNumber(
      raw.lastWheelDelta ?? raw.wheelDelta ?? 0,
      'state.wheelDelta',
    ),
    scrollValue: asFiniteNumber(
      raw.scrollY ?? raw.scrollValue ?? 0,
      'state.scrollValue',
    ),
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function waitForJson<T>(
  filePath: string,
  normalize: (value: unknown) => T,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  childProcess?: ChildProcessWithoutNullStreams,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (childProcess && childProcess.exitCode !== null) {
      throw new Error(
        `fixture exited before ${path.basename(filePath)} was ready (exit code ${childProcess.exitCode})`,
      );
    }

    try {
      const value = normalize(await readJsonFile(filePath));
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      // The fixture updates JSON asynchronously. Missing or partially-written
      // files are expected while polling; retain the latest error for timeout
      // diagnostics instead of weakening the final assertion.
      lastError = error;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `timed out after ${timeoutMs}ms waiting for ${filePath}${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }`,
  );
}

function toDisplayLocalBounds(bounds: Bounds, screen: Bounds): Bounds {
  return {
    left: bounds.left - screen.left,
    top: bounds.top - screen.top,
    width: bounds.width,
    height: bounds.height,
  };
}

function locatedPixelBbox(bounds: Bounds, screen: Bounds) {
  const local = toDisplayLocalBounds(bounds, screen);
  const inset = Math.min(
    4,
    Math.floor(local.width / 4),
    Math.floor(local.height / 4),
  );
  return [
    Math.round(local.left + inset),
    Math.round(local.top + inset),
    Math.round(local.left + local.width - inset),
    Math.round(local.top + local.height - inset),
  ] as [number, number, number, number];
}

function locate(bounds: Bounds, screen: Bounds, prompt: string) {
  return {
    prompt,
    locatedPixelBbox: locatedPixelBbox(bounds, screen),
  };
}

function base64Body(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('screenshot is not a base64 data URL');
  }
  return dataUrl.slice(commaIndex + 1);
}

async function analyzeScreenshot(
  screenshotBuffer: Buffer,
  button: Bounds,
  form: Bounds,
  screen: Bounds,
): Promise<ScreenshotAnalysis> {
  const target = toDisplayLocalBounds(button, screen);
  const localForm = toDisplayLocalBounds(form, screen);
  const backgroundSize = 10;
  const backgroundLeft = Math.max(
    localForm.left + 2,
    localForm.left + localForm.width - backgroundSize - 12,
  );
  const backgroundTop = Math.max(localForm.top + 2, localForm.top + 42);
  const { default: sharp } = await import('sharp');
  const averageColor = async (bounds: Bounds) => {
    const cropped = await sharp(screenshotBuffer)
      .extract({
        left: Math.round(bounds.left),
        top: Math.round(bounds.top),
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height)),
      })
      .toBuffer();
    const stats = await sharp(cropped).stats();
    return {
      r: Math.round(stats.channels[0].mean),
      g: Math.round(stats.channels[1].mean),
      b: Math.round(stats.channels[2].mean),
    };
  };
  const [targetColor, backgroundColor] = await Promise.all([
    averageColor({
      left: target.left + 7,
      top: target.top + 7,
      width: target.width - 14,
      height: target.height - 14,
    }),
    averageColor({
      left: backgroundLeft,
      top: backgroundTop,
      width: backgroundSize,
      height: backgroundSize,
    }),
  ]);
  return {
    target: targetColor,
    background: backgroundColor,
    channelDifference:
      Math.abs(targetColor.r - backgroundColor.r) +
      Math.abs(targetColor.g - backgroundColor.g) +
      Math.abs(targetColor.b - backgroundColor.b),
  };
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
      // The bundled report application can contain the marker as source text.
      // Only structurally valid JSON dump tags are evidence for this smoke.
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
  if (
    !fixtureProcess ||
    fixtureProcess.exitCode !== null ||
    fixtureProcess.signalCode !== null
  ) {
    return;
  }
  const exitPromise = new Promise<void>((resolve) =>
    fixtureProcess.once('exit', () => resolve()),
  );
  fixtureProcess.kill();
  await Promise.race([exitPromise, sleep(5_000)]);
}

describe('WebP screenshot analysis', () => {
  it('decodes WebP evidence without relying on System.Drawing', async () => {
    const { default: sharp } = await import('sharp');
    const screenshotBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 30,
              height: 30,
              channels: 3,
              background: { r: 0, g: 255, b: 0 },
            },
          },
          left: 10,
          top: 10,
        },
      ])
      .webp({ quality: 90 })
      .toBuffer();

    const analysis = await analyzeScreenshot(
      screenshotBuffer,
      { left: 10, top: 10, width: 30, height: 30 },
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 0, top: 0, width: 100, height: 100 },
    );

    expect(analysis.target.g - analysis.target.r).toBeGreaterThan(200);
    expect(analysis.target.g - analysis.target.b).toBeGreaterThan(200);
    expect(analysis.channelDifference).toBeGreaterThan(400);
  });
});

describe.skipIf(!RUN_LIVE_SMOKE)('Windows desktop live smoke', () => {
  it('drives a visible WinForms app without calling a model and emits evidence', async () => {
    const diagnosticsEnv = process.env.MIDSCENE_WINDOWS_DIAGNOSTICS_DIR;
    if (!diagnosticsEnv) {
      throw new Error(
        'MIDSCENE_WINDOWS_DIAGNOSTICS_DIR is required for the Windows desktop smoke',
      );
    }

    const diagnosticsDir = path.resolve(diagnosticsEnv);
    const readyFile = path.join(diagnosticsDir, 'fixture-ready.json');
    const stateFile = path.join(diagnosticsDir, 'fixture-state.json');
    const fixtureStdoutFile = path.join(diagnosticsDir, 'fixture.stdout.log');
    const fixtureStderrFile = path.join(diagnosticsDir, 'fixture.stderr.log');
    const screenshotFile = path.join(diagnosticsDir, 'desktop.webp');
    const dumpFile = path.join(diagnosticsDir, 'agent-dump.json');
    const evidenceFile = path.join(diagnosticsDir, 'evidence.json');
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', REPORT_HTML_FILE_NAME);

    let fixtureProcess: ChildProcessWithoutNullStreams | undefined;
    let device: ComputerDevice | undefined;
    let selectedDisplayDevice: ComputerDevice | undefined;
    let missingDisplayDevice: ComputerDevice | undefined;
    let agent: ComputerAgent<ComputerDevice> | undefined;
    let fixtureStdout = '';
    let fixtureStderr = '';
    const evidence: Record<string, unknown> = {
      platform: process.platform,
      diagnosticsDir,
      reportFile,
    };

    await mkdir(diagnosticsDir, { recursive: true });
    await rm(readyFile, { force: true });
    await rm(stateFile, { force: true });
    await rm(reportFile, { force: true });

    try {
      const startedFixture = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          FIXTURE_PATH,
          '-ReadyFile',
          readyFile,
          '-StateFile',
          stateFile,
        ],
        {
          windowsHide: false,
          stdio: 'pipe',
        },
      );
      fixtureProcess = startedFixture;
      startedFixture.stdin.end();
      startedFixture.stdout.setEncoding('utf8');
      startedFixture.stderr.setEncoding('utf8');
      startedFixture.stdout.on('data', (chunk: string) => {
        fixtureStdout += chunk;
      });
      startedFixture.stderr.on('data', (chunk: string) => {
        fixtureStderr += chunk;
      });

      const metadata = await waitForJson(
        readyFile,
        normalizeMetadata,
        (value) => value.visible,
        FIXTURE_READY_TIMEOUT_MS,
        startedFixture,
      );
      evidence.fixture = metadata;

      expect(metadata.userInteractive).toBe(true);
      expect(metadata.sessionId).toBeGreaterThan(0);
      expect(metadata.visible).toBe(true);
      expect(metadata.dpi).toBe(96);
      expect(metadata.screen.width).toBeGreaterThan(0);
      expect(metadata.screen.height).toBeGreaterThan(0);
      expect(metadata.screenDeviceName).toMatch(/^\\\\\.\\DISPLAY\d+$/i);
      expect(metadata.form.left).toBeGreaterThanOrEqual(metadata.screen.left);
      expect(metadata.form.top).toBeGreaterThanOrEqual(metadata.screen.top);
      expect(metadata.form.left + metadata.form.width).toBeLessThanOrEqual(
        metadata.screen.left + metadata.screen.width,
      );
      expect(metadata.form.top + metadata.form.height).toBeLessThanOrEqual(
        metadata.screen.top + metadata.screen.height,
      );
      if (metadata.processId !== undefined) {
        expect(metadata.processId).toBe(startedFixture.pid);
      }

      const displays = await ComputerDevice.listDisplays();
      evidence.displays = displays;
      expect(displays.length).toBeGreaterThan(0);
      const primaryDisplay = displays.find((display) => display.primary);
      expect(primaryDisplay).toBeDefined();
      expect(primaryDisplay!.id).toBe(metadata.screenDeviceName);

      const environment = await checkComputerEnvironment();
      evidence.environment = environment;
      expect(environment).toMatchObject({
        available: true,
        platform: 'win32',
      });
      expect(environment.displays).toBeGreaterThan(0);

      device = new ComputerDevice({});
      await device.connect();
      const deviceSize = await device.size();
      evidence.deviceSize = deviceSize;
      expect(deviceSize).toEqual({
        width: metadata.screen.width,
        height: metadata.screen.height,
      });
      const screenshotBase64 = await device.screenshotBase64();
      const screenshotBuffer = Buffer.from(
        base64Body(screenshotBase64),
        'base64',
      );
      await writeFile(screenshotFile, screenshotBuffer);

      const screenshotInfo = await imageInfoOfBase64(screenshotBase64);
      evidence.screenshot = {
        ...screenshotInfo,
        bytes: screenshotBuffer.length,
      };
      expect(screenshotInfo).toEqual({
        width: metadata.screen.width,
        height: metadata.screen.height,
      });
      expect(screenshotBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(screenshotBuffer.subarray(8, 12).toString('ascii')).toBe('WEBP');

      const screenshotAnalysis = await analyzeScreenshot(
        screenshotBuffer,
        metadata.button,
        metadata.form,
        metadata.screen,
      );
      evidence.screenshotAnalysis = screenshotAnalysis;
      expect(
        screenshotAnalysis.target.g - screenshotAnalysis.target.r,
      ).toBeGreaterThan(20);
      expect(
        screenshotAnalysis.target.g - screenshotAnalysis.target.b,
      ).toBeGreaterThan(20);
      expect(screenshotAnalysis.channelDifference).toBeGreaterThan(60);

      selectedDisplayDevice = new ComputerDevice({
        displayId: primaryDisplay!.id,
      });
      const selectedDisplayScreenshot =
        await selectedDisplayDevice.screenshotBase64();
      expect(await imageInfoOfBase64(selectedDisplayScreenshot)).toEqual(
        screenshotInfo,
      );

      missingDisplayDevice = new ComputerDevice({
        displayId: String.raw`\\.\MIDSCENE_MISSING_DISPLAY`,
      });
      await expect(missingDisplayDevice.screenshotBase64()).rejects.toThrow(
        /Requested display not found|Failed to take screenshot on Windows/,
      );

      agent = new ComputerAgent(device, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'windows-ci-model-must-not-run',
          [MIDSCENE_MODEL_API_KEY]: 'windows-ci-unused-key',
          [MIDSCENE_MODEL_BASE_URL]: 'http://127.0.0.1:1/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
          [MIDSCENE_MODEL_TIMEOUT]: '1000',
          [MIDSCENE_MODEL_RETRY_COUNT]: '0',
        },
        groupName: 'Windows desktop live smoke',
        groupDescription:
          'Deterministic WinForms input and screenshot validation on GitHub Actions',
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        generateReport: true,
        waitAfterAction: 200,
      });

      await agent.callActionInActionSpace('Tap', {
        locate: locate(metadata.button, metadata.screen, 'green smoke button'),
      });
      const clickedState = await waitForJson(
        stateFile,
        normalizeState,
        (state) => state.clickCount >= 1,
        STATE_TIMEOUT_MS,
        startedFixture,
      );
      expect(clickedState.clickCount).toBe(1);

      const inputText = 'Midscene Windows 输入 😀';
      await agent.callActionInActionSpace('Input', {
        value: inputText,
        mode: 'replace',
        locate: locate(metadata.textBox, metadata.screen, 'smoke text box'),
      });
      const inputState = await waitForJson(
        stateFile,
        normalizeState,
        (state) => state.text === inputText,
        STATE_TIMEOUT_MS,
        startedFixture,
      );
      expect(inputState.text).toBe(inputText);

      await agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Enter',
        locate: locate(metadata.textBox, metadata.screen, 'smoke text box'),
      });
      const keyState = await waitForJson(
        stateFile,
        normalizeState,
        (state) => /enter|return/i.test(state.lastKey),
        STATE_TIMEOUT_MS,
        startedFixture,
      );
      expect(keyState.lastKey).toMatch(/enter|return/i);

      await agent.callActionInActionSpace('Scroll', {
        scrollType: 'singleAction',
        direction: 'down',
        distance: 200,
        locate: locate(metadata.scroll, metadata.screen, 'scroll smoke panel'),
      });
      const scrolledState = await waitForJson(
        stateFile,
        normalizeState,
        (state) =>
          state.wheelEventCount > 0 &&
          state.wheelDelta !== 0 &&
          state.scrollValue > 0,
        STATE_TIMEOUT_MS,
        startedFixture,
      );
      evidence.finalState = scrolledState;
      expect(scrolledState.visible).toBe(true);
      expect(scrolledState.wheelEventCount).toBeGreaterThan(0);
      expect(scrolledState.wheelDelta).not.toBe(0);
      expect(scrolledState.scrollValue).toBeGreaterThan(0);

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
      const reportExecutions = latestExecutions(parseReportDumps(reportHtml));
      const reportTasks = reportExecutions.flatMap(
        (execution) => execution.tasks ?? [],
      );
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
        executionCount: reportExecutions.length,
        locateHitSources: reportLocateTasks.map((task) => task.hitBy?.from),
        modelCalls: agent.metrics.calls,
      };
    } catch (error) {
      evidence.error =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error);
      throw error;
    } finally {
      if (agent) {
        try {
          await agent.destroy();
        } catch (error) {
          evidence.agentDestroyError = String(error);
        }
      } else if (device) {
        try {
          await device.destroy();
        } catch (error) {
          evidence.deviceDestroyError = String(error);
        }
      }
      await selectedDisplayDevice?.destroy().catch((error) => {
        evidence.selectedDisplayDestroyError = String(error);
      });
      await missingDisplayDevice?.destroy().catch((error) => {
        evidence.missingDisplayDestroyError = String(error);
      });
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
    }
  });
});
