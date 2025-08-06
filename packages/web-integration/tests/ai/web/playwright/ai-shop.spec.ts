import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test('ai shop', async ({
  ai,
  aiInput,
  aiAssert,
  aiQuery,
  aiTap,
  aiLocate,
  agentForPage,
  page,
}) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(1000 * 1000);
  }
  // login
  const agent = await agentForPage(page);
  await aiInput('standard_user', 'in user name input');
  await aiInput('secret_sauce', 'in password input');
  await agent.freezePageContext();
  const result = await Promise.all([
    aiLocate('login button'),
    aiLocate('username input'),
    aiLocate('password input'),
  ]);
  await agent.unfreezePageContext();
  await aiTap('login button');

  console.log(result);
});
