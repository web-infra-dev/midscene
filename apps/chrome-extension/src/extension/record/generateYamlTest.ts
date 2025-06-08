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
        text: `Generate YAML test for Midscene.js automation from recorded browser events.

Event Summary:
${JSON.stringify(summary, null, 2)}

Use this exact YAML format:

\`\`\`yaml
target:
  url: https://example.com

tasks:
  - name: task description
    flow:
      - aiInput: 'user@example.com'
        locate: 'the username input field'
      - aiInput: 'password123'
        locate: 'the password field'
      - aiTap: 'the login button'
      - aiAssert: Verify successful login
      - sleep: 2000
\`\`\`

Rules:
1. Use 'target.url' for starting URL
2. Group actions into logical tasks with descriptive names
3. Use these action types only:
   - aiTap: for clicks (natural language targeting)
   - aiInput: for text input with 'locate' field
   - aiScroll: with direction and scrollType
   - aiAssert: for validations
   - sleep: for delays (milliseconds)
4. Use natural language descriptions, not CSS selectors
5. Keep task names concise but descriptive
6. Add deepThink: true for complex interactions

Convert events:
- navigation → target.url
- click → aiTap with element description
- input → aiInput with value and locate
- scroll → aiScroll with appropriate direction
- Add aiAssert for important state changes

Respond with YAML only, no explanations.`,
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
        content: `You are an expert in Midscene.js YAML test generation. Generate clean, accurate YAML following the exact format:

target:
  url: "starting_url"

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

Key rules:
- Use aiTap for clicks with natural language targeting
- Use aiInput with 'locate' field for text input
- Use aiScroll with direction and scrollType
- Use aiAssert for validations
- Use sleep for delays
- Group related actions into logical tasks
- Use natural language, not CSS selectors
- Add deepThink: true for complex interactions`,
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
