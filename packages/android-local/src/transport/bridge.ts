import process from 'node:process';
import type {
  CommandRunner,
  CommandRunnerOptions,
  CommandRunnerResult,
} from './command-runner';
import type { ShellFileIo } from './shell';
import type { ExecChannel } from './types';

/**
 * Command execution through the Android host app's loopback bridge.
 *
 * This is the on-device privilege path: the bundled agent never reaches a shell
 * uid by itself. It hands the runner `['sh', '-c', command]` and posts the
 * payload to the app, which forwards it to a Shizuku user service running as
 * shell (uid 2000). The bridge is bound to 127.0.0.1 and authenticated with a
 * per-process token that the app passes in the child environment.
 */
export interface ExecBridgeOptions {
  url: string;
  token: string;
  defaultTimeoutMs?: number;
  /** Injection seam for tests. */
  fetchImpl?: typeof fetch;
}

export interface ExecBridgeResultPayload {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Bridge coordinates from the environment, when the app provided them. */
export function bridgeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { url: string; token: string } | undefined {
  const url = env.MIDSCENE_EXEC_BRIDGE_URL;
  const token = env.MIDSCENE_EXEC_BRIDGE_TOKEN;
  if (!url || !token) {
    return undefined;
  }
  return { url, token };
}

/**
 * Which channel the host app selected, from the environment it injects.
 *
 * Defaults to `shizuku`: an app build that does not set this predates the adb
 * channel, so Shizuku is the only thing it could have been using.
 */
export function channelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExecChannel {
  return env.MIDSCENE_EXEC_CHANNEL === 'adb' ? 'adb' : 'shizuku';
}

/** The transport wraps the command in `sh -c`; the bridge runs the payload. */
export function commandFromArgv(argv: string[]): string {
  return argv[argv.length - 1] ?? '';
}

export class ExecBridgeCommandRunner implements CommandRunner {
  private readonly url: string;
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExecBridgeOptions) {
    this.url = options.url.replace(/\/$/, '');
    this.token = options.token;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async run(
    argv: string[],
    options: CommandRunnerOptions = {},
  ): Promise<CommandRunnerResult> {
    const command = commandFromArgv(argv);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const startedAt = Date.now();
    const response = await this.fetchImpl(
      `${this.url}/exec?timeout=${Math.round(timeoutMs)}`,
      {
        method: 'POST',
        headers: { 'x-midscene-token': this.token },
        body: command,
        signal: AbortSignal.timeout(timeoutMs + 5_000),
      },
    );

    if (!response.ok) {
      throw new Error(
        `exec bridge rejected the command: HTTP ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as ExecBridgeResultPayload;
    return {
      exitCode: payload.exitCode,
      signal: null,
      stdout: Buffer.from(payload.stdout ?? '', 'utf8'),
      stderr: payload.stderr ?? '',
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Read a file the shell wrote, served by the app process.
   *
   * Bulk payloads cannot come back over Binder (a full screenshot exceeds the
   * transaction buffer and takes the user service down), so the app reads the
   * file from its own storage and streams it here.
   */
  async readFile(filePath: string): Promise<Buffer> {
    const response = await this.fetchImpl(
      `${this.url}/read-file?path=${encodeURIComponent(filePath)}`,
      {
        method: 'POST',
        headers: { 'x-midscene-token': this.token },
        body: '',
        signal: AbortSignal.timeout(this.defaultTimeoutMs),
      },
    );
    if (!response.ok) {
      throw new Error(
        `exec bridge could not read ${filePath}: HTTP ${response.status} ${await response.text()}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /** Raw stdout bytes: small binary payloads travel unencoded. */
  async runBinary(command: string, timeoutMs?: number): Promise<Buffer> {
    const response = await this.fetchImpl(
      `${this.url}/exec-binary?timeout=${Math.round(timeoutMs ?? this.defaultTimeoutMs)}`,
      {
        method: 'POST',
        headers: { 'x-midscene-token': this.token },
        body: command,
        signal: AbortSignal.timeout(
          (timeoutMs ?? this.defaultTimeoutMs) + 5_000,
        ),
      },
    );
    if (!response.ok) {
      throw new Error(
        `exec bridge rejected the command: HTTP ${response.status} ${await response.text()}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

/**
 * File channel for the transports, served by the app process.
 *
 * The shell writes the payload (it has the privileges and the directory is shared
 * through the app's external files dir), and the app reads it back: routing bytes
 * through Binder would hit the transaction limit on real screenshots.
 */
export function createBridgeFileIo(
  runner: ExecBridgeCommandRunner,
): ShellFileIo {
  return {
    read: async (filePath: string) => {
      return runner.readFile(filePath);
    },
  };
}
