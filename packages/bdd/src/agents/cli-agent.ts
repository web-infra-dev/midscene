/**
 * Shared plumbing for the spawn-based general-agent CLI adapters
 * (`opencode-agent.ts`, `codex-agent.ts`).
 *
 * Exports: `resolveModelEnv` (Midscene env-var fallback resolution),
 * `planCommon` (config-derived fields both planners share), `runCli`
 * (spawn + hard timeout + ENOENT taxonomy), `throwOnNonZeroExit`,
 * `withScreenshotFile` (secure temp file for the page screenshot),
 * `tmpFilePath`, `outputTail`, `cliFailureError`.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import type { GeneralAgentConfig } from '../types';
import { ERROR_PREFIX } from '../types';

// ———————————————————————— model env resolution ————————————————————————

interface ResolvedModelEnvCommon {
  /**
   * NAME of the env var that holds the API key (the adapters tell the CLI to
   * read the key from the environment instead of embedding the secret in
   * argv/config text).
   */
  apiKeyVar?: string;
  modelName?: string;
}

/** Discriminated on `baseUrlKind`: a set kind guarantees `baseUrl`. */
export type ResolvedModelEnv =
  | ({ baseUrlKind: 'none'; baseUrl?: undefined } & ResolvedModelEnvCommon)
  | ({
      baseUrlKind: 'http' | 'codex' | 'other';
      baseUrl: string;
    } & ResolvedModelEnvCommon);

/**
 * Resolve the model endpoint from the SAME env keys Midscene's default
 * intent uses, with the same modern→legacy fallback order (see
 * packages/shared/src/env/parse-model-config.ts: `provider[keys.X] ||
 * legacy`). A local resolver instead of `@midscene/shared/env`'s
 * `parseOpenaiSdkConfig` because that function drags in model-family
 * validation and the full ModelConfigManager surface — the adapters only
 * need base URL / key var / model name.
 */
export function resolveModelEnv(env: NodeJS.ProcessEnv): ResolvedModelEnv {
  const baseUrl = env[MIDSCENE_MODEL_BASE_URL] || env[OPENAI_BASE_URL];
  const apiKeyVar = env[MIDSCENE_MODEL_API_KEY]
    ? MIDSCENE_MODEL_API_KEY
    : env[OPENAI_API_KEY]
      ? OPENAI_API_KEY
      : undefined;
  const modelName = env[MIDSCENE_MODEL_NAME] || undefined;

  if (!baseUrl) {
    return { baseUrlKind: 'none', apiKeyVar, modelName };
  }
  const baseUrlKind = /^https?:\/\//i.test(baseUrl)
    ? 'http'
    : baseUrl.startsWith('codex://')
      ? 'codex'
      : 'other';
  return { baseUrl, baseUrlKind, apiKeyVar, modelName };
}

// ———————————————————— shared per-adapter planning ————————————————————

/** The config-derived fields both adapter planners need, computed once. */
export interface CommonPlan {
  env: NodeJS.ProcessEnv;
  resolved: ResolvedModelEnv;
  reuse: boolean;
  permissions: 'read-only' | 'workspace' | 'all';
  cwd: string;
  timeoutMs: number;
  sessionPerScenario: boolean;
}

export function planCommon(
  config: GeneralAgentConfig,
  baseDir: string,
): CommonPlan {
  const env: NodeJS.ProcessEnv = { ...process.env, ...config.env };
  return {
    env,
    resolved: resolveModelEnv(env),
    reuse: config.reuseMidsceneModelEnv !== false,
    permissions: config.permissions ?? 'workspace',
    cwd: config.cwd ?? baseDir,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    sessionPerScenario: config.sessionPerScenario === true,
  };
}

// ———————————————————————————— spawning ————————————————————————————

export const DEFAULT_TIMEOUT_MS = 600_000;

export interface CliRunOptions {
  bin: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
  /** Written to the child's stdin then closed. Without it stdin is closed
   * immediately — opencode blocks forever on an open inherited stdin. */
  stdin?: string;
  /** CLI name for error messages, e.g. 'opencode'. */
  label: string;
  /** Appended to the ENOENT error, e.g. install instructions. */
  installHint: string;
}

export interface CliRunOutcome {
  stdout: string;
  stderr: string;
  /** null only when the process was killed by a signal other than our own. */
  exitCode: number | null;
}

const TAIL_LIMIT = 2000;

export function outputTail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > TAIL_LIMIT
    ? `…${trimmed.slice(-TAIL_LIMIT)}`
    : trimmed;
}

/**
 * Spawn the CLI and wait for exit. Throws on ENOENT (with the install hint)
 * and on timeout (hard SIGKILL of the whole process group, output tail in
 * the message). A nonzero exit is RETURNED, not thrown — the adapters own
 * failure detection (opencode has documented exit-0-on-error bugs).
 */
export async function runCli(opts: CliRunOptions): Promise<CliRunOutcome> {
  const { bin, args, env, cwd, timeoutMs, stdin, label, installHint } = opts;

  return await new Promise<CliRunOutcome>((resolve, reject) => {
    // detached: own process group, so the timeout kill also reaps any
    // children the CLI spawned (these agents run shell commands).
    const child = spawn(bin, args, {
      cwd,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const killGroup = () => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch {
          // Group already gone — fall through to a direct kill.
        }
      }
      child.kill('SIGKILL');
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killGroup();
      reject(
        new Error(
          `${ERROR_PREFIX} ${label} timed out after ${timeoutMs}ms and was killed. Raise generalAgent.timeoutMs if the task legitimately needs longer.\nOutput tail:\n${outputTail(`${stdout}\n${stderr}`)}`,
        ),
      );
    }, timeoutMs);

    // setEncoding routes chunks through a StringDecoder, so multi-byte
    // UTF-8 sequences split across chunk boundaries decode correctly
    // (per-chunk Buffer#toString would corrupt them — verdict JSON with
    // non-ASCII reasons is exactly where that bites).
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(new Error(`${ERROR_PREFIX} ${installHint}`));
      } else {
        reject(
          new Error(
            `${ERROR_PREFIX} failed to spawn ${label}: ${error.message}`,
          ),
        );
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    // A child that exits before draining stdin (e.g. an old CLI rejecting a
    // flag) emits EPIPE here; without a listener Node would crash the whole
    // worker. The failure still surfaces through the exit code.
    child.stdin.on('error', () => {});
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

/**
 * Uniform nonzero-exit handling shared by the adapters (exit-0 failure
 * sniffing stays adapter-specific — see the opencode bugs note above).
 */
export function throwOnNonZeroExit(
  label: string,
  outcome: CliRunOutcome,
  authHint: string,
): void {
  if (outcome.exitCode === 0) return;
  const reason =
    outcome.exitCode === null
      ? 'was killed by a signal.'
      : `exited with code ${outcome.exitCode}.`;
  throw cliFailureError(
    label,
    reason,
    `${outcome.stdout}\n${outcome.stderr}`,
    authHint,
  );
}

// ———————————————————————— failure formatting ————————————————————————

const AUTH_FAILURE_RE =
  /\b401\b|no auth credentials|token refresh failed|unauthorized|invalid api key/i;

/**
 * Compose the adapter failure error: reason, output tail, and — when the
 * output looks like an authentication failure — the CLI-specific auth hint.
 */
export function cliFailureError(
  label: string,
  reason: string,
  output: string,
  authHint: string,
): Error {
  const parts = [`${ERROR_PREFIX} ${label} ${reason}`];
  const tail = outputTail(output);
  if (tail.length > 0) parts.push(`Output tail:\n${tail}`);
  if (AUTH_FAILURE_RE.test(output)) parts.push(authHint);
  return new Error(parts.join('\n'));
}

// ———————————————————————— screenshot temp file ————————————————————————

/** Random temp file path (not created) in Midscene's run tmp dir. */
export function tmpFilePath(suffix: string): string {
  return path.join(
    getMidsceneRunSubDir('tmp'),
    `bdd-agent-${randomBytes(8).toString('hex')}${suffix}`,
  );
}

/**
 * Owner-only (0o600) temp file with a random suffix and 'wx' (fail on
 * pre-existing path): the run dir can fall back to a shared /tmp, where
 * predictable names would be readable or symlink-plantable by other local
 * users. The file is removed in a finally, even when `fn` throws.
 */
export async function withScreenshotFile<T>(
  screenshotBase64: string | undefined,
  fn: (screenshotPath?: string) => Promise<T>,
): Promise<T> {
  if (!screenshotBase64) {
    return fn(undefined);
  }
  const base64 = screenshotBase64.replace(/^data:[^,]*,/, '');
  const filePath = tmpFilePath('.png');
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'), {
    mode: 0o600,
    flag: 'wx',
  });
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}
