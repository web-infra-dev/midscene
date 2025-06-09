import { AIActionType, callAi } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from '../logger';
import {
  createMessageContent,
  getScreenshotsForLLM,
  handleTestGenerationError,
  prepareEventSummary,
  validateEvents,
} from './shared/testGenerationUtils';
import type { YamlGenerationOptions } from './shared/types';

/**
 * Generates YAML test configuration from recorded events using AI
 * Optimized version with shared utilities
 */
export const generateYamlTest = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions = {},
): Promise<string> => {
  try {
    // Validate input
    validateEvents(events);

    recordLogger.info('Starting AI-powered YAML test generation', {
      eventsCount: events.length,
    });

    // Prepare event summary using shared utilities
    const summary = prepareEventSummary(events, {
      testName: options.testName,
      maxScreenshots: options.maxScreenshots || 3,
    });

    // Add YAML-specific options to summary
    const yamlSummary = {
      ...summary,
      includeScreenshots: options.includeScreenshots || false,
      includeTimestamps: options.includeTimestamps || false,
    };

    // Get screenshots for visual context
    const screenshots = getScreenshotsForLLM(
      events,
      options.maxScreenshots || 3,
    );

    // Create prompt text
    const promptText = `Generate YAML test for Midscene.js automation from recorded browser events.

Event Summary:
${JSON.stringify(yamlSummary, null, 2)}

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

Respond with YAML only, no explanations.`;

    // Create message content with screenshots
    const messageContent = createMessageContent(
      promptText,
      screenshots,
      options.includeScreenshots !== false,
    );

    // Create system prompt
    const systemPrompt = `You are an expert in Midscene.js YAML test generation. Generate clean, accurate YAML following the exact format:

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
- Add deepThink: true for complex interactions`;

    // Use LLM to generate the YAML test configuration
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
      recordLogger.success('AI-powered YAML test generated successfully', {
        eventsCount: events.length,
      });
      return response.content;
    }

    throw new Error('Failed to generate YAML test configuration');
  } catch (error) {
    throw handleTestGenerationError(error, 'YAML test', events.length);
  }
};

/**
 * Export events as YAML file using AI generation
 */
export const exportEventsToYaml = async (
  events: ChromeRecordedEvent[],
  sessionName: string,
  options: YamlGenerationOptions = {},
): Promise<void> => {
  try {
    recordLogger.info('Exporting events to AI-generated YAML', {
      eventsCount: events.length,
    });

    const yamlContent = await generateYamlTest(events, {
      testName: sessionName,
      description: `Test session recorded on ${new Date().toLocaleDateString()}`,
      ...options,
    });

    const dataBlob = new Blob([yamlContent], {
      type: 'application/x-yaml',
    });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${sessionName}-test.yaml`;
    link.click();

    URL.revokeObjectURL(url);
    recordLogger.success(
      `AI-generated YAML file exported: ${sessionName}-test.yaml`,
    );
  } catch (error) {
    recordLogger.error('Error exporting events to YAML', undefined, error);
    throw new Error(`Failed to export YAML: ${error}`);
  }
};
