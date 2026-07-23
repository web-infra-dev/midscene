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
const ACTIVATION_TIMEOUT_MS = 3_000;
const STATE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const KEYBOARD_TYPE_DELAY_MS = 80;

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
  active: boolean;
  keyWindow: boolean;
  activationCount: number;
  inputReadyGeneration: number;
  pointerDownCount: number;
  lastPointerX: number;
  lastPointerY: number;
  clickCount: number;
  buttonActionCount: number;
  textChangeCount: number;
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
    active: raw.active === true,
    keyWindow: raw.keyWindow === true,
    activationCount: asFiniteNumber(
      raw.activationCount,
      'state.activationCount',
    ),
    inputReadyGeneration: asFiniteNumber(
      raw.inputReadyGeneration,
      'state.inputReadyGeneration',
    ),
    pointerDownCount: asFiniteNumber(
      raw.pointerDownCount,
      'state.pointerDownCount',
    ),
    lastPointerX: asFiniteNumber(raw.lastPointerX, 'state.lastPointerX'),
    lastPointerY: asFiniteNumber(raw.lastPointerY, 'state.lastPointerY'),
    clickCount: asFiniteNumber(raw.clickCount, 'state.clickCount'),
    buttonActionCount: asFiniteNumber(
      raw.buttonActionCount,
      'state.buttonActionCount',
    ),
    textChangeCount: asFiniteNumber(
      raw.textChangeCount,
      'state.textChangeCount',
    ),
    text: String(raw.text ?? ''),
    lastKey: String(raw.lastKey ?? ''),
    wheelEventCount: asFiniteNumber(
      raw.wheelEventCount,
      'state.wheelEventCount',
    ),
    scrollValue: asFiniteNumber(raw.scrollValue, 'state.scrollValue'),
  };
}

function foregroundFixtureProcess(processId: number): void {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error(
      `fixture process id must be a positive integer, got ${processId}`,
    );
  }

  const script = [
    'on run argv',
    'set targetPid to item 1 of argv as integer',
    'tell application "System Events"',
    'set targetProcess to first application process whose unix id is targetPid',
    'set frontmost of targetProcess to true',
    'end tell',
    'end run',
  ].join('\n');
  execFileSync('/usr/bin/osascript', ['-e', script, String(processId)], {
    stdio: 'pipe',
  });
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

async function retryFixtureAction(options: {
  action: () => Promise<unknown>;
  fixtureProcess: ChildProcessWithoutNullStreams;
  predicate: (state: FixtureState) => boolean;
  stateFile: string;
  fixturePid: number;
  waitDurations: readonly number[];
}): Promise<{
  state?: FixtureState;
  attempts: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let attempts = 0;
  for (const waitDuration of options.waitDurations) {
    attempts += 1;
    try {
      const beforeActivation = await waitForJson(
        options.stateFile,
        normalizeState,
        () => true,
        ACTIVATION_TIMEOUT_MS,
        options.fixtureProcess,
      );
      foregroundFixtureProcess(options.fixturePid);
      process.kill(options.fixturePid, 'SIGUSR1');
      await waitForJson(
        options.stateFile,
        normalizeState,
        (state) =>
          state.activationCount > beforeActivation.activationCount &&
          state.visible &&
          state.active,
        ACTIVATION_TIMEOUT_MS,
        options.fixtureProcess,
      );
      // Prefer AppKit's durable input-readiness signal and act as soon as it is
      // published. If AppKit declines to make the window key, still invoke the
      // action so the real result remains the final readiness probe.
      try {
        await waitForJson(
          options.stateFile,
          normalizeState,
          (state) =>
            state.inputReadyGeneration > beforeActivation.inputReadyGeneration,
          ACTIVATION_TIMEOUT_MS,
          options.fixtureProcess,
        );
      } catch {
        // Fall through to the action-based readiness probe.
      }
      await options.action();
      const state = await waitForJson(
        options.stateFile,
        normalizeState,
        options.predicate,
        waitDuration,
        options.fixtureProcess,
      );
      return { state, attempts, errors };
    } catch (error) {
      errors.push(String(error));
    }
  }
  return { attempts, errors };
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
  fixturePid: number | undefined,
): Promise<void> {
  if (!fixtureProcess || fixtureProcess.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) =>
    fixtureProcess.once('exit', () => resolve()),
  );
  if (fixturePid && fixturePid !== fixtureProcess.pid) {
    try {
      process.kill(fixturePid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
    }
  } else {
    fixtureProcess.kill('SIGTERM');
  }
  await Promise.race([exited, sleep(5_000)]);
  if (fixtureProcess.exitCode === null) {
    fixtureProcess.kill('SIGTERM');
  }
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
    const screenshotFile = path.join(diagnosticsDir, 'desktop.webp');
    const dumpFile = path.join(diagnosticsDir, 'agent-dump.json');
    const evidenceFile = path.join(diagnosticsDir, 'evidence.json');
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', REPORT_HTML_FILE_NAME);

    let fixtureProcess: ChildProcessWithoutNullStreams | undefined;
    let fixturePid: number | undefined;
    let fixtureTempDir: string | undefined;
    let device: ComputerDevice | undefined;
    let agent: ComputerAgent<ComputerDevice> | undefined;
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

      await Promise.all([
        writeFile(fixtureStdoutFile, '', 'utf8'),
        writeFile(fixtureStderrFile, '', 'utf8'),
      ]);
      const runningFixtureProcess = spawn(
        '/usr/bin/open',
        [
          '-W',
          '-n',
          '-F',
          '-o',
          fixtureStdoutFile,
          '--stderr',
          fixtureStderrFile,
          appDir,
          '--args',
          readyFile,
          stateFile,
        ],
        { stdio: 'pipe' },
      );
      fixtureProcess = runningFixtureProcess;
      runningFixtureProcess.stdin.end();

      const metadata = await waitForJson(
        readyFile,
        normalizeMetadata,
        (value) => value.visible,
        FIXTURE_READY_TIMEOUT_MS,
        runningFixtureProcess,
      );
      fixturePid = metadata.processId;
      evidence.fixture = metadata;
      evidence.launcherProcessId = fixtureProcess.pid;
      expect(metadata.processId).toBeGreaterThan(0);
      expect(metadata.processId).not.toBe(fixtureProcess.pid);
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

      device = new ComputerDevice({
        keyboardTypeDelay: KEYBOARD_TYPE_DELAY_MS,
      });
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
      expect(screenshotBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(screenshotBuffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
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

      const tapButton = () =>
        agent!.callActionInActionSpace('Tap', {
          locate: locate(
            metadata.button,
            screenshotScale,
            'green smoke button',
          ),
        });
      const actionWaitDurations = [2_000, 3_000, 5_000, 8_000];
      const tapResult = await retryFixtureAction({
        action: tapButton,
        fixtureProcess: runningFixtureProcess,
        fixturePid,
        predicate: (state) => state.clickCount >= 1,
        stateFile,
        waitDurations: actionWaitDurations,
      });
      evidence.tapAttempts = tapResult.attempts;
      evidence.tapAttemptErrors = tapResult.errors;
      const clickedState = tapResult.state;
      if (!clickedState) {
        throw new Error(
          `macOS fixture did not receive ${tapResult.attempts} button taps: ${tapResult.errors.at(-1)}`,
        );
      }
      expect(clickedState.clickCount).toBeGreaterThanOrEqual(1);

      const delayedInputText = 'Midscene typed 123';
      let delayedInputBaselineTextChangeCount = 0;
      let delayedInputElapsedMs = 0;
      const delayedInputResult = await retryFixtureAction({
        action: async () => {
          const beforeDelayedInput = await waitForJson(
            stateFile,
            normalizeState,
            () => true,
            STATE_TIMEOUT_MS,
            runningFixtureProcess,
          );
          delayedInputBaselineTextChangeCount =
            beforeDelayedInput.textChangeCount;
          const inputStart = performance.now();
          await agent!.callActionInActionSpace('Input', {
            value: delayedInputText,
            mode: 'replace',
            locate: locate(
              metadata.textField,
              screenshotScale,
              'smoke text field',
            ),
          });
          delayedInputElapsedMs = performance.now() - inputStart;
        },
        fixtureProcess: runningFixtureProcess,
        fixturePid,
        predicate: (state) =>
          state.text === delayedInputText &&
          state.textChangeCount - delayedInputBaselineTextChangeCount >=
            Array.from(delayedInputText).length,
        stateFile,
        waitDurations: actionWaitDurations,
      });
      evidence.delayedInputAttempts = delayedInputResult.attempts;
      evidence.delayedInputAttemptErrors = delayedInputResult.errors;
      evidence.delayedInputElapsedMs = delayedInputElapsedMs;
      const delayedInputState = delayedInputResult.state;
      if (!delayedInputState) {
        throw new Error(
          `macOS fixture did not receive delayed text after ${delayedInputResult.attempts} input attempts: ${delayedInputResult.errors.at(-1)}`,
        );
      }
      expect(delayedInputState.text).toBe(delayedInputText);
      evidence.delayedInputTextChangeCount =
        delayedInputState.textChangeCount - delayedInputBaselineTextChangeCount;
      expect(
        delayedInputState.textChangeCount - delayedInputBaselineTextChangeCount,
      ).toBeGreaterThanOrEqual(Array.from(delayedInputText).length);
      expect(delayedInputElapsedMs).toBeGreaterThanOrEqual(
        (Array.from(delayedInputText).length - 1) * KEYBOARD_TYPE_DELAY_MS,
      );

      const clipboardInputText = 'Midscene macOS 输入 😀';
      const clipboardInputResult = await retryFixtureAction({
        action: () =>
          agent!.callActionInActionSpace('Input', {
            keyboardTypeDelay: 0,
            value: clipboardInputText,
            mode: 'replace',
            locate: locate(
              metadata.textField,
              screenshotScale,
              'smoke text field',
            ),
          }),
        fixtureProcess: runningFixtureProcess,
        fixturePid,
        predicate: (state) => state.text === clipboardInputText,
        stateFile,
        waitDurations: actionWaitDurations,
      });
      evidence.clipboardInputAttempts = clipboardInputResult.attempts;
      evidence.clipboardInputAttemptErrors = clipboardInputResult.errors;
      const clipboardInputState = clipboardInputResult.state;
      if (!clipboardInputState) {
        throw new Error(
          `macOS fixture did not receive clipboard text after ${clipboardInputResult.attempts} input attempts: ${clipboardInputResult.errors.at(-1)}`,
        );
      }
      expect(clipboardInputState.text).toBe(clipboardInputText);

      const keyResult = await retryFixtureAction({
        action: () =>
          agent!.callActionInActionSpace('KeyboardPress', {
            keyName: 'Enter',
            locate: locate(
              metadata.textField,
              screenshotScale,
              'smoke text field',
            ),
          }),
        fixtureProcess: runningFixtureProcess,
        fixturePid,
        predicate: (state) => state.lastKey === 'Enter',
        stateFile,
        waitDurations: actionWaitDurations,
      });
      evidence.keyAttempts = keyResult.attempts;
      evidence.keyAttemptErrors = keyResult.errors;
      const keyState = keyResult.state;
      if (!keyState) {
        throw new Error(
          `macOS fixture did not receive Enter after ${keyResult.attempts} keyboard attempts: ${keyResult.errors.at(-1)}`,
        );
      }
      expect(keyState.lastKey).toBe('Enter');

      const beforeScroll = await waitForJson(
        stateFile,
        normalizeState,
        () => true,
        STATE_TIMEOUT_MS,
        runningFixtureProcess,
      );
      const scrollResult = await retryFixtureAction({
        action: () =>
          agent!.callActionInActionSpace('Scroll', {
            scrollType: 'singleAction',
            direction: 'down',
            distance: 180,
            locate: locate(
              metadata.scroll,
              screenshotScale,
              'scroll smoke area',
            ),
          }),
        fixtureProcess: runningFixtureProcess,
        fixturePid,
        predicate: (state) =>
          state.wheelEventCount > beforeScroll.wheelEventCount &&
          state.scrollValue !== beforeScroll.scrollValue,
        stateFile,
        waitDurations: actionWaitDurations,
      });
      evidence.scrollAttempts = scrollResult.attempts;
      evidence.scrollAttemptErrors = scrollResult.errors;
      const scrolledState = scrollResult.state;
      if (!scrolledState) {
        throw new Error(
          `macOS fixture did not scroll after ${scrollResult.attempts} attempts: ${scrollResult.errors.at(-1)}`,
        );
      }
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
      const actionAttempts =
        tapResult.attempts +
        delayedInputResult.attempts +
        clipboardInputResult.attempts +
        keyResult.attempts +
        scrollResult.attempts;
      expect(locateTasks).toHaveLength(actionAttempts);
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
      expect(reportLocateTasks).toHaveLength(actionAttempts);
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
      await stopFixture(fixtureProcess, fixturePid).catch((error) => {
        evidence.fixtureStopError = String(error);
      });
      await writeFile(
        evidenceFile,
        `${JSON.stringify(evidence, null, 2)}\n`,
        'utf8',
      );
      if (fixtureTempDir) {
        await rm(fixtureTempDir, { recursive: true, force: true });
      }
    }
  });
});
