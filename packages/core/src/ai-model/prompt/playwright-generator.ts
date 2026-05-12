import type {
  StreamingAIResponse,
  StreamingCodeGenerationOptions,
} from '@/types';
import { PLAYWRIGHT_EXAMPLE_CODE } from '@midscene/shared/constants';
import type { IModelConfig } from '@midscene/shared/env';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { callAI, callAIWithStringResponse } from '../index';
// Import shared utilities and types from yaml-generator
import {
  type ChromeRecordedEvent,
  type EventCounts,
  type EventSummary,
  type InputDescription,
  type ProcessedEvent,
  createEventCounts,
  createMessageContent,
  extractInputDescriptions,
  filterEventsByType,
  getScreenshotsForLLM,
  prepareEventSummary,
  processEventsForLLM,
  validateEvents,
} from './yaml-generator';

// Playwright-specific interfaces
export interface PlaywrightGenerationOptions {
  testName?: string;
  includeScreenshots?: boolean;
  includeTimestamps?: boolean;
  maxScreenshots?: number;
  description?: string;
  viewportSize?: { width: number; height: number };
  waitForNetworkIdle?: boolean;
  waitForNetworkIdleTimeout?: number;
}

// Re-export shared types for backward compatibility
export type {
  ChromeRecordedEvent,
  EventCounts,
  InputDescription,
  ProcessedEvent,
  EventSummary,
};

// Re-export shared utilities for backward compatibility
export {
  getScreenshotsForLLM,
  filterEventsByType,
  createEventCounts,
  extractInputDescriptions,
  processEventsForLLM,
  prepareEventSummary,
  createMessageContent,
  validateEvents,
};

/**
 * Generates Playwright test code from recorded events
 */
export const generatePlaywrightTest = async (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions,
  modelConfig: IModelConfig,
): Promise<string> => {
  // Validate input
  validateEvents(events);

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
  const screenshots = getScreenshotsForLLM(events, options.maxScreenshots || 3);

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

Important: Return ONLY the raw Playwright test code. Do NOT wrap the response in markdown code blocks (no \`\`\`typescript, \`\`\`javascript or \`\`\`). Start directly with the code content.`;

  // Create message content with screenshots
  const messageContent = createMessageContent(
    promptText,
    screenshots,
    options.includeScreenshots !== false,
  );

  // Create system prompt
  const systemPrompt = `You are an expert test automation engineer specializing in Playwright and Midscene. 
Your task is to generate a complete, executable Playwright test using @midscene/web/playwright that reproduces a recorded browser session.

${PLAYWRIGHT_EXAMPLE_CODE}`;

  // Use LLM to generate the Playwright test code
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: messageContent,
    },
  ];

  const response = await callAIWithStringResponse(prompt, modelConfig);

  if (response?.content && typeof response.content === 'string') {
    return response.content;
  }

  throw new Error('Failed to generate Playwright test code');
};

/**
 * Generates Playwright test code from recorded events with streaming support
 */
export const generatePlaywrightTestStream = async (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions & StreamingCodeGenerationOptions,
  modelConfig: IModelConfig,
): Promise<StreamingAIResponse> => {
  // Validate input
  validateEvents(events);

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
  const screenshots = getScreenshotsForLLM(events, options.maxScreenshots || 3);

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
8. can't wrap this test code in markdown code block

Important: Return ONLY the raw Playwright test code. Do NOT wrap the response in markdown code blocks (no \`\`\`typescript, \`\`\`javascript or \`\`\`). Start directly with the code content.`;

  // Create message content with screenshots
  const messageContent = createMessageContent(
    promptText,
    screenshots,
    options.includeScreenshots !== false,
  );

  // Create system prompt
  const systemPrompt = `You are an expert test automation engineer specializing in Playwright and Midscene. 
Your task is to generate a complete, executable Playwright test using @midscene/web/playwright that reproduces a recorded browser session.

${PLAYWRIGHT_EXAMPLE_CODE}`;

  // Use LLM to generate the Playwright test code with streaming
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: messageContent,
    },
  ];

  if (options.stream && options.onChunk) {
    // Use streaming
    return await callAI(prompt, modelConfig, {
      stream: true,
      onChunk: options.onChunk,
    });
  } else {
    // Fallback to non-streaming
    const response = await callAIWithStringResponse(prompt, modelConfig);

    if (response?.content && typeof response.content === 'string') {
      return {
        content: response.content,
        usage: response.usage,
        isStreamed: false,
      };
    }

    throw new Error('Failed to generate Playwright test code');
  }
};
