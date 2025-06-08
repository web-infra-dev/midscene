import { AIActionType, callAi } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from './logger';

/**
 * Generates YAML test configuration from recorded events using AI
 *
 * @param events Array of RecordedEvent objects
 * @param options Configuration options for YAML generation
 * @returns Generated YAML test configuration as string
 */
export const generateYamlTest = async (
  events: ChromeRecordedEvent[],
  options: {
    testName?: string;
    description?: string;
    includeScreenshots?: boolean;
    includeTimestamps?: boolean;
  } = {},
): Promise<string> => {
  if (!events.length) {
    throw new Error('No events provided for YAML generation');
  }

  recordLogger.info('Starting AI-powered YAML test generation', {
    eventsCount: events.length,
  });

  try {
    // Prepare data for the LLM similar to generatePlaywrightTest
    const navigationEvents = events.filter(
      (event) => event.type === 'navigation',
    );
    const clickEvents = events.filter((event) => event.type === 'click');
    const inputEvents = events.filter((event) => event.type === 'input');
    const scrollEvents = events.filter((event) => event.type === 'scroll');

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

    // Default test name
    const testName = options.testName || 'Automated test from recorded events';

    // Create a summary object for the LLM
    const summary = {
      testName,
      startUrl,
      eventCounts: {
        navigation: navigationEvents.length,
        click: clickEvents.length,
        input: inputEvents.length,
        scroll: scrollEvents.length,
        total: events.length,
      },
      pageTitles: pageTitles.slice(0, 5),
      urls: navigationEvents.map((e) => e.url).slice(0, 5),
      clickDescriptions: clickDescriptions.slice(0, 10),
      inputDescriptions: inputDescriptions.slice(0, 10),
      includeScreenshots: options.includeScreenshots || false,
      includeTimestamps: options.includeTimestamps || false,
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
        text: `Generate a comprehensive YAML test configuration for Midscene.js automation that represents this recorded browser session. The YAML should follow Midscene.js conventions and be structured for AI-powered browser automation.

Event Summary:
${JSON.stringify(summary, null, 2)}

IMPORTANT: Generate YAML that follows Midscene.js automation format with these requirements:

1. Use Midscene.js action types: aiAction, aiQuery, aiAssert, sleep
2. Use natural language descriptions for element targeting (not CSS selectors)
3. Include proper test metadata and configuration
4. Follow Midscene.js YAML schema conventions
5. Use descriptive step names that reflect user intent
6. Include viewport configuration and timeouts
7. Map browser events to meaningful AI actions

Example Midscene.js YAML structure:
\`\`\`yaml
name: "Login and Navigation Test"
description: "Automated test generated from recorded user session"
url: "https://example.com/login"
config:
  viewport:
    width: 1280
    height: 800
  timeout: 30000
  waitForNetworkIdle: true
steps:
  - name: "Fill in username"
    aiAction:
      type: "input"
      locator: "the username input field"
      value: "user@example.com"
    
  - name: "Fill in password"  
    aiAction:
      type: "input"
      locator: "the password field"
      value: "password123"
    
  - name: "Click login button"
    aiAction:
      type: "click"
      locator: "the login button"
    
  - name: "Verify successful login"
    aiAssert:
      expect: "user dashboard or welcome message is visible"
    
  - name: "Wait for page load"
    sleep: 2000
\`\`\`

Key guidelines for Midscene.js YAML:
- Use 'aiAction' for interactions (click, input, navigate, scroll)
- Use 'aiQuery' for data extraction
- Use 'aiAssert' for validations and checks
- Use 'sleep' for waiting periods
- Use natural language for 'locator' fields (describe elements as humans would)
- Include meaningful step names that describe user intent
- Convert navigation events to navigate actions
- Convert click events to click actions with descriptive locators
- Convert input events to input actions with values
- Add assertions for important state changes
- Group related actions logically

Respond ONLY with the complete YAML content, no explanations or markdown code blocks.`,
      },
    ];

    // Add screenshots if available
    if (screenshots.length > 0) {
      messageContent.unshift({
        type: 'text',
        text: 'Here are screenshots from the recording session to help you understand the context:',
      });
      
      // Add screenshot images
      screenshots.forEach((screenshot) => {
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: screenshot,
          },
        });
      });
    }

    // Use LLM to generate the YAML test configuration
    const prompt = [
      {
        role: 'system',
        content: `You are an expert in Midscene.js automation framework specializing in YAML-based test configurations. 
Your task is to generate a complete, well-structured YAML test configuration that represents a recorded browser session using Midscene.js conventions.

The YAML should be:
- Properly formatted and syntactically correct for Midscene.js
- Using AI-powered automation patterns (aiAction, aiQuery, aiAssert)
- Clear and descriptive with natural language element targeting
- Suitable for Midscene.js automation framework
- Following Midscene.js YAML best practices and conventions

Always map browser events to Midscene.js actions:
- navigation → aiAction with type: "navigate" and url
- click → aiAction with type: "click" and natural language locator
- input → aiAction with type: "input" with locator and value
- scroll → aiAction with type: "scroll" 
- setViewport → config viewport settings
- keydown → aiAction with type: "key" or keyboard interaction

Use natural language descriptions for locators instead of CSS selectors:
- "the login button" instead of "button[type='submit']"
- "the username input field" instead of "#username"
- "the navigation menu" instead of ".nav-menu"

Include proper Midscene.js configuration settings like viewport size, timeouts, and waitForNetworkIdle.
Add meaningful aiAssert steps for important state changes and validations.
Group related actions logically and use descriptive step names that reflect user intent.`,
      },
      {
        role: 'user',
        content: messageContent,
      },
    ];

    const response = await callAi(prompt, AIActionType.EXTRACT_DATA);

    if (response?.content && typeof response.content === 'string') {
      recordLogger.success('AI-powered YAML test generated successfully', {
        eventsCount: events.length,
      });
      return response.content;
    }

    throw new Error('Failed to generate YAML test configuration');
  } catch (error) {
    recordLogger.error('Error generating YAML test', undefined, error);
    throw new Error(`Failed to generate YAML test: ${error}`);
  }
};

// Helper function to get screenshots from events (reused from generatePlaywrightTest)
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

/**
 * Export events as YAML file using AI generation
 */
export const exportEventsToYaml = (
  events: ChromeRecordedEvent[],
  sessionName: string,
  options: {
    includeScreenshots?: boolean;
    includeTimestamps?: boolean;
  } = {},
): void => {
  try {
    recordLogger.info('Exporting events to AI-generated YAML', {
      eventsCount: events.length,
    });

    generateYamlTest(events, {
      testName: sessionName,
      description: `Test session recorded on ${new Date().toLocaleDateString()}`,
      ...options,
    })
      .then((yamlContent) => {
        const dataBlob = new Blob([yamlContent], {
          type: 'application/x-yaml',
        });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${sessionName}-test.yaml`;
        link.click();

        URL.revokeObjectURL(url);
        recordLogger.success(`AI-generated YAML file exported: ${sessionName}-test.yaml`);
      })
      .catch((error) => {
        recordLogger.error('Failed to export YAML file', undefined, error);
        throw error;
      });
  } catch (error) {
    recordLogger.error('Error exporting events to YAML', undefined, error);
    throw new Error(`Failed to export YAML: ${error}`);
  }
};
