import { execFileSync } from 'node:child_process';

const SHELL_TIMEOUT_MS = 5000;
const ENV_MARKER = '___MIDSCENE_SHELL_ENV___';

const KEYS_FORCE_OVERRIDE = new Set(['PATH']);

interface HydrateOptions {
  runShell?: (shell: string) => string;
  platform?: NodeJS.Platform;
  isPackaged?: boolean;
  env?: NodeJS.ProcessEnv;
  log?: (message: string, error?: unknown) => void;
}

interface HydrateResult {
  applied: boolean;
  reason?: string;
  mutatedKeys: string[];
}

function resolveShell(env: NodeJS.ProcessEnv, platform: NodeJS.Platform) {
  if (env.SHELL) {
    return env.SHELL;
  }
  return platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
}

function parseEnvPayload(payload: string): Record<string, string> {
  const startIdx = payload.indexOf(ENV_MARKER);
  if (startIdx < 0) {
    return {};
  }
  const body = payload.slice(startIdx + ENV_MARKER.length);
  const result: Record<string, string> = {};
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = line.slice(eq + 1);
  }
  return result;
}

function runLoginShell(shell: string): string {
  // Emit a marker before `env` so we can skip any rc-file noise on stdout.
  // `command env` avoids alias interference. `-ilc` -> interactive login,
  // which is the only way `.zshrc`/`.zprofile`/`.bashrc` reliably load on macOS.
  const script = `printf '%s\\n' '${ENV_MARKER}'; command env`;
  return execFileSync(shell, ['-ilc', script], {
    encoding: 'utf8',
    timeout: SHELL_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
}

/**
 * Extracts the user's login-shell environment and merges select keys into
 * `process.env`. Necessary because packaged macOS apps launched from
 * Finder/Dock inherit only a minimal environment — no `ANDROID_HOME`,
 * no user `PATH` additions — so native CLIs like `adb`, `hdc`, `xcrun`
 * aren't discoverable.
 *
 * Keys already present in `process.env` are preserved, with one exception:
 * `PATH` is replaced with the login-shell value when available, so device
 * tools installed outside the default system paths become reachable.
 *
 * No-ops on Windows (GUI launches inherit user env there) and in dev
 * (where Electron was started from a shell that already exported env).
 */
export function hydrateLoginShellEnv(
  options: HydrateOptions = {},
): HydrateResult {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const isPackaged = options.isPackaged ?? false;
  const log = options.log ?? (() => {});

  if (platform === 'win32') {
    return { applied: false, reason: 'windows', mutatedKeys: [] };
  }
  if (!isPackaged) {
    return { applied: false, reason: 'not-packaged', mutatedKeys: [] };
  }

  const shell = resolveShell(env, platform);
  let payload: string;
  try {
    payload = options.runShell ? options.runShell(shell) : runLoginShell(shell);
  } catch (error) {
    log('login shell env extraction failed', error);
    return { applied: false, reason: 'shell-failed', mutatedKeys: [] };
  }

  const parsed = parseEnvPayload(payload);
  const mutated: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] !== undefined && !KEYS_FORCE_OVERRIDE.has(key)) {
      continue;
    }
    if (env[key] === value) continue;
    env[key] = value;
    mutated.push(key);
  }

  return { applied: true, mutatedKeys: mutated };
}
