import {
  IOSAgent,
  IOSDevice,
  type IOSAgentOpt,
} from '@midscene/ios';
import type { IOSDeviceOpt } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { ReportHelper, buildReportMeta } from '../report-helper';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext } from './base';

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
   * Connect to an iOS device via WebDriverAgent. Called once in `beforeAll`.
   */
  static async connectDevice(options?: IOSTestOptions): Promise<void> {
    IOSTest.sharedOptions = options ?? {};

    const device = new IOSDevice(options?.deviceOptions ?? {});
    await device.connect();

    IOSTest.sharedDevice = device;
    IOSTest.reportHelper.reset();
  }

  /**
   * Launch a URL or app and return a test context.
   *
   * @param uri - A URL (https://...), bundle ID, or app name to launch
   */
  static async create(
    targetUri: string,
    testCtx: VitestTestContext,
  ): Promise<IOSTest> {
    if (!IOSTest.sharedDevice) {
      throw new Error(
        'IOSTest.connectDevice() must be called before create(). Call it in beforeAll.',
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
   * Register lifecycle hooks and return a context object whose `agent`
   * property points to the current test's agent instance.
   *
   * Usage:
   * ```ts
   * describe('iOS TodoMVC', () => {
   *   const ctx = IOSTest.setup('https://todomvc.com/examples/react/dist/');
   *
   *   it('should add a todo', async () => {
   *     await ctx.agent.aiAct('...');
   *   });
   * });
   * ```
   */
  static setup(targetUri: string, options?: IOSTestOptions) {
    let currentCtx: IOSTest | undefined;

    beforeAll(() => IOSTest.connectDevice(options));
    beforeEach(async (testCtx) => {
      currentCtx = await IOSTest.create(targetUri, testCtx);
    });
    afterEach((testCtx) => {
      const ctx = currentCtx;
      currentCtx = undefined;
      return IOSTest.collectReport(ctx, testCtx);
    });
    afterAll((suite) => IOSTest.mergeAndTeardown(suite));

    return {
      get agent() { return currentCtx!.agent; },
    } as { agent: IOSAgent };
  }
}
