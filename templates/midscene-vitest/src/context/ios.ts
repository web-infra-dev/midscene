import {
  IOSAgent,
  IOSDevice,
  type IOSAgentOpt,
} from '@midscene/ios';
import type { IOSDeviceOpt } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { ReportHelper, buildReportMeta } from '../report-helper';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext } from './base';

export interface IOSTestContextOptions {
  /** Options passed to IOSDevice (e.g. WDA port, device UDID). */
  deviceOptions?: IOSDeviceOpt;
  /** Options passed to IOSAgent (e.g. aiActionContext, appNameMapping). */
  agentOptions?: Omit<IOSAgentOpt, 'groupName' | 'reportFileName'>;
  /** Delay (ms) after launching a URI to let the app settle. Default: 3000. */
  launchDelay?: number;
}

export class IOSTestContext extends BaseTestContext<IOSAgent> {
  private static sharedDevice: IOSDevice | null = null;
  private static sharedOptions: IOSTestContextOptions = {};
  private static reportHelper = new ReportHelper();

  /**
   * Connect to an iOS device via WebDriverAgent. Call once in `beforeAll`.
   *
   * Requires a running WDA instance on the target device/simulator.
   * Each `create()` call launches a URL/app and creates a fresh agent.
   */
  static async setup(options?: IOSTestContextOptions): Promise<void> {
    IOSTestContext.sharedOptions = options ?? {};

    const device = new IOSDevice(options?.deviceOptions ?? {});
    await device.connect();

    IOSTestContext.sharedDevice = device;
    IOSTestContext.reportHelper.reset();
  }

  /**
   * Launch a URL or app and return a test context. Call in each `it` block.
   *
   * @param uri - A URL (https://...), bundle ID, or app name to launch
   */
  static async create(
    targetUri: string,
    testCtx: {
      task: { name: string; suite?: { name: string } };
    },
  ): Promise<IOSTestContext> {
    if (!IOSTestContext.sharedDevice) {
      throw new Error(
        'IOSTestContext.setup() must be called before create(). Call it in beforeAll.',
      );
    }

    await IOSTestContext.sharedDevice.launch(targetUri);
    const delay = IOSTestContext.sharedOptions.launchDelay ?? 3000;
    if (delay > 0) {
      await sleep(delay);
    }

    const { groupName, reportFileName } = buildReportMeta(testCtx);
    const agent = new IOSAgent(IOSTestContext.sharedDevice, {
      ...IOSTestContext.sharedOptions.agentOptions,
      groupName,
      reportFileName,
    });

    return new IOSTestContext(agent);
  }

  static async collectReport(
    ctx: IOSTestContext | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return BaseTestContext._collectReport(
      IOSTestContext.reportHelper,
      ctx,
      testCtx,
    );
  }

  static async mergeAndTeardown(
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    return BaseTestContext._mergeAndTeardown(
      IOSTestContext.reportHelper,
      IOSTestContext.teardown,
      suite,
      reportName,
    );
  }

  static async teardown(): Promise<void> {
    await IOSTestContext.sharedDevice?.destroy();
    IOSTestContext.sharedDevice = null;
  }
}
