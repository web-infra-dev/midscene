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

  console.log('using report file:', htmlFile);
  expect(htmlFile).toBeTruthy();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`file:${htmlFile}`);
  await ai(
    'In the left sidebar, click the dropdown selector that shows a status icon (✓ or ✗) with a test case name, to expand the dropdown list',
  );
  await ai(
    'In the expanded dropdown list, click the option containing "ai todo"',
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
