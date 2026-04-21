import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;
const VISIBLE_TODO_LIST_QUERY =
  'string[], extract the exact text of every visible todo item label from the todo list, one string per row from top to bottom. Ignore the input box, any draft text inside it, the item counter, and the filter buttons.';

async function queryVisibleTodoListWithRetry(
  aiQuery: (prompt: string) => Promise<string[]>,
  expectedTasks: readonly string[],
  logLabel: string,
) {
  let tasks: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    tasks = await aiQuery(VISIBLE_TODO_LIST_QUERY);
    console.log(`${logLabel} attempt ${attempt}`, tasks);

    if (expectedTasks.every((task) => tasks.includes(task))) {
      return tasks;
    }
  }

  return tasks;
}

test.describe('ai todo describe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');
    // Clear localStorage to avoid stale todo items from previous test runs
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('ai todo', async ({ ai, aiQuery, page }) => {
    if (CACHE_TIME_OUT) {
      test.setTimeout(1000 * 1000);
    }

    const expectedActiveTasks = [
      'Learn JS today',
      'Learn Rust tomorrow',
      'Learning AI the day after tomorrow',
    ] as const;

    await ai('Type "Happy Birthday" in the task box, do NOT press Enter');
    await ai(
      'Type "Learn JS today" in the task box, then press Enter to create',
    );

    await ai(
      'Type "Learn Rust tomorrow" in the task box, then press Enter to create',
    );
    await ai(
      'Type "Learning AI the day after tomorrow" in the task box, then press Enter to create',
    );

    await expect(page.locator('.todo-list li label')).toHaveText(
      expectedActiveTasks,
    );

    const allTaskList = await queryVisibleTodoListWithRetry(
      aiQuery,
      expectedActiveTasks,
      'allTaskList',
    );
    expect(allTaskList).toContain('Learn JS today');
    expect(allTaskList).toContain('Learn Rust tomorrow');
    expect(allTaskList).toContain('Learning AI the day after tomorrow');

    await ai(
      'Move your mouse over "Learn Rust tomorrow" in the task list to reveal the delete button',
    );
    await ai(
      'Click the delete button (×) to the right of "Learn Rust tomorrow"',
    );
    await ai('Click the checkbox next to "Learning AI the day after tomorrow"');
    await ai('Click the "Completed" status filter button below the task list');

    await expect(page.locator('.todo-list li label')).toHaveText([
      'Learning AI the day after tomorrow',
    ]);

    const taskList = await queryVisibleTodoListWithRetry(
      aiQuery,
      ['Learning AI the day after tomorrow'],
      'completedTaskList',
    );
    expect(taskList).toContain('Learning AI the day after tomorrow');

    const placeholder = await aiQuery(
      'string, return the placeholder text in the input box',
    );
    expect(placeholder).toBe('What needs to be done?');
  });
});
