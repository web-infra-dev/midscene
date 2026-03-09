import {
  IOSAgent,
  IOSDevice,
  type IOSAgentOpt,
} from '@midscene/ios';
import type { IOSDeviceOpt } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { ReportHelper, buildReportMeta } from '../report-helper';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext, type TestFixture } from './base';

export interface IOSTestOptions {
  /** Options passed to IOSDevice (e.g. WDA port, device UDID). */
  deviceOptions?: IOSDeviceOpt;
  /** Options passed to IOSAgent (e.g. aiActionContext, appNameMapping). */
  agentOptions?: Omit<IOSAgentOpt, 'groupName' | 'reportFileName'>;
  /** Delay (ms) after launching a URI to let the app settle. Default: 3000. */
  launchDelay?: number;
}

export class IOSTest extends BaseTestContext<IOSAgent> {
  private static sharedDevice: IOSDevice | null = null;
  private static sharedOptions: IOSTestOptions = {};
  private static reportHelper = new ReportHelper();

  /**
   * Connect to an iOS device via WebDriverAgent. Call once in `beforeAll`.
   *
   * Requires a running WDA instance on the target device/simulator.
   * Each `create()` call launches a URL/app and creates a fresh agent.
   */
  static async setup(options?: IOSTestOptions): Promise<void> {
    IOSTest.sharedOptions = options ?? {};

    const device = new IOSDevice(options?.deviceOptions ?? {});
    await device.connect();

    IOSTest.sharedDevice = device;
    IOSTest.reportHelper.reset();
  }

  /**
   * Launch a URL or app and return a test context. Call in each `it` block.
   *
   * @param uri - A URL (https://...), bundle ID, or app name to launch
   */
  static async create(
    targetUri: string,
    testCtx: VitestTestContext,
  ): Promise<IOSTest> {
    if (!IOSTest.sharedDevice) {
      throw new Error(
        'IOSTest.setup() must be called before create(). Call it in beforeAll.',
      );
    }

    await IOSTest.sharedDevice.launch(targetUri);
    const delay = IOSTest.sharedOptions.launchDelay ?? 3000;
    if (delay > 0) {
      await sleep(delay);
    }

    const { groupName, reportFileName } = buildReportMeta(testCtx);
    const agent = new IOSAgent(IOSTest.sharedDevice, {
      ...IOSTest.sharedOptions.agentOptions,
      groupName,
      reportFileName,
    });

    return new IOSTest(agent);
  }

  static async collectReport(
    ctx: IOSTest | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return BaseTestContext._collectReport(
      IOSTest.reportHelper,
      ctx,
      testCtx,
    );
  }

  static async mergeAndTeardown(
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    return BaseTestContext._mergeAndTeardown(
      IOSTest.reportHelper,
      IOSTest.teardown,
      suite,
      reportName,
    );
  }

  static async teardown(): Promise<void> {
    await IOSTest.sharedDevice?.destroy();
    IOSTest.sharedDevice = null;
  }

  /**
   * Register all lifecycle hooks and return an object with a `create` method
   * for per-test contexts.
   *
   * Usage:
   * ```ts
   * const fixture = IOSTest.init({ agentOptions: { ... } });
   * it('test', async (testCtx) => {
   *   const ctx = await fixture.create('https://example.com', testCtx);
   * });
   * ```
   */
  static init(options?: IOSTestOptions): TestFixture<IOSTest> {
    let currentCtx: IOSTest | undefined;

    beforeAll(() => IOSTest.setup(options));
    afterEach((testCtx) =>
      IOSTest.collectReport(currentCtx, testCtx),
    );
    afterAll((suite) => IOSTest.mergeAndTeardown(suite));

    return {
      create: async (targetUri: string, testCtx: VitestTestContext) => {
        currentCtx = await IOSTest.create(targetUri, testCtx);
        return currentCtx;
      },
    };
  }
}
