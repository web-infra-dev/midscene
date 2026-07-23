import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import type ADB from 'appium-adb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';
import {
  isRetryableUiDumpError,
  isTransientAdbTransportError,
} from '../android-emulator-ui-dump';

vi.setConfig({
  testTimeout: 240 * 1000,
  hookTimeout: 60 * 1000,
});

const pageUrl =
  process.env.MIDSCENE_ANDROID_TODO_URL ??
  'https://todomvc.com/examples/react/dist/';
const diagnosticsDir = process.env.MIDSCENE_ANDROID_DIAGNOSTICS_DIR;
const CHROME_FIRST_RUN_DUMP_PATH =
  '/sdcard/midscene_chrome_first_run_window_dump.xml';
const CHROME_UI_DUMP_MAX_ATTEMPTS = 3;
const CHROME_FIRST_RUN_DISMISS_TIMEOUT_MS = 10_000;
const CHROME_FIRST_RUN_POLL_INTERVAL_MS = 500;
const expectedActiveTasks = [
  'Learn JS today',
  'Learn Rust tomorrow',
  'Learning AI the day after tomorrow',
] as const;
const completedTask = 'Learning AI the day after tomorrow';
const tasksAfterDelete = ['Learn JS today', completedTask] as const;
const visibleTodoListQuery =
  'string[], extract the exact text of every visible todo item label from the todo list, one string per row from top to bottom. Ignore the input box, any draft text inside it, the item counter, and the filter buttons.';

async function queryVisibleTodoListWithRetry(
  agent: AndroidAgent,
  expectedTasks: readonly string[],
  logLabel: string,
): Promise<string[]> {
  let tasks: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    tasks = await agent.aiQuery<string[]>(visibleTodoListQuery);
    console.log(`${logLabel} attempt ${attempt}`, tasks);
    if (
      tasks.length === expectedTasks.length &&
      expectedTasks.every((task) => tasks.includes(task))
    ) {
      return tasks;
    }
  }

  return tasks;
}

function screenshotBuffer(base64: string): Buffer {
  const match = /^data:image\/\w+;base64,(.+)$/s.exec(base64);
  if (!match) {
    throw new Error('Android TodoMVC screenshot is not a base64 data URL');
  }
  return Buffer.from(match[1], 'base64');
}

async function dumpUiautomatorXml(adb: ADB): Promise<string> {
  for (let attempt = 1; attempt <= CHROME_UI_DUMP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await adb.shell(`rm -f ${CHROME_FIRST_RUN_DUMP_PATH}`);
      await adb.shell(
        `uiautomator dump --compressed ${CHROME_FIRST_RUN_DUMP_PATH}`,
      );
      const xml = await adb.shell(`cat ${CHROME_FIRST_RUN_DUMP_PATH}`);
      if (typeof xml !== 'string' || xml.trim().length === 0) {
        throw new Error('Android emulator returned an empty Chrome UI dump');
      }
      return xml;
    } catch (error) {
      if (
        attempt === CHROME_UI_DUMP_MAX_ATTEMPTS ||
        !isRetryableUiDumpError(error)
      ) {
        throw error;
      }
      console.log(
        `Chrome UI dump was not ready; retrying attempt ${attempt + 1}`,
      );
      if (isTransientAdbTransportError(error)) {
        await adb.waitForDevice(15);
      } else {
        await sleep(CHROME_FIRST_RUN_POLL_INTERVAL_MS);
      }
    }
  }

  throw new Error('Chrome UI dump retry loop completed without a result');
}

function centerForExactText(
  xml: string,
  text: string,
): { x: number; y: number } | undefined {
  const textAttribute = `text="${text}"`;
  const contentDescriptionAttribute = `content-desc="${text}"`;
  const nodeTag = (xml.match(/<node\b[^>]*>/g) ?? []).find(
    (tag) =>
      tag.includes(textAttribute) || tag.includes(contentDescriptionAttribute),
  );
  if (!nodeTag) {
    return undefined;
  }
  const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(nodeTag);
  if (!bounds) {
    throw new Error(`Chrome first-run control has no bounds: ${text}`);
  }
  return {
    x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

async function dismissChromeFirstRunIfPresent(adb: ADB): Promise<{
  beforeXml: string;
  afterXml?: string;
  detected: boolean;
  dismissed: boolean;
  tapAttempts: number;
}> {
  const beforeXml = await dumpUiautomatorXml(adb);
  let useWithoutAccount = centerForExactText(
    beforeXml,
    'Use without an account',
  );
  if (!useWithoutAccount) {
    return {
      beforeXml,
      detected: false,
      dismissed: false,
      tapAttempts: 0,
    };
  }

  let afterXml = beforeXml;
  for (let tapAttempts = 1; tapAttempts <= 2; tapAttempts += 1) {
    await adb.shell(
      `input swipe ${useWithoutAccount.x} ${useWithoutAccount.y} ${useWithoutAccount.x} ${useWithoutAccount.y} 150`,
    );
    const deadline = Date.now() + CHROME_FIRST_RUN_DISMISS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(CHROME_FIRST_RUN_POLL_INTERVAL_MS);
      afterXml = await dumpUiautomatorXml(adb);
      useWithoutAccount = centerForExactText(
        afterXml,
        'Use without an account',
      );
      if (!useWithoutAccount) {
        return {
          beforeXml,
          afterXml,
          detected: true,
          dismissed: true,
          tapAttempts,
        };
      }
    }
  }

  return {
    beforeXml,
    afterXml,
    detected: true,
    dismissed: false,
    tapAttempts: 2,
  };
}

describe('Test todo list', () => {
  let agent: AndroidAgent | undefined;

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    expect(devices).toHaveLength(1);
    const page = new AndroidDevice(devices[0].udid, {
      scrcpyConfig: {
        enabled: true,
      },
    });
    agent = new AndroidAgent(page, {
      reportFileName: 'todo-mvc-android',
      autoPrintReportMsg: false,
      aiActionContext:
        'If any browser, permission, or user agreement popup appears, close or accept it. Operate only the visible TodoMVC page.',
    });
    const adb = await page.connect();
    await page.launch(pageUrl);
    await sleep(3000);
    const chromeFirstRun = await dismissChromeFirstRunIfPresent(adb);
    if (diagnosticsDir) {
      const resolvedDiagnosticsDir = path.resolve(diagnosticsDir);
      await mkdir(resolvedDiagnosticsDir, { recursive: true });
      await writeFile(
        path.join(resolvedDiagnosticsDir, 'chrome-first-run-before.xml'),
        chromeFirstRun.beforeXml,
        'utf8',
      );
      if (chromeFirstRun.afterXml) {
        await writeFile(
          path.join(resolvedDiagnosticsDir, 'chrome-first-run-after.xml'),
          chromeFirstRun.afterXml,
          'utf8',
        );
      }
      await writeFile(
        path.join(resolvedDiagnosticsDir, 'chrome-first-run-metadata.json'),
        `${JSON.stringify(
          {
            detected: chromeFirstRun.detected,
            dismissed: chromeFirstRun.dismissed,
            tapAttempts: chromeFirstRun.tapAttempts,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    }
    if (chromeFirstRun.detected && !chromeFirstRun.dismissed) {
      throw new Error(
        'Chrome first-run screen remained after deterministic setup',
      );
    }
    if (chromeFirstRun.dismissed) {
      await page.launch(pageUrl);
      await sleep(3000);
    }
  });

  afterAll(async () => {
    if (!agent) {
      return;
    }

    let diagnosticsError: unknown;
    if (diagnosticsDir) {
      try {
        const resolvedDiagnosticsDir = path.resolve(diagnosticsDir);
        await mkdir(resolvedDiagnosticsDir, { recursive: true });
        await Promise.all([
          agent.interface
            .screenshotBase64()
            .then((base64) =>
              writeFile(
                path.join(resolvedDiagnosticsDir, 'todo-final.png'),
                screenshotBuffer(base64),
              ),
            ),
          writeFile(
            path.join(resolvedDiagnosticsDir, 'todo-agent-dump.json'),
            `${agent.dumpDataString()}\n`,
            'utf8',
          ),
        ]);
      } catch (error) {
        diagnosticsError = error;
      }
    }

    let destroyError: unknown;
    try {
      await agent.destroy();
    } catch (error) {
      destroyError = error;
    }

    if (diagnosticsDir) {
      const resolvedDiagnosticsDir = path.resolve(diagnosticsDir);
      await writeFile(
        path.join(resolvedDiagnosticsDir, 'todo-report-metadata.json'),
        `${JSON.stringify(
          {
            platform: process.platform,
            reportFile: agent.reportFile,
            diagnosticsError:
              diagnosticsError instanceof Error
                ? diagnosticsError.message
                : diagnosticsError,
            destroyError:
              destroyError instanceof Error
                ? destroyError.message
                : destroyError,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    }

    if (destroyError) {
      throw destroyError;
    }
  });

  it(
    'ai todo',
    async () => {
      if (!agent) {
        throw new Error('AndroidAgent was not initialized');
      }

      await agent.aiAct(
        'Prepare the TodoMVC page for a clean test. Close any browser startup popup if present. If todo items already exist, delete every item with its × button. Stop when the task input is visible and the todo list is empty.',
      );
      await agent.aiAssert(
        'The TodoMVC task input is visible and there are no existing task items',
      );
      await agent.aiAct(
        'Type "Learn JS today" in the task input, then press Enter to create the task',
      );
      await agent.aiAct(
        'Type "Learn Rust tomorrow" in the task input, then press Enter to create the task',
      );
      await agent.aiAct(
        'Type "Learning AI the day after tomorrow" in the task input, then press Enter to create the task',
      );

      const allTasks = await queryVisibleTodoListWithRetry(
        agent,
        expectedActiveTasks,
        'allTaskList',
      );
      expect(allTasks).toEqual(
        expect.arrayContaining([...expectedActiveTasks]),
      );
      expect(allTasks).toHaveLength(expectedActiveTasks.length);

      await agent.aiTap(
        'the text label "Learn Rust tomorrow" in the task row, away from its checkbox',
      );
      await agent.aiTap(
        'the delete button (×) at the right edge of the "Learn Rust tomorrow" task row',
      );
      const remainingTasks = await queryVisibleTodoListWithRetry(
        agent,
        tasksAfterDelete,
        'remainingTaskList',
      );
      expect(remainingTasks).toEqual(
        expect.arrayContaining([...tasksAfterDelete]),
      );
      expect(remainingTasks).toHaveLength(tasksAfterDelete.length);

      await agent.aiTap(
        'the checkbox immediately to the left of "Learning AI the day after tomorrow"',
      );
      await agent.aiTap('the "Completed" status filter below the todo list');

      const completedTasks = await queryVisibleTodoListWithRetry(
        agent,
        [completedTask],
        'completedTaskList',
      );
      expect(completedTasks).toEqual([completedTask]);

      const placeholder = await agent.aiQuery<string>(
        'string, return the placeholder text in the input box',
      );
      expect(placeholder).toBe('What needs to be done?');
    },
    1200 * 1000,
  );
});
