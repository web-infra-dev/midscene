# Midscene Playwright Test Generator

This feature allows you to convert recorded browser sessions into executable Playwright tests using Midscene's AI-powered automation framework.

## How It Works

1. Record a browser session using the Chrome extension
2. Click "Generate Playwright Test" in the recording interface
3. The system will analyze your recorded events (clicks, inputs, navigation, etc.)
4. AI will generate a Playwright test that reproduces your recorded session
5. You can copy or download the generated test

## Features

- **AI-powered test generation**: Turns recorded browser interactions into readable Playwright tests
- **Uses Midscene's AI automation**: Leverages `aiTap`, `aiInput`, `aiAssert` and other AI-based commands
- **Visual context awareness**: Includes element descriptions and assertions based on page state
- **Ready-to-run tests**: Generated tests work out of the box with Midscene's Playwright integration

## Example Usage

```typescript
// Sample generated test for a login flow
import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture({
  waitForNetworkIdleTimeout: 2000,
}));

test.beforeEach(async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('Login and check dashboard', async ({
  aiInput,
  aiAssert,
  aiTap,
  page,
}) => {
  await aiAssert('The page shows the login form with email and password fields');
  await aiInput('user@example.com', 'in the email input field');
  await aiInput('password123', 'in the password field');
  await aiTap('click on the login button');
  
  await aiAssert('The page shows the user dashboard with account information');
});
```

## Running Generated Tests

To run the generated tests:

1. Make sure you have the Midscene packages installed:
   ```bash
   pnpm install @midscene/web @midscene/core
   ```

2. Save the generated test to a file with `.spec.ts` extension

3. Run the test using Playwright:
   ```bash
   npx playwright test your-test.spec.ts
   ```

## How The Generator Works

The test generator:

1. Analyzes your recorded events (clicks, inputs, navigation, etc.)
2. Identifies important UI elements and interactions
3. Creates a Playwright test using Midscene's AI-powered commands
4. Adds appropriate assertions based on page state changes
5. Structures the test with proper setup and teardown

## Tips for Better Tests

For best results when recording:

- Start with a clean browser state
- Perform actions deliberately and clearly
- Allow pages to load completely between actions
- Use descriptive actions that demonstrate a complete flow
- Test one complete user journey at a time

## Troubleshooting

If your generated tests don't run correctly:

- Check if element selectors need adjustment
- Verify all required dependencies are installed
- Ensure you're using the correct Midscene version
- Add additional wait conditions if timing issues occur
- Review the test with a developer if complex interactions fail