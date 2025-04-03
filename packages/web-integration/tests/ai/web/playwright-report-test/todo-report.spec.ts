import path from 'node:path';
import { expect } from 'playwright/test';
import { test } from '../playwright/fixture';
import { getLastModifiedReportHTMLFile } from '../playwright/util';

test('ai report', async ({ page, ai, aiAssert, aiQuery }, testInfo) => {
  testInfo.snapshotSuffix = '';
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const htmlFile = getLastModifiedReportHTMLFile(
    path.join(process.cwd(), './midscene_run/report/'),
  );

  expect(htmlFile).toBeDefined();
  console.log('using report file:', htmlFile);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`file:${htmlFile}`);
  await ai(
    'Move your mouse over the task file path (on the right of the logo, with a check or cross icon) and click ai todo from the drop-down list',
  );
  const actionsList = await aiQuery(
    'Array<{title: string(task name,include action、wait), actions: Array<string(task action name,Excluding time)>}>',
  );
  const parseList = JSON.stringify(actionsList, null, 4);
  console.log('parseList:', parseList);
  await aiAssert(
    'On the left taskbar, check whether the specific execution content of the right task is normal',
  );
});
