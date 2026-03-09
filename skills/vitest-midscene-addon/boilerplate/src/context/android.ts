import {
  AndroidAgent,
  AndroidDevice,
  type AndroidAgentOpt,
  getConnectedDevices,
} from '@midscene/android';
import type { AndroidDeviceOpt } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { ReportHelper, buildReportMeta } from '../report-helper';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext, type TestFixture } from './base';

export interface AndroidTestOptions {
  /** ADB device serial. If omitted, the first connected device is used. */
  deviceId?: string;
  /** Options passed to AndroidDevice (e.g. scrcpy config). */
  deviceOptions?: AndroidDeviceOpt;
  /** Options passed to AndroidAgent (e.g. aiActionContext, appNameMapping). */
  agentOptions?: Omit<AndroidAgentOpt, 'groupName' | 'reportFileName'>;
  /** Delay (ms) after launching a URI to let the app settle. Default: 3000. */
  launchDelay?: number;
}

export class AndroidTest extends BaseTestContext<AndroidAgent> {
  private static sharedDevice: AndroidDevice | null = null;
  private static sharedOptions: AndroidTestOptions = {};
  private static reportHelper = new ReportHelper();

  /**
   * Connect to an Android device. Call once in `beforeAll`.
   *
   * Each `create()` call launches a URL/app on the shared device
   * and creates a fresh agent for independent reporting.
   */
  static async setup(options?: AndroidTestOptions): Promise<void> {
    AndroidTest.sharedOptions = options ?? {};

    const deviceId =
      options?.deviceId ?? (await getConnectedDevices()).at(0)?.udid;

    if (!deviceId) {
      throw new Error(
        'No Android devices found. Connect a device and ensure ADB is configured. Run `adb devices` to verify.',
      );
    }

    const device = new AndroidDevice(deviceId, options?.deviceOptions ?? {});
    await device.connect();

    AndroidTest.sharedDevice = device;
    AndroidTest.reportHelper.reset();
  }

  /**
   * Launch a URL or app and return a test context. Call in each `it` block.
   *
   * @param uri - A URL (https://...) or app package name / app name to launch
   */
  static async create(
    targetUri: string,
    testCtx: VitestTestContext,
  ): Promise<AndroidTest> {
    if (!AndroidTest.sharedDevice) {
      throw new Error(
        'AndroidTest.setup() must be called before create(). Call it in beforeAll.',
      );
    }

    await AndroidTest.sharedDevice.launch(targetUri);
    const delay = AndroidTest.sharedOptions.launchDelay ?? 3000;
    if (delay > 0) {
      await sleep(delay);
    }

    const { groupName, reportFileName } = buildReportMeta(testCtx);
    const agent = new AndroidAgent(AndroidTest.sharedDevice, {
      ...AndroidTest.sharedOptions.agentOptions,
      groupName,
      reportFileName,
    });

    return new AndroidTest(agent);
  }

  static async collectReport(
    ctx: AndroidTest | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return BaseTestContext._collectReport(
      AndroidTest.reportHelper,
      ctx,
      testCtx,
    );
  }

  static async mergeAndTeardown(
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    return BaseTestContext._mergeAndTeardown(
      AndroidTest.reportHelper,
      AndroidTest.teardown,
      suite,
      reportName,
    );
  }

  static async teardown(): Promise<void> {
    await AndroidTest.sharedDevice?.destroy();
    AndroidTest.sharedDevice = null;
  }

  /**
   * Register all lifecycle hooks and return an object with a `create` method
   * for per-test contexts.
   *
   * Usage:
   * ```ts
   * const fixture = AndroidTest.init({ agentOptions: { ... } });
   * it('test', async (testCtx) => {
   *   const ctx = await fixture.create('https://example.com', testCtx);
   * });
   * ```
   */
  static init(options?: AndroidTestOptions): TestFixture<AndroidTest> {
    let currentCtx: AndroidTest | undefined;

    beforeAll(() => AndroidTest.setup(options));
    afterEach((testCtx) =>
      AndroidTest.collectReport(currentCtx, testCtx),
    );
    afterAll((suite) => AndroidTest.mergeAndTeardown(suite));

    return {
      create: async (targetUri: string, testCtx: VitestTestContext) => {
        currentCtx = await AndroidTest.create(targetUri, testCtx);
        return currentCtx;
      },
    };
  }
}
