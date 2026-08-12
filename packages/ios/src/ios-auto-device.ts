import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  type ActionScrollParam,
  type DeviceAction,
  type InterfaceType,
  type Point,
  type Size,
  z,
} from '@midscene/core';
import type {
  AbstractInterface,
  IOSDeviceInputOpt,
  IOSDeviceOpt,
  MobileInputPrimitives,
  PointerPoint,
} from '@midscene/core/device';
import {
  createDefaultMobileActions,
  defineAction,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { normalizeForComparison } from '@midscene/shared/utils';

const execFileAsync = promisify(execFile);
const debugDevice = getDebug('ios:auto-device');

type IOSAutoDeviceOpt = IOSDeviceOpt;

const DOUBAOCLI_CONFIG_DIR = 'DOUBAOCLI_CONFIG_DIR';
const DOUBAOCLI_DATABASE_DIR = 'DOUBAOCLI_DATABASE_DIR';
const DOUBAOCLI_TEST_HOME = 'DOUBAOCLI_TEST_HOME';

type IOSAutoCommandResponse = {
  status: 'ok' | 'error';
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    hint?: string;
  };
};

type IOSAutoDisplay = {
  logicalViewport?: {
    width?: number;
    height?: number;
  };
};

type IOSAutoScreenshot = {
  artifacts?: Array<{
    kind?: string;
    path?: string;
    mediaType?: string;
  }>;
};

type IOSAutoDeviceInfo = {
  target?: {
    id?: string;
    name?: string;
  };
  device?: {
    model?: string;
  };
};

const formatPoint = (point: PointerPoint) =>
  `${formatCoordinate(point.x)},${formatCoordinate(point.y)}`;

const formatCoordinate = (coordinate: number) =>
  String(Number(coordinate.toFixed(6)));

const isUrl = (uri: string) =>
  uri.startsWith('http://') ||
  uri.startsWith('https://') ||
  uri.includes('://');

export class IOSAutoDevice implements AbstractInterface {
  private readonly options?: IOSAutoDeviceOpt;
  private readonly cliPath: string;
  private destroyed = false;
  private connected = false;
  private logicalSize: Size | undefined;
  private deviceId = 'ios-auto';
  private description = 'iOS device via doubaocli ios-auto';
  private appNameMapping: Record<string, string> = {};

  interfaceType: InterfaceType = 'ios';
  uri: string | undefined;

  readonly inputPrimitives: MobileInputPrimitives = {
    pointer: {
      tap: (point) => this.tapPoint(point),
      doubleClick: async (point) => {
        await this.invoke('gesture', 'tap', [
          '--point',
          formatPoint(point),
          '--count',
          '2',
        ]);
      },
      longPress: (point, opts) =>
        this.longPressPoint(point, opts?.duration ?? 800),
      dragAndDrop: (from, to) => this.dragPoint(from, to, 700),
    },
    keyboard: {
      keyboardPress: async (keyName) => {
        throw new Error(
          `ios-auto does not expose keyboard key presses (requested "${keyName}")`,
        );
      },
      typeText: async (value, opts) => {
        const target = opts?.target as ElementInfo | undefined;
        if (target) {
          await this.tapPoint({ x: target.center[0], y: target.center[1] });
        }
        if (opts?.replace !== false) {
          await this.clearInput(target);
        }
        if (opts?.focusOnly) {
          return;
        }
        await this.typeText(value, opts);
      },
      clearInput: (target) =>
        this.clearInput(target as ElementInfo | undefined),
      cursorMove: async (direction, times = 1) => {
        throw new Error(
          `ios-auto does not expose cursor movement (requested ${direction} ${times} times)`,
        );
      },
    },
    touch: {
      swipe: async (start, end, opts) => {
        const repeat = opts?.repeat ?? 1;
        for (let index = 0; index < repeat; index += 1) {
          await this.swipePoint(start, end, opts?.duration ?? 500);
        }
      },
    },
    scroll: {
      scroll: (param) => this.performActionScroll(param),
    },
  };

  constructor(options?: IOSAutoDeviceOpt) {
    this.options = options;
    this.cliPath = options?.iosAutoCliPath?.trim() || 'doubaocli';
  }

  describe(): string {
    return this.description;
  }

  async connect(): Promise<void> {
    this.assertNotDestroyed();
    const [display, deviceInfo] = await Promise.all([
      this.invoke<IOSAutoDisplay>('device', 'display'),
      this.invoke<IOSAutoDeviceInfo>('device', 'info'),
    ]);

    const width = display.logicalViewport?.width;
    const height = display.logicalViewport?.height;
    if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
      throw new Error(
        'ios-auto device display did not return a valid logical viewport',
      );
    }

    this.logicalSize = { width, height };
    this.deviceId = deviceInfo.target?.id || this.deviceId;
    const name = deviceInfo.target?.name || 'unknown';
    const model = deviceInfo.device?.model || 'unknown';
    this.description = `UDID: ${this.deviceId}\nName: ${name}\nModel: ${model}\nType: doubaocli ios-auto\nScreenSize: ${width}x${height}`;
    this.connected = true;
  }

  actionSpace(): DeviceAction<any>[] {
    const mobileActionContext = {
      input: this.inputPrimitives,
      size: () => this.size(),
      sleep: async (timeMs: number) => {
        await sleep(timeMs);
      },
      getDefaultAutoDismissKeyboard: () => this.options?.autoDismissKeyboard,
    };
    return [
      ...createDefaultMobileActions(mobileActionContext),
      ...Object.values(createIOSAutoPlatformActions(this)),
      ...(this.options?.customActions || []),
    ];
  }

  async size(): Promise<Size> {
    this.assertNotDestroyed();
    if (this.logicalSize) {
      return this.logicalSize;
    }
    const display = await this.invoke<IOSAutoDisplay>('device', 'display');
    const width = display.logicalViewport?.width;
    const height = display.logicalViewport?.height;
    if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
      throw new Error(
        'ios-auto device display did not return a valid logical viewport',
      );
    }
    this.logicalSize = { width, height };
    return this.logicalSize;
  }

  async screenshotBase64(): Promise<string> {
    this.assertNotDestroyed();
    const screenshot = await this.invoke<IOSAutoScreenshot>('ui', 'screenshot');
    const imagePath = screenshot.artifacts?.find(
      (artifact) =>
        artifact.kind === 'image' &&
        typeof artifact.path === 'string' &&
        artifact.path.length > 0,
    )?.path;
    if (!imagePath) {
      throw new Error(
        'ios-auto screenshot response did not contain a written image artifact',
      );
    }
    const image = await readFile(imagePath);
    return createImgBase64ByFormat('png', image.toString('base64'));
  }

  async getElementsInfo(): Promise<ElementInfo[]> {
    return [];
  }

  async getElementsNodeTree(): Promise<{ node: null; children: never[] }> {
    return { node: null, children: [] };
  }

  async url(): Promise<string> {
    return '';
  }

  async tap(x: number, y: number): Promise<void> {
    await this.tapPoint({ x, y });
  }

  async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    duration = 500,
  ): Promise<void> {
    await this.swipePoint({ x: fromX, y: fromY }, { x: toX, y: toY }, duration);
  }

  async launch(uri: string): Promise<IOSAutoDevice> {
    this.assertNotDestroyed();
    if (!uri.trim()) {
      throw new Error('Launch requires a non-empty uri parameter');
    }
    this.uri = uri;
    if (isUrl(uri)) {
      await this.invoke('app', 'open-url', ['--url', uri]);
    } else {
      await this.invoke('app', 'launch', [
        '--app-id',
        this.resolveBundleId(uri) ?? uri,
      ]);
    }
    return this;
  }

  async terminate(uri: string): Promise<void> {
    this.assertNotDestroyed();
    if (!uri.trim()) {
      throw new Error('Terminate requires a non-empty uri parameter');
    }
    await this.invoke('app', 'terminate', [
      '--app-id',
      this.resolveBundleId(uri) ?? uri,
    ]);
  }

  async home(): Promise<void> {
    await this.invoke('device', 'home');
  }

  setAppNameMapping(mapping: Record<string, string>): void {
    this.appNameMapping = mapping;
  }

  async hideKeyboard(): Promise<boolean> {
    await this.invoke('ui', 'dismiss-keyboard');
    return true;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.connected = false;
  }

  private async tapPoint(point: PointerPoint): Promise<void> {
    this.assertNotDestroyed();
    await this.invoke('gesture', 'tap', ['--point', formatPoint(point)]);
  }

  private async longPressPoint(
    point: PointerPoint,
    durationMs: number,
  ): Promise<void> {
    this.assertNotDestroyed();
    await this.invoke('gesture', 'long-press', [
      '--point',
      formatPoint(point),
      '--duration-ms',
      String(Math.round(durationMs)),
    ]);
  }

  private async dragPoint(
    from: PointerPoint,
    to: PointerPoint,
    durationMs: number,
  ): Promise<void> {
    this.assertNotDestroyed();
    await this.invoke('gesture', 'drag', [
      '--from',
      formatPoint(from),
      '--to',
      formatPoint(to),
      '--duration-ms',
      String(Math.round(durationMs)),
    ]);
  }

  private async swipePoint(
    from: PointerPoint,
    to: PointerPoint,
    durationMs: number,
  ): Promise<void> {
    this.assertNotDestroyed();
    await this.invoke('gesture', 'swipe', [
      '--from',
      formatPoint(from),
      '--to',
      formatPoint(to),
      '--duration-ms',
      String(Math.round(durationMs)),
    ]);
  }

  private async typeText(
    text: string,
    options?: IOSDeviceInputOpt,
  ): Promise<void> {
    if (!text) {
      return;
    }
    await this.invoke('ui', 'input-text', ['--text', text]);
    if (
      options?.autoDismissKeyboard ??
      this.options?.autoDismissKeyboard ??
      true
    ) {
      await this.hideKeyboard();
    }
  }

  private async clearInput(element?: ElementInfo): Promise<void> {
    if (element) {
      await this.tapPoint({ x: element.center[0], y: element.center[1] });
    }
    await this.invoke('ui', 'clear-text');
  }

  private async performActionScroll(param: ActionScrollParam): Promise<void> {
    const { width, height } = await this.size();
    const origin = param.locate
      ? { x: param.locate.center[0], y: param.locate.center[1] }
      : { x: width / 2, y: height / 2 };
    const distance =
      param.distance ??
      (param.direction === 'left' || param.direction === 'right'
        ? width * 0.7
        : height / 3);
    const direction = param.direction ?? 'down';

    if (
      param.scrollType &&
      param.scrollType !== 'singleAction' &&
      param.scrollType !== 'once'
    ) {
      throw new Error(
        `ios-auto does not support scroll type "${param.scrollType}"`,
      );
    }

    const destination = {
      x:
        direction === 'left'
          ? origin.x + distance
          : direction === 'right'
            ? origin.x - distance
            : origin.x,
      y:
        direction === 'up'
          ? origin.y + distance
          : direction === 'down'
            ? origin.y - distance
            : origin.y,
    };
    await this.swipePoint(origin, destination, 300);
    await sleep(500);
  }

  private async invoke<T = unknown>(
    domain: string,
    command: string,
    args: string[] = [],
  ): Promise<T> {
    this.assertNotDestroyed();
    const commandArgs = ['ios-auto', domain, command, ...args, '--json'];
    debugDevice(`Executing ${this.cliPath} ${commandArgs.join(' ')}`);

    let stdout: string;
    let stderr = '';
    try {
      const result = await execFileAsync(this.cliPath, commandArgs, {
        env: createIOSAutoCommandEnv(),
        maxBuffer: 16 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: unknown) {
      const executionError = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      stdout = executionError.stdout || '';
      stderr = executionError.stderr || '';
      const response = parseResponse(stdout);
      throw this.commandError(
        domain,
        command,
        response,
        stderr || executionError.message,
      );
    }

    const response = parseResponse(stdout);
    if (!response || response.status !== 'ok') {
      throw this.commandError(domain, command, response, stderr);
    }
    return response.data as T;
  }

  private commandError(
    domain: string,
    command: string,
    response: IOSAutoCommandResponse | undefined,
    stderr: string | undefined,
  ): Error {
    const source = `${this.cliPath} ios-auto ${domain} ${command}`;
    const details = [
      response?.error?.code,
      response?.error?.message,
      response?.error?.hint,
      stderr?.trim(),
    ]
      .filter(Boolean)
      .join(': ');
    return new Error(
      details ? `${source} failed: ${details}` : `${source} failed`,
    );
  }

  private assertNotDestroyed(): void {
    assert(!this.destroyed, 'IOSAutoDevice has been destroyed');
  }

  private resolveBundleId(appName: string): string | undefined {
    return this.appNameMapping[normalizeForComparison(appName)];
  }
}

function createIOSAutoCommandEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const configDir =
    env[DOUBAOCLI_CONFIG_DIR]?.trim() ||
    env[DOUBAOCLI_TEST_HOME]?.trim() ||
    os.homedir()?.trim();

  if (configDir && !env[DOUBAOCLI_CONFIG_DIR]?.trim()) {
    env[DOUBAOCLI_CONFIG_DIR] = configDir;
  }
  if (configDir && !env[DOUBAOCLI_DATABASE_DIR]?.trim()) {
    env[DOUBAOCLI_DATABASE_DIR] = path.join(configDir, '.doubaocli');
  }

  return env;
}

function parseResponse(value: string): IOSAutoCommandResponse | undefined {
  try {
    const parsed = JSON.parse(value) as IOSAutoCommandResponse;
    if (parsed && (parsed.status === 'ok' || parsed.status === 'error')) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const launchParamSchema = z.object({
  uri: z.string().describe('App bundle ID or URL to launch'),
});

type LaunchParam = z.infer<typeof launchParamSchema>;

const terminateParamSchema = z.object({
  uri: z.string().describe('App bundle ID to terminate'),
});

type TerminateParam = z.infer<typeof terminateParamSchema>;

function createIOSAutoPlatformActions(device: IOSAutoDevice) {
  return {
    Launch: defineAction<typeof launchParamSchema, LaunchParam, void>({
      name: 'Launch',
      description: 'Launch an iOS app or URL',
      interfaceAlias: 'launch',
      paramSchema: launchParamSchema,
      sample: { uri: 'com.apple.Preferences' },
      call: async (param) => {
        await device.launch(param.uri);
      },
    }),
    Terminate: defineAction<typeof terminateParamSchema, TerminateParam, void>({
      name: 'Terminate',
      description: 'Terminate an iOS app by bundle ID',
      interfaceAlias: 'terminate',
      paramSchema: terminateParamSchema,
      sample: { uri: 'com.apple.Preferences' },
      call: async (param) => {
        await device.terminate(param.uri);
      },
    }),
    IOSHomeButton: defineAction({
      name: 'IOSHomeButton',
      description: 'Trigger the system home operation on iOS devices',
      call: async () => {
        await device.home();
      },
    }),
  } as const;
}
