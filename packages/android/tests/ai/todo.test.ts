import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

const pageUrl = 'https://todomvc.com/examples/react/dist/';
const diagnosticsDir = process.env.MIDSCENE_ANDROID_DIAGNOSTICS_DIR;
const expectedActiveTasks = [
  'Learn JS today',
  'Learn Rust tomorrow',
  'Learning AI the day after tomorrow',
] as const;
const completedTask = 'Learning AI the day after tomorrow';
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
    await page.connect();
    await page.launch(pageUrl);
    await sleep(3000);
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

      await agent.aiAct(
        'Tap the "Learn Rust tomorrow" task row once to reveal its delete control. Do not tap its checkbox.',
      );
      await agent.aiAct(
        'Tap the delete button (×) to the right of "Learn Rust tomorrow"',
      );
      await agent.aiAct(
        'Tap the checkbox next to "Learning AI the day after tomorrow"',
      );
      await agent.aiAct(
        'Tap the "Completed" status filter below the task list',
      );

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
    720 * 1000,
  );
});
