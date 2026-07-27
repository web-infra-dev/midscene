import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { getMidsceneRunBaseDir } from '../common';

export type CliObservationSessionPhase =
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'complete'
  | 'error';

export interface CliObservationSessionState {
  version: 1;
  scope: string;
  sessionName: string;
  token: string;
  phase: CliObservationSessionPhase;
  pid: number;
  stopFilePath: string;
  logFilePath: string;
  requestedOutputPath?: string;
  outputPath?: string;
  error?: string;
  updatedAt: number;
}

const pollIntervalMs = 100;
const workerReadyTimeoutMs = 30_000;
const workerStopTimeoutMs = 30_000;
const workerTokenEnvironmentKey = 'MIDSCENE_CLI_OBSERVATION_WORKER_TOKEN';

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
}

function sessionDirectory(): string {
  const directory = join(getMidsceneRunBaseDir(), 'observation-sessions');
  mkdirSync(directory, { recursive: true });
  return directory;
}

function sessionStatePath(scope: string, sessionName: string): string {
  return join(
    sessionDirectory(),
    `${sanitizeSegment(scope)}-${sanitizeSegment(sessionName)}.json`,
  );
}

function randomToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function processIsRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readCliObservationSession(
  scope: string,
  sessionName: string,
): CliObservationSessionState | undefined {
  const filePath = sessionStatePath(scope, sessionName);
  if (!existsSync(filePath)) return undefined;
  try {
    const state = JSON.parse(
      readFileSync(filePath, 'utf8'),
    ) as CliObservationSessionState;
    if (
      state.version !== 1 ||
      state.scope !== scope ||
      state.sessionName !== sessionName ||
      typeof state.token !== 'string' ||
      typeof state.stopFilePath !== 'string' ||
      typeof state.logFilePath !== 'string'
    ) {
      return undefined;
    }
    return state;
  } catch {
    return undefined;
  }
}

export function writeCliObservationSession(
  state: CliObservationSessionState,
): void {
  const filePath = sessionStatePath(state.scope, state.sessionName);
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSession(
  scope: string,
  sessionName: string,
  token: string,
  accept: (state: CliObservationSessionState) => boolean,
  timeoutMs: number,
): Promise<CliObservationSessionState> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = readCliObservationSession(scope, sessionName);
    if (state?.token === token && accept(state)) return state;
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `Timed out waiting for recording session "${sessionName}". Check the worker log under midscene_run/observation-sessions.`,
  );
}

export async function startCliObservationWorker(input: {
  scope: string;
  sessionName: string;
}): Promise<CliObservationSessionState> {
  const { scope, sessionName } = input;
  const directory = sessionDirectory();
  const activeState = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        return JSON.parse(
          readFileSync(join(directory, name), 'utf8'),
        ) as CliObservationSessionState;
      } catch {
        return undefined;
      }
    })
    .find(
      (state) =>
        state?.scope === scope &&
        ['starting', 'recording', 'stopping'].includes(state.phase) &&
        processIsRunning(state.pid),
    );
  if (activeState) {
    throw new Error(
      `Recording session "${activeState.sessionName}" is already ${activeState.phase}. End it before starting another recording.`,
    );
  }

  const entrypoint = process.argv[1];
  if (!entrypoint) {
    throw new Error(
      'Cannot locate the CLI entrypoint for the recording worker',
    );
  }

  const token = randomToken();
  const prefix = `${sanitizeSegment(scope)}-${sanitizeSegment(sessionName)}-${token}`;
  const stopFilePath = join(sessionDirectory(), `${prefix}.stop`);
  const logFilePath = join(sessionDirectory(), `${prefix}.log`);
  const logFd = openSync(logFilePath, 'a');
  const worker = spawn(
    process.execPath,
    [entrypoint, ...process.argv.slice(2)],
    {
      detached: true,
      env: {
        ...process.env,
        [workerTokenEnvironmentKey]: token,
      },
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    },
  );
  closeSync(logFd);
  if (!worker.pid) {
    throw new Error('Failed to start the recording worker process');
  }

  const state: CliObservationSessionState = {
    version: 1,
    scope,
    sessionName,
    token,
    phase: 'starting',
    pid: worker.pid,
    stopFilePath,
    logFilePath,
    updatedAt: Date.now(),
  };
  writeCliObservationSession(state);
  worker.once('error', (error) => {
    writeCliObservationSession({
      ...state,
      phase: 'error',
      error: error.message,
      updatedAt: Date.now(),
    });
  });
  worker.unref();

  let ready: CliObservationSessionState;
  try {
    ready = await waitForSession(
      scope,
      sessionName,
      token,
      (candidate) =>
        candidate.phase === 'recording' || candidate.phase === 'error',
      workerReadyTimeoutMs,
    );
  } catch (error) {
    worker.kill();
    throw error;
  }
  if (ready.phase === 'error') {
    throw new Error(
      `${ready.error ?? 'Recording worker failed to start'}. Worker log: ${ready.logFilePath}`,
    );
  }
  return ready;
}

export async function waitForCliObservationWorkerState(input: {
  scope: string;
  sessionName: string;
  token: string;
}): Promise<CliObservationSessionState> {
  return waitForSession(
    input.scope,
    input.sessionName,
    input.token,
    () => true,
    5_000,
  );
}

export function markCliObservationWorkerRecording(
  state: CliObservationSessionState,
): CliObservationSessionState {
  const latest =
    readCliObservationSession(state.scope, state.sessionName) ?? state;
  const next: CliObservationSessionState = {
    ...latest,
    phase: latest.phase === 'stopping' ? 'stopping' : 'recording',
    updatedAt: Date.now(),
  };
  writeCliObservationSession(next);
  return next;
}

export function completeCliObservationWorker(
  state: CliObservationSessionState,
  outputPath: string,
): void {
  writeCliObservationSession({
    ...state,
    phase: 'complete',
    outputPath,
    updatedAt: Date.now(),
  });
}

export function failCliObservationWorker(
  state: CliObservationSessionState,
  error: unknown,
): void {
  writeCliObservationSession({
    ...state,
    phase: 'error',
    error: error instanceof Error ? error.message : String(error),
    updatedAt: Date.now(),
  });
}

export async function waitForCliObservationStop(
  state: CliObservationSessionState,
  watchdogMs: number,
): Promise<'requested' | 'watchdog'> {
  const startedAt = Date.now();
  while (!existsSync(state.stopFilePath)) {
    if (watchdogMs > 0 && Date.now() - startedAt >= watchdogMs) {
      return 'watchdog';
    }
    await sleep(pollIntervalMs);
  }
  return 'requested';
}

export async function stopCliObservationWorker(input: {
  scope: string;
  sessionName: string;
  outputPath?: string;
}): Promise<CliObservationSessionState> {
  const state = readCliObservationSession(input.scope, input.sessionName);
  if (!state) {
    throw new Error(`Recording session "${input.sessionName}" was not found`);
  }
  if (state.phase === 'complete') return state;
  if (state.phase === 'error') {
    throw new Error(
      `${state.error ?? 'Recording worker failed'}. Worker log: ${state.logFilePath}`,
    );
  }
  if (!processIsRunning(state.pid)) {
    throw new Error(
      `Recording worker for session "${input.sessionName}" is no longer running. Worker log: ${state.logFilePath}`,
    );
  }

  writeCliObservationSession({
    ...state,
    phase: 'stopping',
    requestedOutputPath: input.outputPath ?? state.requestedOutputPath,
    updatedAt: Date.now(),
  });
  // Persist the requested output before signalling the worker. Otherwise the
  // worker can observe the stop file first and finalize to the old path.
  writeFileSync(state.stopFilePath, '', 'utf8');
  const completed = await waitForSession(
    input.scope,
    input.sessionName,
    state.token,
    (candidate) =>
      candidate.phase === 'complete' || candidate.phase === 'error',
    workerStopTimeoutMs,
  );
  if (completed.phase === 'error') {
    throw new Error(
      `${completed.error ?? 'Recording worker failed'}. Worker log: ${completed.logFilePath}`,
    );
  }
  return completed;
}

export function defaultCliObservationScope(): string {
  return sanitizeSegment(basename(process.argv[1] ?? 'midscene'));
}

export function cliObservationWorkerToken(): string | undefined {
  return process.env[workerTokenEnvironmentKey];
}
