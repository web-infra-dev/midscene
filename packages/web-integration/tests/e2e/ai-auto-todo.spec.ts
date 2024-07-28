import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
});

test('ai todo', async ({ ai, aiQuery }) => {
  await ai('Enter "Learn JS today" in the task box, then press Enter to create');
  await ai('Enter "Learn Rust tomorrow" in the task box, then press Enter to create');
  await ai('Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create');
  await ai(
    'Move your mouse over the second item in the task list and click the Delete button to the right of the second task',
  );
  await ai('Click the check button to the left of the second task');
  await ai('Click the completed Status button below the task list');

  const taskList = await aiQuery<string[]>('string[], tasks in the list');
  expect(taskList.length).toBe(1);
  expect(taskList[0]).toBe('Learning AI the day after tomorrow');

  const placeholder = await ai('string, return the placeholder text in the input box', { type: 'query' });
  expect(placeholder).toBe('What needs to be done?');
});
