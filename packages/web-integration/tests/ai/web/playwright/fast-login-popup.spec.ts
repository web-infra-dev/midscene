import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';
import { test } from './fixture';

test('fast aiAct handles an advertisement popup during login', async ({
  agentForPage,
  page,
}) => {
  const fixtureDir = path.resolve(__dirname, '__fixtures__/fast-login-popup');
  await page.goto(pathToFileURL(path.join(fixtureDir, 'index.html')).href);

  const agent = await agentForPage(page);
  await agent.aiAct(
    'Log in with username "demo-user" and password "demo-password".',
    { effort: 'fast', cacheable: false },
  );

  await expect(page.locator('body')).toHaveAttribute(
    'data-login-state',
    'signed-in',
  );
  await expect(page.locator('#success')).toContainText('Login successful');
});
