import process from 'node:process';
import type {
  CommandRunner,
  CommandRunnerOptions,
  CommandRunnerResult,
} from './command-runner';
import type { ShellFileIo } from './rish';

/**
 * Command execution through the Android host app's loopback bridge.
 *
 * On Android 14 a `rish` call from an app process is aborted by Shizuku, so the
 * bundled agent does not spawn rish at all: it posts the command to the app,
 * which forwards it to a Shizuku user service running as shell (uid 2000). The
 * bridge is bound to 127.0.0.1 and authenticated with a per-process token that
 * the app passes in the child environment.
 *
 * The transports still build `sh <rish> -c <command>` argv arrays; this runner
 * executes the payload element directly, which is what makes it a drop-in
 * replacement without touching the transports.
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

/** The transports wrap the real command for their launcher; the bridge runs it. */
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
      { method: 'POST', headers: { 'x-midscene-token': this.token }, body: '' },
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
