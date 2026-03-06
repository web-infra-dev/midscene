import {
  AndroidAgent,
  AndroidDevice,
  type AndroidAgentOpt,
  getConnectedDevices,
} from '@midscene/android';
import type { AndroidDeviceOpt } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { ReportHelper, buildReportMeta } from '../report-helper';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext } from './base';

export interface AndroidTestContextOptions {
  /** ADB device serial. If omitted, the first connected device is used. */
  deviceId?: string;
  /** Options passed to AndroidDevice (e.g. scrcpy config). */
  deviceOptions?: AndroidDeviceOpt;
  /** Options passed to AndroidAgent (e.g. aiActionContext, appNameMapping). */
  agentOptions?: Omit<AndroidAgentOpt, 'groupName' | 'reportFileName'>;
  /** Delay (ms) after launching a URI to let the app settle. Default: 3000. */
  launchDelay?: number;
}

export class AndroidTestContext extends BaseTestContext<AndroidAgent> {
  private static sharedDevice: AndroidDevice | null = null;
  private static sharedOptions: AndroidTestContextOptions = {};
  private static reportHelper = new ReportHelper();

  /**
   * Connect to an Android device. Call once in `beforeAll`.
   *
   * Each `create()` call launches a URL/app on the shared device
   * and creates a fresh agent for independent reporting.
   */
  static async setup(options?: AndroidTestContextOptions): Promise<void> {
    AndroidTestContext.sharedOptions = options ?? {};

    const deviceId =
      options?.deviceId ?? (await getConnectedDevices()).at(0)?.udid;

    if (!deviceId) {
      throw new Error(
        'No Android devices found. Connect a device and ensure ADB is configured. Run `adb devices` to verify.',
      );
    }

    const device = new AndroidDevice(deviceId, options?.deviceOptions ?? {});
    await device.connect();

    AndroidTestContext.sharedDevice = device;
    AndroidTestContext.reportHelper.reset();
  }

  /**
   * Launch a URL or app and return a test context. Call in each `it` block.
   *
   * @param uri - A URL (https://...) or app package name / app name to launch
   */
  static async create(
    targetUri: string,
    testCtx: {
      task: { name: string; suite?: { name: string } };
    },
  ): Promise<AndroidTestContext> {
    if (!AndroidTestContext.sharedDevice) {
      throw new Error(
        'AndroidTestContext.setup() must be called before create(). Call it in beforeAll.',
      );
    }

    await AndroidTestContext.sharedDevice.launch(targetUri);
    const delay = AndroidTestContext.sharedOptions.launchDelay ?? 3000;
    if (delay > 0) {
      await sleep(delay);
    }

    const { groupName, reportFileName } = buildReportMeta(testCtx);
    const agent = new AndroidAgent(AndroidTestContext.sharedDevice, {
      ...AndroidTestContext.sharedOptions.agentOptions,
      groupName,
      reportFileName,
    });

    return new AndroidTestContext(agent);
  }

  static async collectReport(
    ctx: AndroidTestContext | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return BaseTestContext._collectReport(
      AndroidTestContext.reportHelper,
      ctx,
      testCtx,
    );
  }

  static async mergeAndTeardown(
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    return BaseTestContext._mergeAndTeardown(
      AndroidTestContext.reportHelper,
      AndroidTestContext.teardown,
      suite,
      reportName,
    );
  }

  static async teardown(): Promise<void> {
    await AndroidTestContext.sharedDevice?.destroy();
    AndroidTestContext.sharedDevice = null;
  }
}
