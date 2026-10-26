import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'windows-desktop-smoke-app.ps1',
);
const FIXTURE_READY_TIMEOUT_MS = 30_000;
const STATE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

export interface WindowsFixtureBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WindowsFixtureMetadata {
  userInteractive: boolean;
  sessionId: number;
  processId?: number;
  visible: boolean;
  dpi: number;
  screenDeviceName: string;
  screen: WindowsFixtureBounds;
  form: WindowsFixtureBounds;
  button: WindowsFixtureBounds;
  doubleClickButton: WindowsFixtureBounds;
  textBox: WindowsFixtureBounds;
  scroll: WindowsFixtureBounds;
  slider: WindowsFixtureBounds;
}

export interface WindowsFixtureState {
  visible: boolean;
  clickCount: number;
  doubleClickCount: number;
  text: string;
  lastKey: string;
  wheelEventCount: number;
  wheelDelta: number;
  scrollValue: number;
  sliderValue: number;
}

export interface RunningWindowsDesktopFixture {
  metadata: WindowsFixtureMetadata;
  process: ChildProcessWithoutNullStreams;
  readyFile: string;
  stateFile: string;
  stdoutFile: string;
  stderrFile: string;
  readStdout(): string;
  readStderr(): string;
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

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeBounds(value: unknown, label: string): WindowsFixtureBounds {
  const raw = asRecord(value, `${label} bounds`);
  const left = asFiniteNumber(raw.left ?? raw.x, `${label}.left`);
  const top = asFiniteNumber(raw.top ?? raw.y, `${label}.top`);
  const width = asFiniteNumber(raw.width, `${label}.width`);
  const height = asFiniteNumber(raw.height, `${label}.height`);
  if (width <= 0 || height <= 0) {
    throw new Error(`${label} bounds must be positive, got ${width}x${height}`);
  }
  return { left, top, width, height };
}

function normalizeMetadata(value: unknown): WindowsFixtureMetadata {
  const raw = asRecord(value, 'fixture metadata');
  const rawScreen = asRecord(raw.screen, 'fixture.screen');
  const rawForm = asRecord(raw.form, 'fixture.form');
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
    button: normalizeBounds(raw.button, 'fixture.button'),
    doubleClickButton: normalizeBounds(
      raw.doubleClickButton,
      'fixture.doubleClickButton',
    ),
    textBox: normalizeBounds(raw.textBox, 'fixture.textBox'),
    scroll: normalizeBounds(raw.scroll, 'fixture.scroll'),
    slider: normalizeBounds(raw.slider, 'fixture.slider'),
  };
}

function normalizeState(value: unknown): WindowsFixtureState {
  const raw = asRecord(value, 'fixture state');
  return {
    visible: raw.visible === true,
    clickCount: asFiniteNumber(raw.clickCount ?? 0, 'state.clickCount'),
    doubleClickCount: asFiniteNumber(
      raw.doubleClickCount ?? 0,
      'state.doubleClickCount',
    ),
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
    sliderValue: asFiniteNumber(raw.sliderValue ?? 0, 'state.sliderValue'),
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
  fixtureProcess: ChildProcessWithoutNullStreams,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureProcess.exitCode !== null) {
      throw new Error(
        `fixture exited before ${path.basename(filePath)} was ready (exit code ${fixtureProcess.exitCode})`,
      );
    }
    try {
      const value = normalize(await readJsonFile(filePath));
      if (predicate(value)) return value;
    } catch (error) {
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

async function stopFixtureProcess(
  fixtureProcess: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (fixtureProcess.exitCode !== null || fixtureProcess.signalCode !== null) {
    return;
  }
  const exitPromise = new Promise<void>((resolve) =>
    fixtureProcess.once('exit', () => resolve()),
  );
  fixtureProcess.kill();
  await Promise.race([exitPromise, sleep(5_000)]);
}

export async function startWindowsDesktopFixture(
  diagnosticsDir: string,
  filePrefix: string,
): Promise<RunningWindowsDesktopFixture> {
  const readyFile = path.join(diagnosticsDir, `${filePrefix}-ready.json`);
  const stateFile = path.join(diagnosticsDir, `${filePrefix}-state.json`);
  const stdoutFile = path.join(diagnosticsDir, `${filePrefix}.stdout.log`);
  const stderrFile = path.join(diagnosticsDir, `${filePrefix}.stderr.log`);
  let stdout = '';
  let stderr = '';

  await mkdir(diagnosticsDir, { recursive: true });
  await rm(readyFile, { force: true });
  await rm(stateFile, { force: true });

  const fixtureProcess = spawn(
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
    { windowsHide: false, stdio: 'pipe' },
  );
  fixtureProcess.stdin.end();
  fixtureProcess.stdout.setEncoding('utf8');
  fixtureProcess.stderr.setEncoding('utf8');
  fixtureProcess.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  fixtureProcess.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  try {
    const metadata = await waitForJson(
      readyFile,
      normalizeMetadata,
      (value) => value.visible,
      FIXTURE_READY_TIMEOUT_MS,
      fixtureProcess,
    );
    return {
      metadata,
      process: fixtureProcess,
      readyFile,
      stateFile,
      stdoutFile,
      stderrFile,
      readStdout: () => stdout,
      readStderr: () => stderr,
    };
  } catch (error) {
    await stopFixtureProcess(fixtureProcess);
    await Promise.all([
      writeFile(stdoutFile, stdout, 'utf8'),
      writeFile(stderrFile, stderr, 'utf8'),
    ]);
    throw error;
  }
}

export function waitForWindowsFixtureState(
  fixture: RunningWindowsDesktopFixture,
  predicate: (state: WindowsFixtureState) => boolean,
  timeoutMs = STATE_TIMEOUT_MS,
): Promise<WindowsFixtureState> {
  return waitForJson(
    fixture.stateFile,
    normalizeState,
    predicate,
    timeoutMs,
    fixture.process,
  );
}

export async function stopWindowsDesktopFixture(
  fixture: RunningWindowsDesktopFixture | undefined,
): Promise<void> {
  if (!fixture) return;
  await stopFixtureProcess(fixture.process);
  await Promise.all([
    writeFile(fixture.stdoutFile, fixture.readStdout(), 'utf8'),
    writeFile(fixture.stderrFile, fixture.readStderr(), 'utf8'),
  ]);
}
