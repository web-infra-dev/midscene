import { join } from 'node:path';
import { test } from './fixture';

test('test open new tab', async ({ page, ai, aiAssert }) => {
  const htmlPath = join(__dirname, '../../fixtures/tab-navigation.html');
  await page.goto(`file://${htmlPath}`);

  // forceSameTabNavigation defaults to true in fixture,
  // so the popup should be intercepted and navigated in the same tab
  await ai('Click on the "Open in New Tab" link');

  await aiAssert('There is a weather forecast in the page');
});
