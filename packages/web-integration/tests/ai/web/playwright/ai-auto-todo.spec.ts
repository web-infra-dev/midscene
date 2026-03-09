import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test.describe('ai todo describe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');
    // Clear localStorage to avoid stale todo items from previous test runs
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('ai todo', async ({ ai, aiQuery }) => {
    if (CACHE_TIME_OUT) {
      test.setTimeout(1000 * 1000);
    }

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

    const allTaskList = await aiQuery<string[]>('string[], tasks in the list');
    console.log('allTaskList', allTaskList);
    // expect(allTaskList.length).toBe(3);
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

    const taskList = await aiQuery<string[]>(
      'string[], Extract all task names from the list',
    );
    expect(taskList.length).toBe(1);
    expect(taskList[0]).toBe('Learning AI the day after tomorrow');

    const placeholder = await aiQuery(
      'string, return the placeholder text in the input box',
    );
    expect(placeholder).toBe('What needs to be done?');
  });
});
