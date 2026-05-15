import path from 'node:path';
import { expect } from 'playwright/test';
import { test } from '../playwright/fixture';
import { getLastModifiedReportHTMLFile } from '../playwright/util';

test('ai report', async ({ page, aiAssert, aiQuery }, testInfo) => {
  testInfo.snapshotSuffix = '';
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const htmlFile = getLastModifiedReportHTMLFile(
    path.join(process.cwd(), './midscene_run/report/'),
  );

  console.log('using report file:', htmlFile);
  expect(htmlFile).toBeTruthy();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`file:${htmlFile}`);
  await page.locator('.modern-playwright-selector .selector-header').click();
  const options = page.locator('.selector-content .option-item');
  await expect(options.first()).toBeVisible();

  const aiTodoOption = options.filter({ hasText: /ai todo/i });
  if ((await aiTodoOption.count()) > 0) {
    await aiTodoOption.first().click();
  } else {
    await options.first().click();
  }

  const actionsList = await aiQuery(
    'Array<{title: string(task name,include action、wait), actions: Array<string(task action name,Excluding time)>}>',
  );
  const parseList = JSON.stringify(actionsList, null, 4);
  console.log('parseList:', parseList);
  await aiAssert(
    'On the left taskbar, check whether the specific execution content of the right task is normal',
  );
});
