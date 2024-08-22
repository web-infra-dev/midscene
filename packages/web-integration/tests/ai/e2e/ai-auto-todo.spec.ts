import path from 'node:path';
import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
});

test.afterEach(async ({ page, ai, aiAssert }) => {
  await page.goto(
    `file://${path.join(__dirname, '../../../midscene_run/report/latest-playwright-report.html')}`,
  );
  const actionsList = await ai(
    'Sidebar task list Array<{title: string, actions: Array<string>}>',
    {
      type: 'query',
    },
  );
  const parseList = JSON.stringify(actionsList, null, 4);
  expect(parseList).toMatchSnapshot();
  await aiAssert(
    'On the left taskbar, check whether the specific execution content of the right task is normal',
  );
});

test('ai todo', async ({ ai, aiQuery, aiWaitFor }) => {
  await ai(
    'Enter "Learn JS today" in the task box, then press Enter to create',
  );

  await aiWaitFor('the input box for task title is empty now');

  await ai(
    'Enter "Learn Rust tomorrow" in the task box, then press Enter to create',
  );
  await ai(
    'Enter "Learning AI the day after tomorrow" in the task box, then press Enter to create',
  );
  await ai('Move your mouse over the second item in the task list');
  await ai('Click the delete button to the right of the second task');
  await ai('Click the check button to the left of the second task');
  await ai('Click the completed Status button below the task list');

  const taskList = await aiQuery<string[]>('string[], tasks in the list');
  expect(taskList.length).toBe(1);
  expect(taskList[0]).toBe('Learning AI the day after tomorrow');

  const placeholder = await ai(
    'string, return the placeholder text in the input box',
    { type: 'query' },
  );
  expect(placeholder).toBe('What needs to be done?');
});
