import { AIActionType, callAi } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from './logger';

/**
 * Generates Playwright test code from recorded events
 *
 * @param events Array of RecordedEvent objects
 * @param options Configuration options for test generation
 * @returns Generated Playwright test code as string
 */
export const generatePlaywrightTest = async (
  events: ChromeRecordedEvent[],
  options: {
    testName?: string;
    viewportSize?: { width: number; height: number };
    waitForNetworkIdle?: boolean;
    waitForNetworkIdleTimeout?: number;
  } = {},
): Promise<string> => {
  if (!events.length) {
    throw new Error('No events provided for test generation');
  }

  recordLogger.info('Starting Playwright test generation', {
    eventsCount: events.length,
  });

  try {
    // Prepare data for the LLM
    const navigationEvents = events.filter(
      (event) => event.type === 'navigation',
    );
    const clickEvents = events.filter((event) => event.type === 'click');
    const inputEvents = events.filter((event) => event.type === 'input');
    const scrollEvents = events.filter((event) => event.type === 'scroll');
    // const viewportEvents = events.filter(event => event.type === 'setViewport');
    // const keydownEvents = events.filter(event => event.type === 'keydown');

    // Get screenshots for visual context if available
    const screenshots = getScreenshotsForLLM(events, 3); // Get up to 3 screenshots

    // Extract useful information from events
    const startUrl = navigationEvents.length > 0 ? navigationEvents[0].url : '';
    const pageTitles = navigationEvents
      .map((event) => event.title)
      .filter(Boolean);

    const clickDescriptions = clickEvents
      .map((event) => event.elementDescription)
      .filter(Boolean);

    const inputDescriptions = inputEvents
      .map((event) => ({
        description: event.elementDescription,
        value: event.value,
      }))
      .filter((item) => item.description && item.value);

    // Default viewport size
    // const viewportSize = options.viewportSize ||
    //   (viewportEvents.length > 0
    //     ? { width: viewportEvents[0].pageWidth || 1280, height: viewportEvents[0].pageHeight || 800 }
    //     : { width: 1280, height: 800 });

    // Default test name
    const testName = options.testName || 'Automated test from recorded events';

    // Create a summary object for the LLM
    const summary = {
      testName,
      startUrl,
      // viewportSize,
      eventCounts: {
        navigation: navigationEvents.length,
        click: clickEvents.length,
        input: inputEvents.length,
        scroll: scrollEvents.length,
        // viewport: viewportEvents.length,
        // keydown: keydownEvents.length,
        total: events.length,
      },
      pageTitles: pageTitles.slice(0, 5),
      urls: navigationEvents.map((e) => e.url).slice(0, 5),
      clickDescriptions: clickDescriptions.slice(0, 10),
      inputDescriptions: inputDescriptions.slice(0, 10),
      waitForNetworkIdle: options.waitForNetworkIdle !== false,
      waitForNetworkIdleTimeout: options.waitForNetworkIdleTimeout || 2000,
      events: events.map((event) => ({
        type: event.type,
        timestamp: event.timestamp,
        url: event.url,
        title: event.title,
        elementDescription: event.elementDescription,
        value: event.value,
        pageInfo: event.pageInfo,
        elementRect: event.elementRect,
      })),
    };

    // Create message content for the LLM
    const messageContent: Array<string | Record<string, any>> = [
      {
        type: 'text',
        text: `Generate a Playwright test using @midscene/web/playwright that reproduces this recorded browser session. The test should be based on the following events and follow the structure of the example provided. Make the test descriptive with appropriate assertions and validations.

Event Summary:
${JSON.stringify(summary, null, 2)}

Generated code should:
1. Import required dependencies
2. Set up the test with proper configuration
3. Include a beforeEach hook to navigate to the starting URL
4. Implement a test that uses Midscene AI methods (aiTap, aiInput, aiAssert, etc.)
5. Include appropriate assertions and validations
6. Follow best practices for Playwright tests
7. Be ready to execute without further modification

Respond ONLY with the complete Playwright test code, no explanations.`,
      },
    ];

    // Add screenshots if available
    if (screenshots.length > 0) {
      messageContent.unshift({
        type: 'text',
        text: 'Here are the recording session to help you understand the context:',
      });
    }

    // Use LLM to generate the Playwright test code
    const prompt = [
      {
        role: 'system',
        content: `You are an expert test automation engineer specializing in Playwright and Midscene. 
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
 });

`,
      },
      {
        role: 'user',
        content: messageContent,
      },
    ];

    const response = await callAi(prompt, AIActionType.EXTRACT_DATA);

    if (response?.content && typeof response.content === 'string') {
      return response.content;
    }

    throw new Error('Failed to generate Playwright test code');
  } catch (error) {
    recordLogger.error('Error generating Playwright test', undefined, error);
    throw new Error(`Failed to generate Playwright test: ${error}`);
  }
};

// Helper function to get screenshots from events (same as in utils.ts)
const getScreenshotsForLLM = (
  events: ChromeRecordedEvent[],
  maxScreenshots = 1,
): string[] => {
  // Find events with screenshots, prioritizing navigation and click events
  const eventsWithScreenshots = events.filter(
    (event) =>
      event.screenshotBefore ||
      event.screenshotAfter ||
      event.screenshotWithBox,
  );

  // Sort them by priority (navigation first, then clicks, then others)
  const sortedEvents = [...eventsWithScreenshots].sort((a, b) => {
    if (a.type === 'navigation' && b.type !== 'navigation') return -1;
    if (a.type !== 'navigation' && b.type === 'navigation') return 1;
    if (a.type === 'click' && b.type !== 'click') return -1;
    if (a.type !== 'click' && b.type === 'click') return 1;
    return 0;
  });

  // Extract up to maxScreenshots screenshots
  const screenshots: string[] = [];
  for (const event of sortedEvents) {
    // Prefer the most informative screenshot
    const screenshot =
      event.screenshotWithBox ||
      event.screenshotAfter ||
      event.screenshotBefore;
    if (screenshot && !screenshots.includes(screenshot)) {
      screenshots.push(screenshot);
      if (screenshots.length >= maxScreenshots) break;
    }
  }

  return screenshots;
};
