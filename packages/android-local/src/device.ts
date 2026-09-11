import {
  type DeviceAction,
  type InterfaceType,
  type Size,
  type UITreeSnapshot,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type AndroidDeviceInputOpt,
  type MobileInputPrimitives,
  createDefaultMobileActions,
  defineAction,
} from '@midscene/core/device';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import {
  mergeAndNormalizeAppNameMapping,
  normalizeForComparison,
} from '@midscene/shared/utils';

import { createTransportInputPrimitives } from './input-primitives';
import { AndroidTransportError } from './transport/errors';
import type {
  AndroidCapabilities,
  AndroidTransport,
  DisplayInfo,
} from './transport/types';

const debugDevice = getDebug('android-local:device');

export interface LocalAndroidDeviceOpt extends AndroidDeviceInputOpt {
  /** Display used by every operation; defaults to the device's default display. */
  displayId?: number;
  /** Extra actions appended to the action space. */
  customActions?: DeviceAction<any>[];
  /** Label used in reports and diagnostics. */
  description?: string;
  /**
   * Friendly app name → package name mapping (keys are normalized, so
   * `WeChat`, `wechat` and `We Chat` all resolve). The upstream Android path
   * ships a large default table; callers that want it pass it in — moving that
   * table into this package is the P1-7 convergence task.
   */
  appNameMapping?: Record<string, string>;
}

const launchParamSchema = z.object({
  uri: z
    .string()
    .describe(
      'App name, package name, or URL to launch. Prioritize using the exact package name or URL the user has provided. If none provided, use the accurate app name.',
    ),
});

const terminateParamSchema = z.object({
  uri: z
    .string()
    .describe(
      'Package name or app name to terminate. Use the exact package name, e.g. com.android.settings.',
    ),
});

type LaunchParam = z.infer<typeof launchParamSchema>;
type TerminateParam = z.infer<typeof terminateParamSchema>;

/**
 * Device-local Android interface.
 *
 * It only talks to an {@link AndroidTransport}; it never builds shell
 * commands, and it never knows whether the bytes came from rish, a Shizuku
 * UserService or an OEM system service.
 *
 * Prefer {@link LocalAndroidDevice.create}, which probes capabilities up front.
 */
export class LocalAndroidDevice implements AbstractInterface {
  interfaceType: InterfaceType = 'android';

  private readonly transport: AndroidTransport;
  private readonly options: LocalAndroidDeviceOpt;
  private capabilities?: AndroidCapabilities;
  private inputPrimitivesCache?: MobileInputPrimitives;
  private appNameMapping: Record<string, string>;
  private destroyed = false;

  constructor(
    transport: AndroidTransport,
    options: LocalAndroidDeviceOpt = {},
  ) {
    this.transport = transport;
    this.options = options;
    this.appNameMapping = mergeAndNormalizeAppNameMapping(
      {},
      options.appNameMapping,
    );
  }

  /** Replace the friendly app name mapping used by Launch/Terminate. */
  setAppNameMapping(mapping: Record<string, string>): void {
    this.appNameMapping = mergeAndNormalizeAppNameMapping({}, mapping);
  }

  private resolvePackageName(appName: string): string | undefined {
    return this.appNameMapping[normalizeForComparison(appName)];
  }

  /**
   * Launch an app by package name, `pkg/activity`, a URL, or a friendly app
   * name (when a mapping is configured). Mirrors the ADB path's `Launch` action.
   */
  async launch(uri: string): Promise<LocalAndroidDevice> {
    if (uri.includes('://')) {
      await this.transport.startActivity({ uri });
      return this;
    }

    if (uri.includes('/')) {
      const [packageName, activity] = uri.split('/');
      await this.transport.startActivity({
        packageName: packageName as string,
        activity,
      });
      return this;
    }

    const resolved = this.resolvePackageName(uri) ?? uri;
    await this.transport.startActivity({ packageName: resolved });
    return this;
  }

  /** Force-stop an app by package name or friendly app name. */
  async terminate(uri: string): Promise<void> {
    const packagePart = uri.includes('/') ? (uri.split('/')[0] as string) : uri;
    const resolved = this.resolvePackageName(packagePart) ?? packagePart;
    await this.transport.forceStop(resolved);
  }

  /** Connect path that probes capabilities before the device is used. */
  static async create(
    transport: AndroidTransport,
    options: LocalAndroidDeviceOpt = {},
  ): Promise<LocalAndroidDevice> {
    const device = new LocalAndroidDevice(transport, options);
    await device.connect();
    return device;
  }

  async connect(): Promise<AndroidCapabilities> {
    this.capabilities = await this.transport.getCapabilities();
    return this.capabilities;
  }

  getCapabilities(): AndroidCapabilities | undefined {
    return this.capabilities;
  }

  describe(): string {
    const display = this.options.displayId;
    return `AndroidLocalDevice(backend=${this.transport.backend}${
      this.capabilities?.uid !== undefined && this.capabilities?.uid !== null
        ? `, uid=${this.capabilities.uid}`
        : ''
    }${display !== undefined ? `, displayId=${display}` : ''})`;
  }

  // ---------------------------------------------------------------------------
  // screen
  // ---------------------------------------------------------------------------

  async screenshotBase64(): Promise<string> {
    const buffer = await this.transport.screenshot({
      displayId: this.options.displayId,
    });

    return createImgBase64ByFormat('png', buffer.toString('base64'));
  }

  async getDisplayInfo(): Promise<DisplayInfo> {
    return await this.transport.getDisplayInfo({
      displayId: this.options.displayId,
    });
  }

  async listDisplays(): Promise<DisplayInfo[]> {
    return await this.transport.listDisplays();
  }

  async size(): Promise<Size> {
    const display = await this.getDisplayInfo();
    return { width: display.width, height: display.height };
  }

  get inputPrimitives(): MobileInputPrimitives {
    if (!this.inputPrimitivesCache) {
      this.inputPrimitivesCache = createTransportInputPrimitives({
        transport: this.transport,
        getScreenSize: () => this.size(),
        displayId: this.options.displayId,
      });
    }

    return this.inputPrimitivesCache;
  }

  actionSpace(): DeviceAction<any>[] {
    const capabilities = this.capabilities;
    if (!capabilities) {
      throw new Error(
        'LocalAndroidDevice capabilities are unknown; call `await device.connect()` or use `LocalAndroidDevice.create()` before building the action space',
      );
    }

    if (!capabilities.input) {
      debugDevice(
        'transport reports no input capability; the input action space will be empty',
      );
      return [...(this.options.customActions ?? [])];
    }

    const mobileActionContext = {
      input: this.inputPrimitives,
      size: () => this.size(),
      sleep: async (timeMs: number) => {
        await new Promise((resolve) => setTimeout(resolve, timeMs));
      },
      getDefaultAutoDismissKeyboard: () => this.options?.autoDismissKeyboard,
      systemActions: {
        backButton: {
          name: 'AndroidBackButton',
          description: 'Trigger the system "back" operation on Android devices',
        },
        homeButton: {
          name: 'AndroidHomeButton',
          description: 'Trigger the system "home" operation on Android devices',
        },
        recentAppsButton: {
          name: 'AndroidRecentAppsButton',
          description:
            'Trigger the system "recent apps" operation on Android devices',
        },
      },
    };

    const appActions = capabilities.appManagement
      ? [
          defineAction<typeof launchParamSchema, LaunchParam, void>({
            name: 'Launch',
            description: 'Launch an Android app or URL',
            paramSchema: launchParamSchema,
            sample: { uri: 'com.android.settings' },
            call: async (param) => {
              if (!param?.uri) {
                throw new Error('Launch requires a non-empty uri parameter');
              }
              await this.launch(param.uri);
            },
          }),
          defineAction<typeof terminateParamSchema, TerminateParam, void>({
            name: 'Terminate',
            description:
              'Terminate (force-stop) an Android app by package name',
            paramSchema: terminateParamSchema,
            sample: { uri: 'com.android.settings' },
            call: async (param) => {
              if (!param?.uri) {
                throw new Error('Terminate requires a non-empty uri parameter');
              }
              await this.terminate(param.uri);
            },
          }),
        ]
      : [];

    return [
      ...createDefaultMobileActions(mobileActionContext),
      ...appActions,
      ...(this.options.customActions ?? []),
    ];
  }

  // ---------------------------------------------------------------------------
  // deprecated / unsupported surface
  // ---------------------------------------------------------------------------

  /**
   * Midscene's Android path is vision-first; UI-tree extraction needs
   * `uiautomator dump` plumbing that this transport does not provide yet.
   * Throwing keeps callers from silently planning against an empty tree.
   */
  async getUITree(): Promise<UITreeSnapshot> {
    throw new Error(
      'getUITree is not implemented for the local Android transport yet',
    );
  }

  async getDeviceLocalTimeString(format?: string): Promise<string> {
    if (!this.transport.runShell) {
      throw new Error(
        `The ${this.transport.backend} transport cannot read the device time`,
      );
    }

    const pattern = format ?? '%Y-%m-%dT%H:%M:%S';
    const result = await this.transport.runShell(`date +${pattern}`);

    if (result.exitCode !== 0) {
      throw new AndroidTransportError('Unable to read the device time', {
        code: 'CommandFailed',
        backend: this.transport.backend,
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    }

    return result.stdout.trim();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.capabilities = undefined;
    this.inputPrimitivesCache = undefined;
    await this.transport.close();
  }
}
