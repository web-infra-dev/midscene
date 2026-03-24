import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { test as base } from '@playwright/test';

const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    waitForNetworkIdleTimeout: 2000,
  }),
);

test.beforeEach(async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('todo app add complete and clear workflow', async ({
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
  // Add a new todo item
  await aiInput(
    'hello world',
    'in the input field with placeholder "What needs to be done?"',
  );
  await aiKeyboardPress('Enter', 'in the input field');

  // Verify the todo item is added
  await aiWaitFor('the todo item "hello world" appears in the list');
  await aiAssert(
    'the list contains the item "hello world" and shows "1 item left"',
  );

  // Mark the todo as completed by clicking the checkbox
  await aiTap('the checkbox circle next to the todo item "hello world"');
  await aiWaitFor(
    'the todo item "hello world" is marked as completed with a strikethrough and green checkmark',
  );
  await aiAssert('the counter shows "0 items left"');

  // Clear completed todos
  await aiTap('the "Clear completed" button on the right side of the footer');

  // Verify the list is empty after clearing
  await aiWaitFor('the todo list is empty and the item "hello world" is gone');
  await aiAssert('there are no todo items visible in the list');
});
