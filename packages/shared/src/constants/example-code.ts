export const PLAYWRIGHT_EXAMPLE_CODE = `
// Reference the following code to generate Midscene test cases
// The following is test code for Midscene AI, for reference
// The following is Playwright syntax, you can use Playwright to assist in test generation
IMPORTANT: Follow these exact type signatures for AI functions:

// Type signatures for AI functions:
aiInput(value: string, locator: string): Promise<void>
aiTap(locator: string): Promise<void>  
aiAssert(assertion: string): Promise<void>
aiQuery<T>(queryObject: Record<string, string>): Promise<T> // Extracts data from page based on descriptions

// examples:
// Reference the following code to generate Midscene test cases
// The following is test code for Midscene AI, for reference
// The following is Playwright syntax, you can use Playwright to assist in test generation
import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture({
  waitForNetworkIdleTimeout: 2000, // optional, the timeout for waiting for network idle between each action, default is 2000ms
  }));


test.beforeEach(async ({ page }) => {
  await page.goto('https://www.xxx.com/');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('ai shop', async ({
  aiInput,
  aiAssert,
  aiQuery,
  aiKeyboardPress,
  aiHover,
  aiTap,
  agentForPage,
  page,
}) => {
  // login
  await aiAssert('The page shows the login interface');
  await aiInput('user_name', 'in user name input');
  await aiInput('password', 'in password input');
  await aiKeyboardPress('Enter', 'Login Button');

  // check the login success
  await aiWaitFor('The page shows that the loading is complete');
  await aiAssert('The current page shows the product detail page');

  // check the product info
  const dataA = await aiQuery({
    userInfo: 'User information in the format {name: string}',
    theFirstProductInfo: 'The first product info in the format {name: string, price: number}',
  });
  expect(dataA.theFirstProductInfo.name).toBe('xxx');
  expect(dataA.theFirstProductInfo.price).toBe(100);


  // add to cart
  await aiTap('click add to cart button');
  
  await aiTap('click right top cart icon');
  await aiAssert('The cart icon shows the number 1');
});
`;

export const YAML_EXAMPLE_CODE = `
1. Format:

target:
  url: "starting_url"
  viewportWidth: 1280
  viewportHeight: 960

tasks:
  - name: "descriptive task name"
    flow:
      - aiTap: "element description"
      - aiInput: 'text value'
        locate: 'input field description'
      - aiScroll:
        direction: down/up
        scrollType: untilBottom/untilTop/page
      - aiAssert: "expected state"
      - sleep: milliseconds

2. Action Types:
- aiTap: for clicks (natural language targeting)
- aiInput: for text input with 'locate' field
- aiScroll: with direction and scrollType
- aiAssert: for validations
- sleep: for delays (milliseconds)

3. Best Practices:
- Group related actions into logical tasks
- Use natural language descriptions
- Add deepThink: true for complex interactions
- Keep task names concise but descriptive
`;