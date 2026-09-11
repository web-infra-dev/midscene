import { getDebug } from '@midscene/shared/logger';

import {
  type CommandRunner,
  CommandRunnerError,
  type CommandRunnerOptions,
  type CommandRunnerResult,
  NodeCommandRunner,
  joinShellCommand,
  quoteShellArg,
} from './command-runner';
import { AndroidTransportError, toAndroidTransportError } from './errors';
import { findDisplay, parseDisplays } from './parsers/display';
import { Semaphore } from './semaphore';
import type {
  ActivityTarget,
  AndroidCapabilities,
  AndroidTransport,
  DisplayInfo,
  DisplayQueryOptions,
  InputOptions,
  Point,
  ScreenshotOptions,
  ShellOptions,
  ShellResult,
  TextInputOptions,
  TransportBackend,
  TransportHealth,
} from './types';
import {
  assertDisplayId,
  assertFiniteNumber,
  assertNonEmptyString,
  assertPoint,
  assertPositiveInteger,
} from './validate';

const debugRish = getDebug('android-local:rish');

export const DEFAULT_RISH_PATH = '/data/local/tmp/rish';
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_SCREENSHOT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_CONCURRENT_COMMANDS = 4;
export const DEFAULT_DISPLAY_CACHE_TTL_MS = 2_000;

/** uid of adb shell (and of a Shizuku shell channel). */
const SHELL_UID = 2000;
const ROOT_UID = 0;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export interface RishTransportOptions {
  /** Path of the `rish` script on the device. */
  rishPath?: string;
  /** Arguments used to pass the command; Shizuku's rish uses `-c`. */
  rishArgs?: string[];
  /**
   * Launch rish through `sh <script> -c <cmd>` (default true). Directly
   * exec'ing a script fails on noexec mounts such as `/sdcard`, and the
   * direct-exec path still has to be validated on real devices (see
   * `docs/roadmap.md` P0-4).
   */
  useShLauncher?: boolean;
  /** Interpreter used when `useShLauncher` is enabled. */
  shPath?: string;
  defaultTimeoutMs?: number;
  screenshotTimeoutMs?: number;
  /** Default display for every operation, when the caller does not override. */
  displayId?: number;
  runner?: CommandRunner;
  maxConcurrentCommands?: number;
  /** TTL of the `dumpsys display` cache; 0 disables caching. */
  displayCacheTtlMs?: number;
}

interface CommandOutcome {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
  durationMs: number;
  command: string;
}

export class RishTransport implements AndroidTransport {
  readonly backend: TransportBackend = 'rish';

  private readonly runner: CommandRunner;
  private readonly semaphore: Semaphore;
  private readonly rishPath: string;
  private readonly rishArgs: string[];
  private readonly useShLauncher: boolean;
  private readonly shPath: string;
  private readonly defaultTimeoutMs: number;
  private readonly screenshotTimeoutMs: number;
  private readonly defaultDisplayId: number | undefined;
  private readonly displayCacheTtlMs: number;

  private capabilities?: AndroidCapabilities;
  private capabilitiesPromise?: Promise<AndroidCapabilities>;
  private displayCache?: { displays: DisplayInfo[]; fetchedAt: number };
  private closed = false;

  constructor(options: RishTransportOptions = {}) {
    this.runner = options.runner ?? new NodeCommandRunner();
    this.rishPath =
      options.rishPath ?? process.env.MIDSCENE_RISH_PATH ?? DEFAULT_RISH_PATH;
    this.rishArgs = options.rishArgs ?? ['-c'];
    this.useShLauncher = options.useShLauncher ?? true;
    this.shPath = options.shPath ?? 'sh';
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.screenshotTimeoutMs =
      options.screenshotTimeoutMs ?? DEFAULT_SCREENSHOT_TIMEOUT_MS;
    this.defaultDisplayId = options.displayId;
    this.displayCacheTtlMs =
      options.displayCacheTtlMs ?? DEFAULT_DISPLAY_CACHE_TTL_MS;
    this.semaphore = new Semaphore(
      options.maxConcurrentCommands ?? DEFAULT_MAX_CONCURRENT_COMMANDS,
    );

    assertDisplayId(this.defaultDisplayId, this.backend);
  }

  // ---------------------------------------------------------------------------
  // capabilities / health
  // ---------------------------------------------------------------------------

  async getCapabilities(): Promise<AndroidCapabilities> {
    this.assertOpen();

    if (this.capabilities) {
      return this.capabilities;
    }

    if (!this.capabilitiesPromise) {
      this.capabilitiesPromise = this.probeCapabilities().finally(() => {
        this.capabilitiesPromise = undefined;
      });
    }

    this.capabilities = await this.capabilitiesPromise;
    return this.capabilities;
  }

  private async probeCapabilities(): Promise<AndroidCapabilities> {
    const uid = await this.probeUid();

    const [screenshot, input, appManagement] = await Promise.all([
      this.probeCommand('screencap'),
      this.probeCommand('input'),
      this.probeCommand('am'),
    ]);

    let multiDisplay = false;
    try {
      multiDisplay = (await this.listDisplays()).length > 1;
    } catch (error) {
      debugRish(
        `display probe failed, assuming a single display: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const capabilities: AndroidCapabilities = {
      backend: this.backend,
      shell: true,
      screenshot,
      input,
      appManagement,
      multiDisplay,
      textInput: 'ascii-only',
      privileged: uid === SHELL_UID || uid === ROOT_UID,
      uid,
    };

    if (!capabilities.privileged) {
      debugRish(
        `rish runs as uid ${uid}, not shell(2000)/root(0); ADB-equivalent commands will fail`,
      );
    }

    return capabilities;
  }

  private async probeUid(): Promise<number> {
    const outcome = await this.execute('id -u', {
      timeoutMs: this.defaultTimeoutMs,
    });

    const uid = Number.parseInt(outcome.stdout.toString('utf8').trim(), 10);
    if (outcome.exitCode !== 0 || !Number.isFinite(uid)) {
      throw new AndroidTransportError(
        'Unable to determine the uid of the rish shell channel',
        {
          code: 'ServiceUnavailable',
          backend: this.backend,
          command: outcome.command,
          exitCode: outcome.exitCode,
          stdout: outcome.stdout.toString('utf8'),
          stderr: outcome.stderr,
        },
      );
    }

    return uid;
  }

  private async probeCommand(name: string): Promise<boolean> {
    try {
      const outcome = await this.execute(`command -v ${name}`, {
        timeoutMs: this.defaultTimeoutMs,
      });
      return outcome.exitCode === 0 && outcome.stdout.length > 0;
    } catch (error) {
      debugRish(
        `probe for "${name}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async healthCheck(): Promise<TransportHealth> {
    const startedAt = Date.now();

    try {
      if (this.closed) {
        return {
          ok: false,
          backend: this.backend,
          uid: null,
          latencyMs: 0,
          checkedAt: startedAt,
          details: 'transport is closed',
        };
      }

      const uid = await this.probeUid();
      return {
        ok: true,
        backend: this.backend,
        uid,
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
        details:
          uid === SHELL_UID || uid === ROOT_UID
            ? undefined
            : `unprivileged uid ${uid}; ADB-equivalent commands will fail`,
      };
    } catch (error) {
      const transportError = toAndroidTransportError(error, {
        code: 'ServiceUnavailable',
        backend: this.backend,
        message: 'rish health check failed',
      });

      return {
        ok: false,
        backend: this.backend,
        uid: null,
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
        details: transportError.describe(),
        error: transportError,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // screen
  // ---------------------------------------------------------------------------

  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    this.assertOpen();
    const displayId = options.displayId ?? this.defaultDisplayId;
    assertDisplayId(displayId, this.backend);
    const timeoutMs = options.timeoutMs ?? this.screenshotTimeoutMs;
    const displayArg = this.displayArg(displayId);

    let firstFailure: string | undefined;

    // Preferred path: `screencap -p` piped through base64, so no temp file is
    // written and the payload survives the shell channel intact.
    try {
      const outcome = await this.execute(
        `screencap -p${displayArg} | base64 -w0`,
        { timeoutMs },
      );

      if (outcome.exitCode === 0) {
        const buffer = Buffer.from(
          outcome.stdout.toString('utf8').replace(/\s+/g, ''),
          'base64',
        );
        if (isImageBuffer(buffer)) {
          return buffer;
        }
        firstFailure = `screencap produced ${buffer.length} bytes without a PNG/JPEG header`;
      } else {
        firstFailure = `screencap exited with ${outcome.exitCode}: ${outcome.stderr.trim()}`;
      }
    } catch (error) {
      if (error instanceof AndroidTransportError && error.code === 'Timeout') {
        throw error;
      }
      firstFailure = error instanceof Error ? error.message : String(error);
    }

    debugRish(
      `base64 screenshot path failed (${firstFailure}); retrying with a binary pipe`,
    );

    // Fallback: read the PNG straight from stdout as bytes.
    try {
      const outcome = await this.execute(`screencap -p${displayArg}`, {
        timeoutMs,
      });

      if (outcome.exitCode === 0 && isImageBuffer(outcome.stdout)) {
        return outcome.stdout;
      }

      throw new AndroidTransportError(
        `Unable to capture a screenshot (${firstFailure}; binary pipe exited with ${outcome.exitCode})`,
        {
          code: 'ScreenshotFailed',
          backend: this.backend,
          command: outcome.command,
          exitCode: outcome.exitCode,
          stderr: outcome.stderr || firstFailure,
        },
      );
    } catch (error) {
      throw toAndroidTransportError(error, {
        code: 'ScreenshotFailed',
        backend: this.backend,
        message: 'Unable to capture a screenshot',
        timeoutMs,
      });
    }
  }

  async listDisplays(): Promise<DisplayInfo[]> {
    this.assertOpen();

    const now = Date.now();
    if (
      this.displayCache &&
      this.displayCacheTtlMs > 0 &&
      now - this.displayCache.fetchedAt < this.displayCacheTtlMs
    ) {
      return this.displayCache.displays;
    }

    const [displayOutcome, sizeOutcome, densityOutcome] = await Promise.all([
      this.execute('dumpsys display', { timeoutMs: this.defaultTimeoutMs }),
      this.execute('wm size', { timeoutMs: this.defaultTimeoutMs }),
      this.execute('wm density', { timeoutMs: this.defaultTimeoutMs }),
    ]);

    if (displayOutcome.exitCode !== 0) {
      throw new AndroidTransportError('Unable to read display information', {
        code: 'CommandFailed',
        backend: this.backend,
        command: displayOutcome.command,
        exitCode: displayOutcome.exitCode,
        stderr: displayOutcome.stderr,
      });
    }

    const displays = parseDisplays({
      dumpsysDisplay: displayOutcome.stdout.toString('utf8'),
      wmSize: sizeOutcome.stdout.toString('utf8'),
      wmDensity: densityOutcome.stdout.toString('utf8'),
    });

    if (displays.length === 0) {
      throw new AndroidTransportError(
        'Unable to parse any display from `dumpsys display` / `wm size`',
        {
          code: 'CommandFailed',
          backend: this.backend,
          command: displayOutcome.command,
          stdout: displayOutcome.stdout.toString('utf8').slice(0, 500),
        },
      );
    }

    this.displayCache = { displays, fetchedAt: now };
    return displays;
  }

  async getDisplayInfo(
    options: DisplayQueryOptions = {},
  ): Promise<DisplayInfo> {
    const displays = await this.listDisplays();
    const displayId = options.displayId ?? this.defaultDisplayId;
    assertDisplayId(displayId, this.backend);

    if (displayId === undefined) {
      const byDefault = displays.find((display) => display.isDefault);
      if (!byDefault) {
        throw new AndroidTransportError('Device reports no default display', {
          code: 'CommandFailed',
          backend: this.backend,
        });
      }
      return byDefault;
    }

    const display = findDisplay(displays, displayId);
    if (!display) {
      throw new AndroidTransportError(
        `Display ${displayId} does not exist (available: ${displays
          .map((candidate) => candidate.id)
          .join(', ')})`,
        { code: 'InvalidArgument', backend: this.backend },
      );
    }

    return display;
  }

  // ---------------------------------------------------------------------------
  // input
  // ---------------------------------------------------------------------------

  async tap(x: number, y: number, options: InputOptions = {}): Promise<void> {
    this.assertOpen();
    assertFiniteNumber(x, 'x', this.backend);
    assertFiniteNumber(y, 'y', this.backend);
    assertDisplayId(options.displayId, this.backend);
    const displayArg = this.displayArg(options.displayId);
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);

    // `input swipe x y x y duration` is the long-press primitive; `input tap`
    // has no duration parameter.
    const command = options.durationMs
      ? `input${displayArg} swipe ${roundedX} ${roundedY} ${roundedX} ${roundedY} ${assertGestureDuration(
          options.durationMs,
          this.backend,
        )}`
      : `input${displayArg} tap ${roundedX} ${roundedY}`;

    await this.runOrThrow(command, 'tap');
  }

  async swipe(
    from: Point,
    to: Point,
    options: InputOptions = {},
  ): Promise<void> {
    this.assertOpen();
    assertPoint(from, 'from', this.backend);
    assertPoint(to, 'to', this.backend);
    assertDisplayId(options.displayId, this.backend);
    const displayArg = this.displayArg(options.displayId);
    const duration = assertGestureDuration(
      options.durationMs ?? 300,
      this.backend,
    );

    await this.runOrThrow(
      `input${displayArg} swipe ${Math.round(from.x)} ${Math.round(from.y)} ${Math.round(
        to.x,
      )} ${Math.round(to.y)} ${duration}`,
      'swipe',
    );
  }

  async keyEvent(
    keyCode: number | number[],
    options: InputOptions = {},
  ): Promise<void> {
    this.assertOpen();
    const keyCodes = Array.isArray(keyCode) ? keyCode : [keyCode];

    if (keyCodes.length === 0) {
      throw new AndroidTransportError(
        'keyEvent requires at least one keycode',
        {
          code: 'InvalidArgument',
          backend: this.backend,
        },
      );
    }

    for (const code of keyCodes) {
      assertPositiveInteger(code, 'keyCode', this.backend);
    }

    assertDisplayId(options.displayId, this.backend);

    await this.runOrThrow(
      `input${this.displayArg(options.displayId)} keyevent ${keyCodes.join(' ')}`,
      'keyevent',
    );
  }

  async inputText(text: string, options: TextInputOptions = {}): Promise<void> {
    this.assertOpen();
    assertNonEmptyString(text, 'text', this.backend);
    assertDisplayId(options.displayId, this.backend);

    if (!isAsciiPrintable(text)) {
      throw new AndroidTransportError(
        'input text can only deliver printable ASCII; non-ASCII input needs a dedicated IME/input service',
        {
          code: 'NotSupported',
          backend: this.backend,
          command: `input${this.displayArg(options.displayId)} text <non-ascii>`,
        },
      );
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const displayArg = this.displayArg(options.displayId);
    const segments = text.split('\n');

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index] as string;
      if (segment.length > 0) {
        await this.runOrThrow(
          `input${displayArg} text ${quoteShellArg(segment)}`,
          'input text',
          timeoutMs,
        );
      }

      if (index < segments.length - 1) {
        // `input text` cannot type a newline; commit the line with ENTER.
        await this.keyEvent(66, options);
      }
    }
  }

  async startActivity(target: ActivityTarget): Promise<void> {
    this.assertOpen();
    if (!target || typeof target !== 'object') {
      throw new AndroidTransportError('target must be an object', {
        code: 'InvalidArgument',
        backend: this.backend,
      });
    }

    const { packageName, activity, uri } = target;
    assertNonEmptyString(packageName, 'packageName', this.backend);

    if (uri !== undefined) {
      assertNonEmptyString(uri, 'uri', this.backend);
      await this.runOrThrow(
        `am start -W -a android.intent.action.VIEW -d ${quoteShellArg(uri)} -p ${quoteShellArg(
          packageName,
        )}`,
        'startActivity',
      );
      return;
    }

    if (activity !== undefined) {
      assertNonEmptyString(activity, 'activity', this.backend);
      // Accept both `.MainActivity` and a fully qualified `pkg/.MainActivity`.
      const component = activity.includes('/')
        ? activity
        : `${packageName}/${activity}`;
      await this.runOrThrow(
        `am start -W -n ${quoteShellArg(component)}`,
        'startActivity',
      );
      return;
    }

    // No component or deep link: ask the launcher through monkey.
    await this.runOrThrow(
      `monkey -p ${quoteShellArg(packageName)} -c android.intent.category.LAUNCHER 1`,
      'startActivity',
    );
  }

  async forceStop(packageName: string): Promise<void> {
    this.assertOpen();
    assertNonEmptyString(packageName, 'packageName', this.backend);
    await this.runOrThrow(
      `am force-stop ${quoteShellArg(packageName)}`,
      'forceStop',
    );
  }

  // ---------------------------------------------------------------------------
  // shell
  // ---------------------------------------------------------------------------

  async runShell(
    command: string,
    options: ShellOptions = {},
  ): Promise<ShellResult> {
    this.assertOpen();
    assertNonEmptyString(command, 'command', this.backend);

    const outcome = await this.execute(command, {
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
    });

    return {
      stdout: options.binary
        ? outcome.stdout.toString('base64')
        : outcome.stdout.toString('utf8'),
      stderr: outcome.stderr,
      exitCode: outcome.exitCode,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.capabilities = undefined;
    this.displayCache = undefined;
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private assertOpen(): void {
    if (this.closed) {
      throw new AndroidTransportError('Transport is closed', {
        code: 'ServiceUnavailable',
        backend: this.backend,
      });
    }
  }

  private displayArg(displayId?: number): string {
    const resolved = displayId ?? this.defaultDisplayId;
    return typeof resolved === 'number' ? ` -d ${resolved}` : '';
  }

  private buildArgv(command: string): string[] {
    return this.useShLauncher
      ? [this.shPath, this.rishPath, ...this.rishArgs, command]
      : [this.rishPath, ...this.rishArgs, command];
  }

  private async execute(
    command: string,
    options: { timeoutMs?: number } = {},
  ): Promise<CommandOutcome> {
    const argv = this.buildArgv(command);
    const runnerOptions: CommandRunnerOptions = {
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
    };

    return await this.semaphore.run(async () => {
      let result: CommandRunnerResult;
      try {
        result = await this.runner.run(argv, runnerOptions);
      } catch (error) {
        throw this.mapRunnerError(error, command, runnerOptions.timeoutMs);
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? -1,
        durationMs: result.durationMs,
        command,
      };
    });
  }

  private mapRunnerError(
    error: unknown,
    command: string,
    timeoutMs?: number,
  ): AndroidTransportError {
    if (error instanceof CommandRunnerError) {
      const code = (() => {
        switch (error.kind) {
          case 'timeout':
            return 'Timeout' as const;
          case 'output-overflow':
            return 'CommandFailed' as const;
          default:
            return 'ServiceUnavailable' as const;
        }
      })();

      if (error.kind === 'spawn-failed') {
        debugRish(
          `rish could not be started: ${error.message} (path: ${this.rishPath})`,
        );
      }

      return new AndroidTransportError(error.message, {
        code,
        backend: this.backend,
        command,
        timeoutMs,
        stderr: error.stderr,
        cause: error,
      });
    }

    return toAndroidTransportError(error, {
      code: 'CommandFailed',
      backend: this.backend,
      command,
      timeoutMs,
    });
  }

  private async runOrThrow(
    command: string,
    label: string,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<CommandOutcome> {
    const outcome = await this.execute(command, { timeoutMs });

    if (outcome.exitCode !== 0) {
      throw new AndroidTransportError(`${label} failed`, {
        code: 'CommandFailed',
        backend: this.backend,
        command: outcome.command,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout.toString('utf8').trim(),
        stderr: outcome.stderr.trim(),
      });
    }

    return outcome;
  }

  /** Diagnostics helper: the exact argv a shell command turns into. */
  describeCommand(command: string): string {
    return joinShellCommand(this.buildArgv(command));
  }
}

function assertGestureDuration(
  value: number,
  backend: TransportBackend,
): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AndroidTransportError('durationMs must be a positive integer', {
      code: 'InvalidArgument',
      backend,
    });
  }

  return value;
}

function isImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 3) {
    return false;
  }

  return (
    buffer.subarray(0, 4).equals(PNG_MAGIC) ||
    buffer.subarray(0, 3).equals(JPEG_MAGIC)
  );
}

/** `input text` treats everything outside printable ASCII as unsupported. */
function isAsciiPrintable(value: string): boolean {
  for (const character of value) {
    if (character === '\n') {
      continue;
    }

    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }

  return true;
}
