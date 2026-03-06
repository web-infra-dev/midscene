import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';
import { sleep } from '@midscene/core/utils';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  vi,
} from 'vitest';
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

describe('Test Setting', () => {
  let page: HarmonyDevice;
  let agent: HarmonyAgent;
  let startTime: number;
  let itTestStatus: TestStatus = 'passed';
  const reportMergingTool = new ReportMergingTool();

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    page = new HarmonyDevice(devices[0].deviceId);
    await page.connect();
  });

  beforeEach((ctx) => {
    startTime = performance.now();
    agent = new HarmonyAgent(page, {
      groupName: ctx.task.name,
      aiActionContext:
        'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
    });
  });

  afterEach((ctx) => {
    if (ctx.task.result?.state === 'pass') {
      itTestStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      itTestStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0].message.includes('timed out')) {
      itTestStatus = 'timedOut';
    } else {
      itTestStatus = 'failed';
    }
    reportMergingTool.append({
      reportFilePath: agent.reportFile as string,
      reportAttributes: {
        testId: `${ctx.task.name}`,
        testTitle: `${ctx.task.name}`,
        testDescription: 'description',
        testDuration: (Date.now() - ctx.task.result?.startTime!) | 0,
        testStatus: itTestStatus,
      },
    });
  });

  afterAll(() => {
    reportMergingTool.mergeReports('my-harmony-setting-test-report');
  });

  it('toggle wlan', async () => {
    await agent.launch('com.huawei.hmos.settings');
    await sleep(1000);
    await agent.aiAct('find and enter WLAN setting');
    await agent.aiAct(
      'toggle WLAN status *once*, if WLAN is off pls turn it on, otherwise turn it off.',
    );
  });

  it('toggle bluetooth', async () => {
    await agent.launch('com.huawei.hmos.settings');
    await sleep(1000);
    await agent.aiAct('find and enter bluetooth setting');
    await agent.aiAct(
      'toggle bluetooth status *once*, if bluetooth is off pls turn it on, otherwise turn it off.',
    );
  });
});
