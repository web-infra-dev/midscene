import { test } from '@playwright/test';
import { generateTestData, generateTestDataPath } from './tool';

test('generate todo test data', async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
  // Add data
  await page.getByTestId('text-input').click();
  await page.keyboard.type('Learn Python');
  await page.keyboard.press('Enter');
  await page.getByTestId('text-input').click();
  await page.keyboard.type('Learn Rust');
  await page.keyboard.press('Enter');
  await page.getByTestId('text-input').click();
  await page.keyboard.type('Learn AI');
  await page.keyboard.press('Enter');
  await page.getByText('Learn Rust').hover();

  const midsceneTestDataPath = generateTestDataPath('todo');
  const buffer = await page.screenshot();

  const base64String = buffer.toString('base64');
  await generateTestData(page, midsceneTestDataPath, base64String);
});

test('generate visualstudio test data', async ({ page }) => {
  await page.goto('https://code.visualstudio.com/');
  await page.waitForLoadState('networkidle');

  const midsceneTestDataPath = generateTestDataPath('visualstudio');
  const buffer = await page.screenshot();

  const base64String = buffer.toString('base64');
  await generateTestData(page, midsceneTestDataPath, base64String);
});

test('generate githubstatus test data', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://www.githubstatus.com/');
  await page.waitForLoadState('networkidle');

  const midsceneTestDataPath = generateTestDataPath('githubstatus');
  const buffer = await page.screenshot();

  const base64String = buffer.toString('base64');
  await generateTestData(page, midsceneTestDataPath, base64String);
});

test('generate xicha test data', async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.evaluate('window.localStorage.setItem("LOCALE", "zh-CN")');
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');

  const midsceneTestDataPath = generateTestDataPath('xicha');
  const buffer = await page.screenshot();

  const base64String = buffer.toString('base64');
  await generateTestData(page, midsceneTestDataPath, base64String);
});
