
import { sleep } from '@midscene/core/utils';
import type { TestStatus } from '@midscene/core/agent';
import { getMidsceneRunSubDir } from '@midscene/shared/common'
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
import { beforeAll, describe, it } from 'vitest';

const caseName = 'settings1';

describe(`${caseName}`, () => {
    let agent: AndroidAgent;
    let startTime: number;
    let testStatus: TestStatus = 'passed'
    beforeAll(async () => {
        startTime = performance.now()
        const devices = await getConnectedDevices();
        const page = new AndroidDevice(devices[0].udid);
        agent = new AndroidAgent(page, {
            groupName: `${caseName}`,
            generateReport: false
        });
        const adb = await page.getAdb();
        await adb.shell('input keyevent KEYCODE_HOME');
        await sleep(1000);
        await adb.shell('am start -n com.android.settings/.Settings');
        await sleep(1000);
    });

    it(
        'switch wlan',
        async (ctx) => {
            ctx.onTestFinished((result) => {
                // update status
                console.log(result.task.result);
                if (result.task.result?.state === 'pass') {
                    testStatus = "passed";
                } else if (result.task.result?.state === 'skip') {
                    testStatus = "skipped";
                } else if (result.task.result?.errors?.[0].message.includes("timed out")) {
                    testStatus = "timedOut";
                } else {
                    testStatus = 'failed';
                }
                agent.teardownTestAgent({
                    testId: `${caseName}`,//ID is a unique identifier used by the front end to distinguish each use case!
                    testTitle: `${caseName}`,
                    testDescription: 'desc',
                    testDuration: (performance.now() - startTime) | 0,
                    testStatus,
                    cacheFilePath: getMidsceneRunSubDir('cache') + "/cache_data" // setup-test.ts creates an empty cache file before all tests
                });
            });

            await agent.aiAction('find and enter WLAN setting');
            await agent.aiAction('toggle WLAN status, if WLAN is off pls turn it on, otherwise turn it off.');
        }
    );

});
