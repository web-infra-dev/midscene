import { getDebug } from '@midscene/shared/logger';

import {
  type CommandRunner,
  NodeCommandRunner,
  joinShellCommand,
  quoteShellArg,
} from './command-runner';
import { AndroidTransportError, toAndroidTransportError } from './errors';
import { findDisplay, parseDisplays } from './parsers/display';
import { combinedOutputText, isAsciiPrintable, isImageBuffer } from './payload';
import { Semaphore } from './semaphore';
import {
  DEFAULT_YADB_PATH,
  buildYadbPinchCommand,
  sendTextInput,
} from './text-input';
import type {
  ActivityTarget,
  AndroidCapabilities,
  AndroidTransport,
  DisplayInfo,
  DisplayQueryOptions,
  ExecChannel,
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

const debugAdb = getDebug('android-local:adb');

export const DEFAULT_ADB_PATH = 'adb';
export const DEFAULT_ADB_TIMEOUT_MS = 15_000;
export const DEFAULT_ADB_SCREENSHOT_TIMEOUT_MS = 20_000;
export const DEFAULT_ADB_MAX_CONCURRENT_COMMANDS = 4;
export const DEFAULT_ADB_DISPLAY_CACHE_TTL_MS = 2_000;

const SHELL_UID = 2000;
const ROOT_UID = 0;
/** `adb exec-out` reaches a device; `adb shell` would mangle binary output. */
const EXEC_OUT = 'exec-out';
const SHELL = 'shell';
const CAPABILITY_PROBE_ATTEMPTS = 2;

export interface AdbShellTransportOptions {
  /** Path (or command name) of the adb executable. */
  adbPath?: string;
  /** Target serial, e.g. `emulator-5554`. Omitted → adb picks the only device. */
  serial?: string;
  defaultTimeoutMs?: number;
  screenshotTimeoutMs?: number;
  displayId?: number;
  runner?: CommandRunner;
  maxConcurrentCommands?: number;
  /** TTL of the `dumpsys display` cache; 0 disables caching. */
  displayCacheTtlMs?: number;
  /**
   * Path of the yadb dex used for non-ASCII (CJK, emoji) text input. Defaults
   * to {@link DEFAULT_YADB_PATH}; the capability probe reports `textInput:
   * 'ascii-only'` when the file is missing.
   */
  yadbPath?: string;
}

interface AdbOutcome {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
  command: string;
}

/**
 * Debug and regression backend: drives a device through the host's adb.
 *
 * This is the counterpart of {@link ShellTransport} for the "PC + USB cable"
 * workflow, and the reference implementation in CI (the Android emulator
 * workflow has adb but no Shizuku). adb is a real protocol rather than a
 * subprocess shim, so unlike the on-device bridge it can carry binary payloads
 * on stdout and does not need the file channel.
 */
export class AdbShellTransport implements AndroidTransport {
  readonly backend: TransportBackend = 'adb-shell';
  readonly channel: ExecChannel = 'adb';

  private readonly adbPath: string;
  private readonly serial?: string;
  private readonly runner: CommandRunner;
  private readonly semaphore: Semaphore;
  private readonly defaultTimeoutMs: number;
  private readonly screenshotTimeoutMs: number;
  private readonly defaultDisplayId: number | undefined;
  private readonly displayCacheTtlMs: number;
  private readonly yadbPath: string;
  private yadbAvailable?: boolean;

  private capabilities?: AndroidCapabilities;
  private capabilitiesPromise?: Promise<AndroidCapabilities>;
  private displayCache?: { displays: DisplayInfo[]; fetchedAt: number };
  private closed = false;

  constructor(options: AdbShellTransportOptions = {}) {
    this.adbPath =
      options.adbPath ?? process.env.MIDSCENE_ADB_PATH ?? DEFAULT_ADB_PATH;
    this.serial = options.serial ?? process.env.MIDSCENE_ADB_DEVICE_ID;
    this.runner = options.runner ?? new NodeCommandRunner();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_ADB_TIMEOUT_MS;
    this.screenshotTimeoutMs =
      options.screenshotTimeoutMs ?? DEFAULT_ADB_SCREENSHOT_TIMEOUT_MS;
    this.defaultDisplayId = options.displayId;
    this.displayCacheTtlMs =
      options.displayCacheTtlMs ?? DEFAULT_ADB_DISPLAY_CACHE_TTL_MS;
    this.yadbPath = options.yadbPath ?? DEFAULT_YADB_PATH;
    this.semaphore = new Semaphore(
      options.maxConcurrentCommands ?? DEFAULT_ADB_MAX_CONCURRENT_COMMANDS,
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
    const screenshot = await this.probeCommand('screencap');
    const input = await this.probeCommand('input');
    const appManagement = await this.probeCommand('am');
    const yadbAvailable = await this.probeFile(this.yadbPath);
    this.yadbAvailable = yadbAvailable;

    let multiDisplay = false;
    try {
      multiDisplay = (await this.listDisplays()).length > 1;
    } catch (error) {
      debugAdb(
        `display probe failed, assuming a single display: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const capabilities: AndroidCapabilities = {
      backend: this.backend,
      channel: this.channel,
      shell: true,
      screenshot,
      input,
      appManagement,
      multiDisplay,
      gestures: yadbAvailable,
      textInput: yadbAvailable ? 'full' : 'ascii-only',
      privileged: uid === SHELL_UID || uid === ROOT_UID,
      uid,
    };

    if (!capabilities.privileged) {
      debugAdb(
        `adb shell reports uid ${uid}; adb-equivalent commands may fail`,
      );
    }

    return capabilities;
  }

  private async probeUid(): Promise<number> {
    for (let attempt = 1; attempt <= CAPABILITY_PROBE_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.executeShell('id -u');
        const uid = Number.parseInt(combinedOutputText(outcome).trim(), 10);
        if (outcome.exitCode === 0 && Number.isFinite(uid)) {
          return uid;
        }
        debugAdb(
          `id -u attempt ${attempt} returned exit=${outcome.exitCode} output=${JSON.stringify(
            combinedOutputText(outcome),
          )}`,
        );
      } catch (error) {
        debugAdb(
          `id -u attempt ${attempt} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    throw new AndroidTransportError(
      'Unable to determine the uid of the adb shell channel',
      { code: 'ServiceUnavailable', backend: this.backend, command: 'id -u' },
    );
  }

  /** True when a file exists on the device (used for optional helpers). */
  private async probeFile(filePath: string): Promise<boolean> {
    try {
      const outcome = await this.executeShell(
        `test -f ${quoteShellArg(filePath)} && echo yes`,
      );
      return (
        outcome.exitCode === 0 && combinedOutputText(outcome).includes('yes')
      );
    } catch (error) {
      debugAdb(
        `file probe for "${filePath}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async probeCommand(name: string): Promise<boolean> {
    for (let attempt = 1; attempt <= CAPABILITY_PROBE_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.executeShell(`command -v ${name}`);
        if (
          outcome.exitCode === 0 &&
          combinedOutputText(outcome).trim() !== ''
        ) {
          return true;
        }
      } catch (error) {
        debugAdb(
          `probe for "${name}" attempt ${attempt} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return false;
  }

  async healthCheck(): Promise<TransportHealth> {
    const startedAt = Date.now();

    try {
      if (this.closed) {
        return {
          ok: false,
          backend: this.backend,
          channel: this.channel,
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
        channel: this.channel,
        uid,
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
        details:
          uid === SHELL_UID || uid === ROOT_UID
            ? undefined
            : `unprivileged uid ${uid}`,
      };
    } catch (error) {
      const transportError = toAndroidTransportError(error, {
        code: 'ServiceUnavailable',
        backend: this.backend,
        message: 'adb health check failed',
      });

      return {
        ok: false,
        backend: this.backend,
        channel: this.channel,
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

  /**
   * `adb exec-out screencap -p` streams the PNG straight back, so no temp file
   * and no base64 round trip is needed — the counterpart of the file channel
   * that the on-device path requires.
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    this.assertOpen();
    const displayId = options.displayId ?? this.defaultDisplayId;
    assertDisplayId(displayId, this.backend);
    const timeoutMs = options.timeoutMs ?? this.screenshotTimeoutMs;
    const displayArg = this.displayArg(displayId);

    const outcome = await this.execute(
      [EXEC_OUT, `screencap -p${displayArg}`],
      { timeoutMs },
    );

    if (outcome.exitCode !== 0) {
      throw new AndroidTransportError('Unable to capture a screenshot', {
        code: 'ScreenshotFailed',
        backend: this.backend,
        command: outcome.command,
        exitCode: outcome.exitCode,
        stderr: outcome.stderr.trim(),
      });
    }

    if (!isImageBuffer(outcome.stdout)) {
      throw new AndroidTransportError(
        `screencap returned ${outcome.stdout.length} bytes without a PNG/JPEG header`,
        {
          code: 'ScreenshotFailed',
          backend: this.backend,
          command: outcome.command,
        },
      );
    }

    return outcome.stdout;
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

    const displayOutcome = await this.executeShell('dumpsys display', {
      timeoutMs: this.defaultTimeoutMs,
    });
    const sizeOutcome = await this.executeShell('wm size', {
      timeoutMs: this.defaultTimeoutMs,
    });
    const densityOutcome = await this.executeShell('wm density', {
      timeoutMs: this.defaultTimeoutMs,
    });

    if (displayOutcome.exitCode !== 0) {
      throw new AndroidTransportError('Unable to read display information', {
        code: 'CommandFailed',
        backend: this.backend,
        command: displayOutcome.command,
        exitCode: displayOutcome.exitCode,
        stderr: combinedOutputText(displayOutcome),
      });
    }

    const displays = parseDisplays({
      dumpsysDisplay: combinedOutputText(displayOutcome),
      wmSize: combinedOutputText(sizeOutcome),
      wmDensity: combinedOutputText(densityOutcome),
    });

    if (displays.length === 0) {
      throw new AndroidTransportError(
        'Unable to parse any display from `dumpsys display` / `wm size`',
        {
          code: 'CommandFailed',
          backend: this.backend,
          command: 'dumpsys display',
          stdout: combinedOutputText(displayOutcome).slice(0, 500),
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
        { code: 'InvalidArgument', backend: this.backend },
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

  /**
   * Type text into the focused field.
   *
   * Printable ASCII uses `input text`; anything else goes through yadb when it
   * is provisioned on the device (see {@link AdbShellTransportOptions.yadbPath}).
   */
  async inputText(text: string, options: TextInputOptions = {}): Promise<void> {
    this.assertOpen();
    assertNonEmptyString(text, 'text', this.backend);
    assertDisplayId(options.displayId, this.backend);

    // The yadb probe costs a shell round trip, so only pay it when the payload
    // actually needs yadb (`input text` covers printable ASCII on its own).
    const yadbAvailable = isAsciiPrintable(text)
      ? false
      : (this.yadbAvailable ?? (await this.probeFile(this.yadbPath)));
    if (!isAsciiPrintable(text)) {
      this.yadbAvailable = yadbAvailable;
    }

    await sendTextInput(text, {
      backend: this.backend,
      displayArg: this.displayArg(options.displayId),
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
      yadbAvailable,
      yadbPath: this.yadbPath,
      run: async (command, label, timeoutMs) => {
        await this.runOrThrow(command, label, timeoutMs);
      },
    });
  }

  /**
   * Two-finger pinch through yadb. Fails loudly when the helper is missing:
   * the device layer only advertises Pinch when `capabilities.gestures` is set.
   */
  async pinch(
    center: Point,
    options: {
      startDistance: number;
      endDistance: number;
      duration: number;
      displayId?: number;
    },
  ): Promise<void> {
    this.assertOpen();
    assertPoint(center, 'center', this.backend);
    assertFiniteNumber(options.startDistance, 'startDistance', this.backend);
    assertFiniteNumber(options.endDistance, 'endDistance', this.backend);
    assertFiniteNumber(options.duration, 'duration', this.backend);

    const yadbAvailable =
      this.yadbAvailable ?? (await this.probeFile(this.yadbPath));
    this.yadbAvailable = yadbAvailable;

    if (!yadbAvailable) {
      throw new AndroidTransportError(
        `Pinch needs the yadb helper at ${this.yadbPath}; push it once, e.g. \`adb push <midscene>/packages/android/bin/yadb ${this.yadbPath}\``,
        {
          code: 'NotSupported',
          backend: this.backend,
          command: 'app_process ... com.ysbing.yadb.Main -pinch',
        },
      );
    }

    await this.runOrThrow(
      buildYadbPinchCommand(this.yadbPath, center, options),
      'pinch',
    );
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

    if (uri !== undefined) {
      assertNonEmptyString(uri, 'uri', this.backend);
      const packageArg = packageName ? ` -p ${quoteShellArg(packageName)}` : '';
      await this.runOrThrow(
        `am start -W -a android.intent.action.VIEW -d ${quoteShellArg(uri)}${packageArg}`,
        'startActivity',
      );
      return;
    }

    assertNonEmptyString(packageName ?? '', 'packageName', this.backend);

    if (activity !== undefined) {
      assertNonEmptyString(activity, 'activity', this.backend);
      const component = activity.includes('/')
        ? activity
        : `${packageName}/${activity}`;
      await this.runOrThrow(
        `am start -W -n ${quoteShellArg(component)}`,
        'startActivity',
      );
      return;
    }

    await this.runOrThrow(
      `monkey -p ${quoteShellArg(packageName as string)} -c android.intent.category.LAUNCHER 1`,
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

    const outcome = await this.executeShell(command, {
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
    });

    return {
      stdout: options.binary
        ? outcome.stdout.toString('base64')
        : combinedOutputText(outcome),
      stderr: outcome.stderr,
      exitCode: outcome.exitCode,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.capabilities = undefined;
    this.displayCache = undefined;
  }

  /** The exact adb argv a shell command turns into; handy for diagnostics. */
  describeCommand(command: string): string {
    return joinShellCommand(this.buildArgv([SHELL, command]));
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

  private buildArgv(args: string[]): string[] {
    return this.serial
      ? [this.adbPath, '-s', this.serial, ...args]
      : [this.adbPath, ...args];
  }

  private async execute(
    args: string[],
    options: { timeoutMs?: number } = {},
  ): Promise<AdbOutcome> {
    const argv = this.buildArgv(args);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    return await this.semaphore.run(async () => {
      try {
        const result = await this.runner.run(argv, { timeoutMs });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode ?? -1,
          command: args[args.length - 1] ?? args.join(' '),
        };
      } catch (error) {
        throw toAndroidTransportError(error, {
          code: 'ServiceUnavailable',
          backend: this.backend,
          message: `adb command failed: ${joinShellCommand(argv)}`,
          timeoutMs,
        });
      }
    });
  }

  private async executeShell(
    command: string,
    options: { timeoutMs?: number } = {},
  ): Promise<AdbOutcome> {
    return await this.execute([SHELL, command], options);
  }

  private async runOrThrow(
    command: string,
    label: string,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<AdbOutcome> {
    const outcome = await this.executeShell(command, { timeoutMs });

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
