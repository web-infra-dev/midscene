import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { openBrowserAndNavigate } from './test-utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const isCacheEnabled = process.env.MIDSCENE_CACHE;
const diagnosticsDir = process.env.MIDSCENE_TODO_DIAGNOSTICS_DIR;
const expectedActiveTasks = [
  'Learn JS today',
  'Learn Rust tomorrow',
  'Learning AI the day after tomorrow',
] as const;
const completedTask = 'Learning AI the day after tomorrow';
const visibleTodoListQuery =
  'string[], extract the exact text of every visible todo item label from the todo list, one string per row from top to bottom. Ignore the input box, any draft text inside it, the item counter, and the filter buttons.';

async function queryVisibleTodoListWithRetry(
  agent: ComputerAgent,
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
    throw new Error('TodoMVC diagnostic screenshot is not a base64 data URL');
  }
  return Buffer.from(match[1], 'base64');
}

describe('computer todo app automation', () => {
  let agent: ComputerAgent | undefined;

  beforeAll(async () => {
    agent = await agentFromComputer({
      reportFileName: `todo-mvc-${process.platform}`,
      autoPrintReportMsg: false,
      aiActionContext:
        'If any popup appears, close it. Operate only the visible TodoMVC page.',
    });
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
    'should automate todo list operations',
    async () => {
      if (isCacheEnabled) {
        vi.setConfig({ testTimeout: 1000 * 1000 });
      }

      if (!agent) {
        throw new Error('ComputerAgent was not initialized');
      }

      await openBrowserAndNavigate(
        agent,
        'https://todomvc.com/examples/react/dist/',
      );

      await agent.aiAct(
        'Prepare the TodoMVC page for a clean test. Close any browser startup popup if present. If todo items already exist, delete every item with its × button. Stop when the task input is visible and the todo list is empty.',
      );
      await agent.aiAssert(
        'The TodoMVC task input is visible and there are no existing task items',
      );

      await agent.aiAct(
        'Click the task input box, type "Learn JS today", then press Enter to create the task',
      );
      await agent.aiAct(
        'Click the task input box, type "Learn Rust tomorrow", then press Enter to create the task',
      );
      await agent.aiAct(
        'Click the task input box, type "Learning AI the day after tomorrow", then press Enter to create the task',
      );

      const allTaskList = await queryVisibleTodoListWithRetry(
        agent,
        expectedActiveTasks,
        'allTaskList',
      );
      expect(allTaskList).toEqual(
        expect.arrayContaining([...expectedActiveTasks]),
      );
      expect(allTaskList).toHaveLength(expectedActiveTasks.length);

      await agent.aiAct(
        'Move the mouse over "Learn Rust tomorrow" in the task list to reveal the delete button',
      );
      await agent.aiAct(
        'Click the delete button (×) to the right of "Learn Rust tomorrow"',
      );
      await agent.aiAct(
        'Click the checkbox next to "Learning AI the day after tomorrow"',
      );
      await agent.aiAct(
        'Click the "Completed" filter button below the task list',
      );

      const taskList = await queryVisibleTodoListWithRetry(
        agent,
        [completedTask],
        'completedTaskList',
      );
      expect(taskList).toEqual([completedTask]);

      const placeholder = await agent.aiQuery<string>(
        'string, return the placeholder text in the input box',
      );
      expect(placeholder).toBe('What needs to be done?');
    },
    600 * 1000,
  );
});
