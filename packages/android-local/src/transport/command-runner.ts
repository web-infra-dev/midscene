import { spawn } from 'node:child_process';

/**
 * Command execution seam.
 *
 * Transports never call `child_process` directly: they receive a
 * {@link CommandRunner}. That keeps the whole transport layer testable without
 * a device (see {@link FakeCommandRunner}) and keeps process management in one
 * place once the runtime moves inside an APK.
 */

export const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_STDERR_CHARS = 64 * 1024;

export type CommandRunnerFailureKind =
  /** The process could not be started at all (missing binary, no permission). */
  | 'spawn-failed'
  /** The process was killed because it exceeded its timeout. */
  | 'timeout'
  /** stdout exceeded `maxStdoutBytes` and the process was killed. */
  | 'output-overflow';

export class CommandRunnerError extends Error {
  readonly kind: CommandRunnerFailureKind;
  readonly argv: string[];
  readonly durationMs: number;
  readonly stderr: string;
  readonly timeoutMs?: number;

  constructor(
    message: string,
    options: {
      kind: CommandRunnerFailureKind;
      argv: string[];
      durationMs: number;
      stderr?: string;
      timeoutMs?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'CommandRunnerError';
    this.kind = options.kind;
    this.argv = options.argv;
    this.durationMs = options.durationMs;
    this.stderr = options.stderr ?? '';
    this.timeoutMs = options.timeoutMs;
  }
}

export interface CommandRunnerResult {
  /** `null` when the process was terminated by a signal. */
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Always bytes: screenshot pipelines carry binary payloads. */
  stdout: Buffer;
  stderr: string;
  durationMs: number;
}

export interface CommandRunnerOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  maxStdoutBytes?: number;
}

export interface CommandRunner {
  run(
    argv: string[],
    options?: CommandRunnerOptions,
  ): Promise<CommandRunnerResult>;
}

/** Quote one argument for a POSIX shell. */
export function quoteShellArg(value: string): string {
  if (value === '') {
    return "''";
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Join argv into a single shell command line (diagnostics and `-c` payloads). */
export function joinShellCommand(argv: string[]): string {
  return argv.map(quoteShellArg).join(' ');
}

function bufferToSnippet(value: Buffer): string {
  return value.length > 0 ? value.toString('utf8').trim() : '';
}

export class NodeCommandRunner implements CommandRunner {
  async run(
    argv: string[],
    options: CommandRunnerOptions = {},
  ): Promise<CommandRunnerResult> {
    const {
      timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
      cwd,
      env,
      maxStdoutBytes = DEFAULT_MAX_STDOUT_BYTES,
    } = options;

    if (argv.length === 0 || !argv[0]) {
      throw new CommandRunnerError('argv must contain at least one entry', {
        kind: 'spawn-failed',
        argv,
        durationMs: 0,
      });
    }

    return await new Promise<CommandRunnerResult>((resolve, reject) => {
      const startedAt = Date.now();
      const stdoutChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stdoutOverflow = false;
      let stderrText = '';
      let settled = false;
      let timedOut = false;

      const child = spawn(argv[0] as string, argv.slice(1), {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      const finish = (
        outcome:
          | { type: 'resolve'; result: CommandRunnerResult }
          | { type: 'reject'; error: Error },
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (outcome.type === 'resolve') {
          resolve(outcome.result);
        } else {
          reject(outcome.error);
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxStdoutBytes) {
          stdoutOverflow = true;
          child.kill('SIGKILL');
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrText.length >= MAX_STDERR_CHARS) {
          return;
        }
        stderrText += chunk.toString('utf8');
        if (stderrText.length > MAX_STDERR_CHARS) {
          stderrText = `${stderrText.slice(0, MAX_STDERR_CHARS)}…[truncated]`;
        }
      });

      child.on('error', (error: Error) => {
        finish({
          type: 'reject',
          error: new CommandRunnerError(
            `Failed to start command ${JSON.stringify(argv[0])}: ${error.message}`,
            {
              kind: 'spawn-failed',
              argv,
              durationMs: Date.now() - startedAt,
              cause: error,
            },
          ),
        });
      });

      child.on(
        'close',
        (code: number | null, signal: NodeJS.Signals | null) => {
          const durationMs = Date.now() - startedAt;

          if (timedOut) {
            finish({
              type: 'reject',
              error: new CommandRunnerError(
                `Command timed out after ${timeoutMs}ms`,
                {
                  kind: 'timeout',
                  argv,
                  durationMs,
                  stderr: stderrText,
                  timeoutMs,
                },
              ),
            });
            return;
          }

          if (stdoutOverflow) {
            finish({
              type: 'reject',
              error: new CommandRunnerError(
                `Command produced more than ${maxStdoutBytes} bytes on stdout`,
                {
                  kind: 'output-overflow',
                  argv,
                  durationMs,
                  stderr: stderrText,
                },
              ),
            });
            return;
          }

          finish({
            type: 'resolve',
            result: {
              exitCode: code,
              signal,
              stdout: Buffer.concat(stdoutChunks, stdoutBytes),
              stderr: stderrText,
              durationMs,
            },
          });
        },
      );
    });
  }
}

export interface FakeCommandResponse {
  /** Every entry must appear in the joined argv, or a predicate/regex match. */
  match: string[] | RegExp | ((argv: string[]) => boolean);
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string | Buffer;
  stderr?: string;
  delayMs?: number;
  /** Fail the call the way a real runner would. */
  failure?: { kind: CommandRunnerFailureKind; message?: string };
}

export interface FakeCommandCall {
  argv: string[];
  /** Raw argv join — the string `match` patterns are tested against. */
  command: string;
  /** Shell-quoted form, for readable assertions and diagnostics. */
  quotedCommand: string;
  options?: CommandRunnerOptions;
}

function matchesFakeResponse(
  response: FakeCommandResponse,
  argv: string[],
): boolean {
  const joined = argv.join(' ');

  if (Array.isArray(response.match)) {
    return response.match.every((part) => joined.includes(part));
  }

  if (response.match instanceof RegExp) {
    return response.match.test(joined);
  }

  return response.match(argv);
}

/**
 * Scripted runner for unit and contract tests. It records every call and fails
 * loudly on unmatched commands, so tests catch accidental command drift.
 */
export class FakeCommandRunner implements CommandRunner {
  readonly calls: FakeCommandCall[] = [];

  constructor(private readonly responses: FakeCommandResponse[] = []) {}

  async run(
    argv: string[],
    options?: CommandRunnerOptions,
  ): Promise<CommandRunnerResult> {
    const command = argv.join(' ');
    this.calls.push({
      argv: [...argv],
      command,
      quotedCommand: joinShellCommand(argv),
      options,
    });

    const response = this.responses.find((candidate) =>
      matchesFakeResponse(candidate, argv),
    );

    if (!response) {
      throw new CommandRunnerError(
        `FakeCommandRunner received an unmatched command: ${command}`,
        { kind: 'spawn-failed', argv, durationMs: 0 },
      );
    }

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    if (response.failure) {
      throw new CommandRunnerError(
        response.failure.message ??
          `Fake command failed (${response.failure.kind}): ${command}`,
        {
          kind: response.failure.kind,
          argv,
          durationMs: response.delayMs ?? 0,
          stderr: response.stderr ?? '',
        },
      );
    }

    return {
      exitCode: response.exitCode ?? 0,
      signal: response.signal ?? null,
      stdout: Buffer.isBuffer(response.stdout)
        ? response.stdout
        : Buffer.from(response.stdout ?? '', 'utf8'),
      stderr: response.stderr ?? '',
      durationMs: response.delayMs ?? 0,
    };
  }

  /** Commands issued so far, in order — handy for assertions and diagnostics. */
  get commands(): string[] {
    return this.calls.map((call) => call.command);
  }

  /** Shell-quoted form of every command issued so far. */
  get quotedCommands(): string[] {
    return this.calls.map((call) => call.quotedCommand);
  }

  /** Last command issued, or `undefined` before any call. */
  get lastCommand(): string | undefined {
    return this.commands.at(-1);
  }

  /** stderr snippet helper for assertions. */
  static snippet(value: Buffer): string {
    return bufferToSnippet(value);
  }
}
