import { AIActionType, callAi } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from '../logger';
import {
  validateEvents,
  prepareEventSummary,
  getScreenshotsForLLM,
  createMessageContent,
  handleTestGenerationError,
} from './shared/testGenerationUtils';
import type { PlaywrightGenerationOptions } from './shared/types';

/**
 * Generates Playwright test code from recorded events
 * Optimized version with shared utilities
 */
export const generatePlaywrightTest = async (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions = {},
): Promise<string> => {
  try {
    // Validate input
    validateEvents(events);

    recordLogger.info('Starting Playwright test generation', {
      eventsCount: events.length,
    });

    // Prepare event summary using shared utilities
    const summary = prepareEventSummary(events, {
      testName: options.testName,
      maxScreenshots: options.maxScreenshots || 3,
    });

    // Add Playwright-specific options to summary
    const playwrightSummary = {
      ...summary,
      waitForNetworkIdle: options.waitForNetworkIdle !== false,
      waitForNetworkIdleTimeout: options.waitForNetworkIdleTimeout || 2000,
      viewportSize: options.viewportSize || { width: 1280, height: 800 },
    };

    // Get screenshots for visual context
    const screenshots = getScreenshotsForLLM(
      events,
      options.maxScreenshots || 3,
    );

    // Create prompt text
    const promptText = `Generate a Playwright test using @midscene/web/playwright that reproduces this recorded browser session. The test should be based on the following events and follow the structure of the example provided. Make the test descriptive with appropriate assertions and validations.

Event Summary:
${JSON.stringify(playwrightSummary, null, 2)}

Generated code should:
1. Import required dependencies
2. Set up the test with proper configuration
3. Include a beforeEach hook to navigate to the starting URL
4. Implement a test that uses Midscene AI methods (aiTap, aiInput, aiAssert, etc.)
5. Include appropriate assertions and validations
6. Follow best practices for Playwright tests
7. Be ready to execute without further modification

Respond ONLY with the complete Playwright test code, no explanations.`;

    // Create message content with screenshots
    const messageContent = createMessageContent(
      promptText,
      screenshots,
      options.includeScreenshots !== false,
    );

    // Create system prompt
    const systemPrompt = `You are an expert test automation engineer specializing in Playwright and Midscene. 
Your task is to generate a complete, executable Playwright test using @midscene/web/playwright that reproduces a recorded browser session.
Always follow the structure of the example below:

import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture({
  waitForNetworkIdleTimeout: 2000,
}));

test.beforeEach(async ({ page }) => {
  await page.goto('https://www.example.com/');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('Example test', async ({
  aiInput,
  aiAssert,
  aiQuery,
  aiKeyboardPress,
  aiHover,
  aiTap,
  agentForPage,
  page,
}) => {
  await aiAssert('The page shows the login interface');
  await aiInput('username', 'in user name input');
  await aiInput('password', 'in password input');
  await aiTap('click login button');
  
  await aiAssert('The page shows that the user is logged in');
  
  const data = await aiQuery({
    userInfo: 'User information in the format {name: string}',
  });
  
  console.log(\`Logged in as: \${data.userInfo.name}\`);
});`;

    // Use LLM to generate the Playwright test code
    const prompt = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: messageContent,
      },
    ];

    const response = await callAi(prompt, AIActionType.EXTRACT_DATA);

    if (response?.content && typeof response.content === 'string') {
      recordLogger.success('Playwright test generated successfully', {
        eventsCount: events.length,
      });
      return response.content;
    }

    throw new Error('Failed to generate Playwright test code');
  } catch (error) {
    throw handleTestGenerationError(error, 'Playwright test', events.length);
  }
};
