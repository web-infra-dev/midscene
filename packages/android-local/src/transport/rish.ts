import fs from 'node:fs';
import path from 'node:path';

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
import {
  AndroidTransportError,
  isAndroidTransportError,
  toAndroidTransportError,
} from './errors';
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

/**
 * Variables stripped from the spawned rish process.
 *
 * A terminal runtime (Termux) exports `LD_LIBRARY_PATH=$PREFIX/lib`. rish then
 * launches `/system/bin/app_process`, which would resolve the terminal's
 * libraries instead of the system ones and die with
 * `cannot locate symbol "Xzs_Construct" referenced by
 * /system/lib64/libunwindstack.so` (measured on Android 12 + Termux + Shizuku
 * 13.6.0, see `docs/roadmap.md` P0-4).
 */
export const DEFAULT_UNSET_ENV = ['LD_LIBRARY_PATH', 'LD_PRELOAD'];

/**
 * Capability probes retry once: a single heavyweight rish spawn can fail
 * transiently on a busy device, and treating that as "unsupported" would
 * silently drop device actions.
 */
export const CAPABILITY_PROBE_ATTEMPTS = 2;

/**
 * Directory used for the on-device file channel.
 *
 * Created by the shell uid with mode 0755 (the agent only needs to read it).
 * Phase 2 replaces this with an app-private directory or fd passing through the
 * Shizuku UserService.
 */
export const DEFAULT_FILE_CHANNEL_DIR = '/data/local/tmp/midscene-channel';

/** Fixed channel file names: one in-flight file per purpose, no leftovers. */
const SCREENSHOT_CHANNEL_FILE = 'shot.png';
const TEXT_CHANNEL_FILE = 'shell.txt';

/**
 * Filesystem seam for the on-device file channel. Tests inject a fake so the
 * transport stays device-free.
 *
 * There is deliberately no `remove`: SELinux forbids the app uid from writing
 * or deleting anything under `/data/local/tmp` (measured — a 0777 directory is
 * not enough, `touch`/`rm` both fail with EACCES while reads succeed), so the
 * shell removes its own file inside the same command that writes it.
 */
export interface ShellFileIo {
  read(filePath: string): Promise<Buffer>;
}

const nodeFileIo: ShellFileIo = {
  read: (filePath) => fs.promises.readFile(filePath),
};

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
  /**
   * Environment variables removed before spawning rish. Defaults to
   * {@link DEFAULT_UNSET_ENV}; pass `[]` to inherit the environment verbatim.
   */
  unsetEnv?: string[];
  /**
   * Directory for the on-device file channel (screenshots and large command
   * output). Must be writable by the shell uid and readable by this process.
   * Defaults to {@link DEFAULT_FILE_CHANNEL_DIR}.
   */
  fileChannelDir?: string;
  /**
   * Path of the yadb dex used for non-ASCII (CJK, emoji) text input. Defaults
   * to {@link DEFAULT_YADB_PATH}; the capability probe reports `textInput:
   * 'ascii-only'` when the file is missing.
   */
  yadbPath?: string;
  /** Filesystem seam; tests inject a fake. */
  fileIo?: ShellFileIo;
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
  private readonly unsetEnv: string[];
  private readonly fileChannelDir: string;
  private readonly yadbPath: string;
  private yadbAvailable?: boolean;
  private readonly fileIo: ShellFileIo;
  private channelDirPromise?: Promise<void>;
  /**
   * The file channel uses one fixed path per purpose, so only one operation may
   * use it at a time; the shell replaces the file on every call.
   */
  private readonly fileChannelLock = new Semaphore(1);

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
    this.unsetEnv = options.unsetEnv ?? DEFAULT_UNSET_ENV;
    this.fileChannelDir = options.fileChannelDir ?? DEFAULT_FILE_CHANNEL_DIR;
    this.yadbPath = options.yadbPath ?? DEFAULT_YADB_PATH;
    this.fileIo = options.fileIo ?? nodeFileIo;
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

  /**
   * Probe capabilities one command at a time.
   *
   * Each rish call starts a fresh `app_process` (measured 0.4–1.8s on a 2-core
   * Android 12 emulator). Running the probes in parallel produced *transient*
   * failures on device — `command -v input` exited non-zero while the same
   * command succeeded standalone, which silently produced an empty action
   * space. Sequential probing plus one retry is the reliable behaviour.
   */
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
      gestures: yadbAvailable,
      textInput: yadbAvailable ? 'full' : 'ascii-only',
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
    let lastOutcome: CommandOutcome | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= CAPABILITY_PROBE_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.execute('id -u', {
          timeoutMs: this.defaultTimeoutMs,
        });
        lastOutcome = outcome;

        const uid = Number.parseInt(combinedOutputText(outcome).trim(), 10);
        if (outcome.exitCode === 0 && Number.isFinite(uid)) {
          return uid;
        }

        debugRish(
          `id -u attempt ${attempt} returned exit=${outcome.exitCode} output=${JSON.stringify(
            combinedOutputText(outcome),
          )}`,
        );
      } catch (error) {
        lastError = error;
        debugRish(
          `id -u attempt ${attempt} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    throw new AndroidTransportError(
      'Unable to determine the uid of the rish shell channel',
      {
        code: 'ServiceUnavailable',
        backend: this.backend,
        command: lastOutcome?.command ?? 'id -u',
        exitCode: lastOutcome?.exitCode,
        stdout: lastOutcome?.stdout.toString('utf8'),
        stderr: lastOutcome?.stderr,
        cause: lastError,
      },
    );
  }

  /** True when a file exists on the device (used for optional helpers). */
  private async probeFile(filePath: string): Promise<boolean> {
    try {
      const outcome = await this.execute(
        `test -f ${quoteShellArg(filePath)} && echo yes`,
        { timeoutMs: this.defaultTimeoutMs },
      );
      return (
        outcome.exitCode === 0 && combinedOutputText(outcome).includes('yes')
      );
    } catch (error) {
      debugRish(
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
        const outcome = await this.execute(`command -v ${name}`, {
          timeoutMs: this.defaultTimeoutMs,
        });

        if (
          outcome.exitCode === 0 &&
          combinedOutputText(outcome).trim() !== ''
        ) {
          return true;
        }

        debugRish(
          `probe for "${name}" attempt ${attempt} returned exit=${outcome.exitCode} output=${JSON.stringify(
            combinedOutputText(outcome),
          )}`,
        );
      } catch (error) {
        debugRish(
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

  /**
   * Capture a screenshot through the on-device file channel.
   *
   * rish cannot carry large payloads: measured on Android 12 + Shizuku 13.6.0,
   * a 674KB PNG came back split across the stdout AND stderr pipes (346KB +
   * 328KB), so any pipe-based scheme silently truncates the image. Because the
   * agent runs *on the device*, the shell writes the file and this process reads
   * it directly — that is the advantage of local execution over adb.
   *
   * The file is transient: it is removed as soon as it has been read.
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    this.assertOpen();
    const displayId = options.displayId ?? this.defaultDisplayId;
    assertDisplayId(displayId, this.backend);
    const timeoutMs = options.timeoutMs ?? this.screenshotTimeoutMs;
    const displayArg = this.displayArg(displayId);

    let firstFailure: string | undefined;

    try {
      const result = await this.runToFile(`screencap -p${displayArg}`, {
        timeoutMs,
        fileName: SCREENSHOT_CHANNEL_FILE,
        writeMode: 'argument',
      });

      if (isImageBuffer(result.buffer)) {
        return result.buffer;
      }

      firstFailure = `screencap wrote ${result.buffer.length} bytes without a PNG/JPEG header`;
    } catch (error) {
      if (error instanceof AndroidTransportError && error.code === 'Timeout') {
        throw error;
      }
      firstFailure = error instanceof Error ? error.message : String(error);
    }

    debugRish(
      `file-channel screenshot failed (${firstFailure}); falling back to the rish pipe`,
    );

    // Fallback for devices where the file channel is unavailable. Pipes can be
    // truncated by rish, so this is best-effort only.
    try {
      const outcome = await this.execute(
        `screencap -p${displayArg} | base64 -w0`,
        { timeoutMs },
      );

      if (outcome.exitCode === 0) {
        const buffer = Buffer.from(
          combinedOutputText(outcome).replace(/\s+/g, ''),
          'base64',
        );
        if (isImageBuffer(buffer)) {
          return buffer;
        }
        firstFailure = `${firstFailure}; pipe produced ${buffer.length} bytes without an image header`;
      }
    } catch (error) {
      if (error instanceof AndroidTransportError && error.code === 'Timeout') {
        throw error;
      }
      firstFailure = `${firstFailure}; ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    throw new AndroidTransportError(
      `Unable to capture a screenshot: ${firstFailure}`,
      {
        code: 'ScreenshotFailed',
        backend: this.backend,
        command: `screencap -p${displayArg}`,
        timeoutMs,
      },
    );
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

    // Sequential on purpose: three concurrent `app_process` spawns compete for
    // the device CPU and can fail transiently (see `probeCapabilities`). The
    // dump is read through the file channel because rish splits large payloads
    // across its two pipes.
    const dumpsysDisplay = await this.runShellToTextFile('dumpsys display', {
      timeoutMs: this.defaultTimeoutMs,
    });
    const wmSizeOutcome = await this.execute('wm size', {
      timeoutMs: this.defaultTimeoutMs,
    });
    const wmDensityOutcome = await this.execute('wm density', {
      timeoutMs: this.defaultTimeoutMs,
    });

    const displays = parseDisplays({
      dumpsysDisplay,
      wmSize: combinedOutputText(wmSizeOutcome),
      wmDensity: combinedOutputText(wmDensityOutcome),
    });

    if (displays.length === 0) {
      throw new AndroidTransportError(
        'Unable to parse any display from `dumpsys display` / `wm size`',
        {
          code: 'CommandFailed',
          backend: this.backend,
          command: 'dumpsys display',
          stdout: dumpsysDisplay.slice(0, 500),
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

  /**
   * Type text into the focused field.
   *
   * Printable ASCII uses `input text`; anything else goes through yadb when it
   * is provisioned on the device (see {@link RishTransportOptions.yadbPath}).
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

  /**
   * Run an arbitrary shell command.
   *
   * `stdout` prefers the stdout stream but falls back to stderr: rish may route
   * a command's output to either pipe (measured — `id -u` arrived on stderr).
   * For payloads larger than a few KB use the file channel based commands
   * instead; rish splits big outputs across both pipes.
   */
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

  /**
   * Create the channel directory once, world-writable so the shell uid can
   * write into it and this process can delete from it.
   */
  private async ensureChannelDir(): Promise<void> {
    if (!this.channelDirPromise) {
      this.channelDirPromise = (async () => {
        // `.nomedia` keeps Android's media scanner away from the transient
        // payloads (it otherwise index-scans every screenshot we write).
        const outcome = await this.execute(
          `mkdir -p ${quoteShellArg(this.fileChannelDir)} && chmod 0755 ${quoteShellArg(this.fileChannelDir)} && touch ${quoteShellArg(`${this.fileChannelDir}/.nomedia`)}`,
          { timeoutMs: this.defaultTimeoutMs },
        );

        if (outcome.exitCode !== 0) {
          throw new AndroidTransportError(
            `Unable to prepare the file channel directory ${this.fileChannelDir}`,
            {
              code: 'CommandFailed',
              backend: this.backend,
              command: `mkdir -p ${this.fileChannelDir}`,
              exitCode: outcome.exitCode,
              stderr: combinedOutputText(outcome).trim(),
            },
          );
        }
      })().catch((error) => {
        // Allow a later call to retry after a transient failure.
        this.channelDirPromise = undefined;
        throw error;
      });
    }

    await this.channelDirPromise;
  }

  /**
   * Run a command whose stdout must survive intact by writing it to an
   * on-device file and reading that file from this (on-device) process.
   *
   * `writeMode: 'argument'` appends the path as the final argument (commands
   * like `screencap` write the file themselves); `'redirect'` wraps the command
   * in a shell redirection.
   */
  private async runToFile(
    command: string,
    options: {
      timeoutMs?: number;
      fileName: string;
      writeMode: 'argument' | 'redirect';
    },
  ): Promise<{ filePath: string; buffer: Buffer }> {
    await this.ensureChannelDir();

    const filePath = path.posix.join(this.fileChannelDir, options.fileName);
    const writeCommand =
      options.writeMode === 'argument'
        ? `${command} ${quoteShellArg(filePath)}`
        : `${command} > ${quoteShellArg(filePath)}`;
    // `rm -f` first, inside the same shell command: the shell may delete its own
    // file, this keeps exactly one file per purpose, and a failed write can
    // never be mistaken for the previous frame (the file would be absent).
    const fullCommand = `rm -f ${quoteShellArg(filePath)} && ${writeCommand}`;

    return await this.fileChannelLock.run(async () => {
      try {
        const outcome = await this.execute(fullCommand, {
          timeoutMs: options.timeoutMs,
        });

        if (outcome.exitCode !== 0) {
          const detail = combinedOutputText(outcome).trim();
          throw new AndroidTransportError(
            `Command failed while writing to the file channel (exit ${outcome.exitCode})${
              detail ? `: ${detail}` : ''
            }`,
            {
              code: 'CommandFailed',
              backend: this.backend,
              command: fullCommand,
              exitCode: outcome.exitCode,
              stderr: detail,
            },
          );
        }

        return { filePath, buffer: await this.fileIo.read(filePath) };
      } catch (error) {
        if (isAndroidTransportError(error)) {
          throw error;
        }
        throw toAndroidTransportError(error, {
          code: 'CommandFailed',
          backend: this.backend,
          message: 'Unable to read the file channel payload',
          command: fullCommand,
        });
      }
    });
  }

  /**
   * Text output of a command whose payload may exceed the rish pipe limits
   * (for example `dumpsys display`, ~21KB).
   */
  private async runShellToTextFile(
    command: string,
    options: { timeoutMs?: number } = {},
  ): Promise<string> {
    const { buffer } = await this.runToFile(command, {
      timeoutMs: options.timeoutMs,
      fileName: TEXT_CHANNEL_FILE,
      writeMode: 'redirect',
    });

    return buffer.toString('utf8');
  }

  private async execute(
    command: string,
    options: { timeoutMs?: number } = {},
  ): Promise<CommandOutcome> {
    const argv = this.buildArgv(command);
    const runnerOptions: CommandRunnerOptions = {
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
      unsetEnv: this.unsetEnv,
      // rish briefly re-executes as the shell uid (2000). If the caller's cwd is
      // an app-private directory that uid cannot enter, rish logs
      // "access <cwd> failed with 13: Permission denied" and chdir fails, so
      // every rish command starts from / (all commands use absolute paths).
      cwd: '/',
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
