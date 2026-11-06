import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

const modelTimeoutMs = 45_000;
const modelRetryCount = 1;
const modelRetryIntervalMs = 5_000;

// Leave time for the CLI to report a model failure before either outer deadline.
export const cliAiBudget = {
  modelCallMs:
    modelTimeoutMs * (modelRetryCount + 1) +
    modelRetryIntervalMs * modelRetryCount,
  commandMs: 240_000,
  testMs: 300_000,
};

export const cliAiModelEnv = {
  MIDSCENE_MODEL_TIMEOUT: String(modelTimeoutMs),
  MIDSCENE_PLANNING_MODEL_TIMEOUT: String(modelTimeoutMs),
  MIDSCENE_LOCATE_MODEL_TIMEOUT: String(modelTimeoutMs),
  MIDSCENE_INSIGHT_MODEL_TIMEOUT: String(modelTimeoutMs),
  MIDSCENE_MODEL_RETRY_COUNT: String(modelRetryCount),
  MIDSCENE_MODEL_RETRY_INTERVAL: String(modelRetryIntervalMs),
};

/** Keep diagnostics on disk even when the test kills a stalled CLI process. */
export async function runCliWithDiagnostics(
  command: string,
  args: string[],
  options: {
    directory: string;
    timeoutMs: number;
    env?: Record<string, string>;
  },
) {
  const { directory, timeoutMs, env } = options;
  mkdirSync(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const subprocess = execa(command, args, {
    env: { ...env, MIDSCENE_RUN_DIR: join(directory, 'run') },
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    stdout: ['pipe', { file: join(directory, 'stdout.log') }],
    stderr: ['pipe', { file: join(directory, 'stderr.log') }],
  });
  const metadata = {
    command,
    args,
    startedAt,
    pid: subprocess.pid,
    commandTimeoutMs: timeoutMs,
    modelBudget: cliAiBudget,
  };
  const writeStatus = (status: Record<string, unknown>) =>
    writeFileSync(
      join(directory, 'process.json'),
      JSON.stringify({ ...metadata, ...status }, null, 2),
    );
  writeStatus({ status: 'running' });
  try {
    const result = await subprocess;
    writeStatus({
      status: 'passed',
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    const failure = error as {
      exitCode?: number;
      timedOut?: boolean;
      signal?: string;
      shortMessage?: string;
    };
    writeStatus({
      status: 'failed',
      exitCode: failure.exitCode,
      timedOut: failure.timedOut,
      signal: failure.signal,
      error: failure.shortMessage,
      durationMs: Date.now() - started,
    });
    throw error;
  }
}
