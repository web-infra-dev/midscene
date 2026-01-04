export const PLAYWRIGHT_EXAMPLE_CODE = `
// Reference the following code to generate Midscene test cases
// The following is test code for Midscene AI, for reference
// The following is Playwright syntax, you can use Playwright to assist in test generation
IMPORTANT: Follow these exact type signatures for AI functions:

// Type signatures for AI functions:
aiAct(prompt: string, options?: { cacheable?: boolean, deepThink?: 'unset' | true | false }): Promise<void>
aiInput(text: string, locate: string, options?: { deepThink?: boolean, xpath?: string, cacheable?: boolean }): Promise<void>
aiTap(locate: string, options?: { deepThink?: boolean, xpath?: string, cacheable?: boolean }): Promise<void>
aiHover(locate: string, options?: { deepThink?: boolean, xpath?: string, cacheable?: boolean }): Promise<void>
aiDoubleClick(locate: string, options?: { deepThink?: boolean, xpath?: string, cacheable?: boolean }): Promise<void>
aiKeyboardPress(key: string, locate?: string, options?: { deepThink?: boolean, xpath?: string, cacheable?: boolean }): Promise<void>
aiScroll(locate: string | undefined, options: {
  direction?: 'up' | 'down' | 'left' | 'right',
  scrollType?: 'singleAction' | 'scrollToBottom' | 'scrollToTop' | 'scrollToRight' | 'scrollToLeft',
  distance?: number | null,
  deepThink?: boolean,
  xpath?: string,
  cacheable?: boolean
}): Promise<void>
aiAssert(assertion: string, options?: { errorMessage?: string }): Promise<void>
aiWaitFor(prompt: string, options?: { timeout?: number }): Promise<void>
aiQuery<T>(queryObject: Record<string, string>): Promise<T> // Extracts data from page based on descriptions

// examples:
// Reference the following code to generate Midscene test cases
// The following is test code for Midscene AI, for reference
// The following is Playwright syntax, you can use Playwright to assist in test generation
import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture({
  waitForNetworkIdleTimeout: 2000, // optional, the timeout for waiting for network idle between each action, default is 2000ms
}));


test.beforeEach(async ({ page }) => {
  await page.goto('https://www.xxx.com/');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('ai shop', async ({
  aiAct,
  aiInput,
  aiAssert,
  aiQuery,
  aiKeyboardPress,
  aiHover,
  aiTap,
  aiWaitFor,
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

web:
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
        scrollType: scrollToBottom/scrollToTop/singleAction
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



YAML type
tasks:
  - name: <name>
    continueOnError: <boolean> # Optional, whether to continue to the next task on error, defaults to false.
    flow:
      # Auto Planning (.ai)
      # ----------------

      # Perform an interaction. \`ai\` is a shorthand for \`aiAct\`.
      - ai: <prompt>
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # This usage is the same as \`ai\`.
      - aiAct: <prompt>
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Instant Action (.aiTap, .aiDoubleClick, .aiHover, .aiInput, .aiKeyboardPress, .aiScroll)
      # ----------------

      # Tap an element described by a prompt.
      - aiTap: <prompt>
        deepThink: <boolean> # Optional, whether to use deepThink to precisely locate the element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Double click an element described by a prompt.
      - aiDoubleClick: <prompt>
        deepThink: <boolean> # Optional, whether to use deepThink to precisely locate the element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Hover over an element described by a prompt.
      - aiHover: <prompt>
        deepThink: <boolean> # Optional, whether to use deepThink to precisely locate the element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Input text into an element described by a prompt.
      - aiInput: <final text content of the input>
        locate: <prompt>
        deepThink: <boolean> # Optional, whether to use deepThink to precisely locate the element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Press a key (e.g., Enter, Tab, Escape) on an element described by a prompt.
      - aiKeyboardPress: <key>
        locate: <prompt>
        deepThink: <boolean> # Optional, whether to use deepThink to precisely locate the element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Scroll globally or on an element described by a prompt.
      - aiScroll:
        direction: 'up' # or 'down' | 'left' | 'right'
        scrollType: 'singleAction' # or 'scrollToTop' | 'scrollToBottom' | 'scrollToLeft' | 'scrollToRight'
        distance: <number> # Optional, the scroll distance in pixels.
        locate: <prompt> # Optional, the element to scroll on.
        deepThink: <boolean> # Optional, whether to use deepThink to precisely locate the element. Defaults to False.
        xpath: <xpath> # Optional, the xpath of the target element for the operation. If provided, Midscene will prioritize this xpath to find the element before using the cache and the AI model. Defaults to empty.
        cacheable: <boolean> # Optional, whether to cache the result of this API call when the [caching feature](./caching.mdx) is enabled. Defaults to True.

      # Record the current screenshot with a description in the report file.
      - recordToReport: <title> # Optional, the title of the screenshot. If not provided, the title will be 'untitled'.
        content: <content> # Optional, the description of the screenshot.

      # Data Extraction
      # ----------------

      # Perform a query that returns a JSON object.
      - aiQuery: <prompt> # Remember to describe the format of the result in the prompt.
        name: <name> # The key for the query result in the JSON output.

      # More APIs
      # ----------------

      # Wait for a condition to be met, with a timeout (in ms, optional, defaults to 30000).
      - aiWaitFor: <prompt>
        timeout: <ms>

      # Perform an assertion.
      - aiAssert: <prompt>
        errorMessage: <error-message> # Optional, the error message to print if the assertion fails.

      # Wait for a specified amount of time.
      - sleep: <ms>

      # Execute a piece of JavaScript code in the web page context.
      - javascript: <javascript>
        name: <name> # Optional, assign a name to the return value, which will be used as a key in the JSON output.

  - name: <name>
    flow:
      # ...
`;
