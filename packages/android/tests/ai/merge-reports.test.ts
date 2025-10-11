import { ReportMergingTool } from '@midscene/core/report'
import { type TestStatus } from '@midscene/core';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import ADB from 'appium-adb';
import { sleep } from '@midscene/core/utils';


describe(`Test Setting`, () => {
    let page: AndroidDevice;
    let adb: ADB;
    let agent: AndroidAgent;
    let startTime: number;
    let itTestStatus: TestStatus = 'passed'
    const reportMergingTool = new ReportMergingTool();

    beforeAll(async () => {
        const devices = await getConnectedDevices();
        page = new AndroidDevice(devices[0].udid);
        adb = await page.getAdb();
    });

    beforeEach((ctx) => {
        startTime = performance.now()
        agent = new AndroidAgent(page, {
            groupName: ctx.task.name,
        });
    });

    afterEach((ctx) => {
        if (ctx.task.result?.state === 'pass') {
            itTestStatus = "passed";
        } else if (ctx.task.result?.state === 'skip') {
            itTestStatus = "skipped";
        } else if (ctx.task.result?.errors?.[0].message.includes("timed out")) {
            itTestStatus = "timedOut";
        } else {
            itTestStatus = 'failed';
        }
        reportMergingTool.append({
            reportFilePath: agent.reportFile as string,
            reportAttributes: {
                testId: `${ctx.task.name}`, //ID is a unique identifier used by the front end to distinguish each use case!
                testTitle: `${ctx.task.name}`,
                testDescription: 'description',
                testDuration: (Date.now() - ctx.task.result?.startTime!) | 0,
                testStatus: itTestStatus
            }
        });
    });

    afterAll(() => {
        reportMergingTool.mergeReports('my-android-setting-test-report');
    });

    it(
        'toggle wlan',
        async () => {
            await adb.shell('input keyevent KEYCODE_HOME');
            await sleep(1000);
            await adb.shell('am start -n com.android.settings/.Settings');
            await sleep(1000);
            await agent.aiAction('find and enter WLAN setting');
            await agent.aiAction('toggle WLAN status *once*, if WLAN is off pls turn it on, otherwise turn it off.');
        }
    );

    it(
        'toggle bluetooth',
        async (ctx) => {
            const adb = await page.getAdb();
            await adb.shell('input keyevent KEYCODE_HOME');
            await sleep(1000);
            await adb.shell('am start -n com.android.settings/.Settings');
            await sleep(1000);
            await agent.aiAction('find and enter bluetooth setting');
            await agent.aiAction('toggle bluetooth status *once*, if bluetooth is off pls turn it on, otherwise turn it off.');
        }
    );
});
