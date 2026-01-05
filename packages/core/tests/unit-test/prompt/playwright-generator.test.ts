import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { callAIWithStringResponse } from '../../../src/ai-model';
import {
  type ChromeRecordedEvent,
  type PlaywrightGenerationOptions,
  createEventCounts,
  createMessageContent,
  extractInputDescriptions,
  filterEventsByType,
  generatePlaywrightTest,
  getScreenshotsForLLM,
  prepareEventSummary,
  processEventsForLLM,
  validateEvents,
} from '../../../src/ai-model/prompt/playwright-generator';

// Mock the callAi function
vi.mock('../../../src/ai-model', () => ({
  callAIWithStringResponse: vi.fn(),
}));

const mockCallAiWithStringResponse = vi.mocked(callAIWithStringResponse);

describe('playwright-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEvents: ChromeRecordedEvent[] = [
    {
      type: 'navigation',
      timestamp: 1000,
      url: 'https://example.com',
      title: 'Example Page',
      screenshotBefore: 'data:image/png;base64,screenshot1',
    },
    {
      type: 'click',
      timestamp: 2000,
      elementDescription: 'Login button',
      screenshotWithBox: 'data:image/png;base64,screenshot2',
    },
    {
      type: 'input',
      timestamp: 3000,
      elementDescription: 'Username field',
      value: 'testuser',
      screenshotAfter: 'data:image/png;base64,screenshot3',
    },
    {
      type: 'scroll',
      timestamp: 4000,
    },
  ];

  describe('getScreenshotsForLLM', () => {
    test('should extract screenshots prioritizing navigation and click events', () => {
      const screenshots = getScreenshotsForLLM(mockEvents, 2);

      expect(screenshots).toHaveLength(2);
      expect(screenshots[0]).toBe('data:image/png;base64,screenshot1'); // navigation event
      expect(screenshots[1]).toBe('data:image/png;base64,screenshot2'); // click event with box
    });

    test('should respect maxScreenshots limit', () => {
      const screenshots = getScreenshotsForLLM(mockEvents, 1);

      expect(screenshots).toHaveLength(1);
      expect(screenshots[0]).toBe('data:image/png;base64,screenshot1');
    });

    test('should prefer screenshotWithBox over others', () => {
      const eventsWithBox: ChromeRecordedEvent[] = [
        {
          type: 'click',
          timestamp: 1000,
          screenshotBefore: 'data:image/png;base64,before',
          screenshotAfter: 'data:image/png;base64,after',
          screenshotWithBox: 'data:image/png;base64,withbox',
        },
      ];

      const screenshots = getScreenshotsForLLM(eventsWithBox, 1);
      expect(screenshots[0]).toBe('data:image/png;base64,withbox');
    });
  });

  describe('filterEventsByType', () => {
    test('should correctly categorize events by type', () => {
      const filtered = filterEventsByType(mockEvents);

      expect(filtered.navigationEvents).toHaveLength(1);
      expect(filtered.clickEvents).toHaveLength(1);
      expect(filtered.inputEvents).toHaveLength(1);
      expect(filtered.scrollEvents).toHaveLength(1);

      expect(filtered.navigationEvents[0].type).toBe('navigation');
      expect(filtered.clickEvents[0].type).toBe('click');
      expect(filtered.inputEvents[0].type).toBe('input');
      expect(filtered.scrollEvents[0].type).toBe('scroll');
    });
  });

  describe('createEventCounts', () => {
    test('should create accurate event counts', () => {
      const filtered = filterEventsByType(mockEvents);
      const counts = createEventCounts(filtered, mockEvents.length);

      expect(counts).toEqual({
        navigation: 1,
        click: 1,
        input: 1,
        scroll: 1,
        total: 4,
      });
    });
  });

  describe('extractInputDescriptions', () => {
    test('should extract input descriptions with values', () => {
      const inputDescriptions = extractInputDescriptions(mockEvents);

      expect(inputDescriptions).toHaveLength(1);
      expect(inputDescriptions[0]).toEqual({
        description: 'Username field',
        value: 'testuser',
      });
    });

    test('should filter out events without description or value', () => {
      const eventsWithEmptyInputs: ChromeRecordedEvent[] = [
        {
          type: 'input',
          timestamp: 1000,
          elementDescription: '',
          value: 'test',
        },
        {
          type: 'input',
          timestamp: 2000,
          elementDescription: 'Field',
          value: '',
        },
        {
          type: 'input',
          timestamp: 3000,
          elementDescription: 'Valid field',
          value: 'valid value',
        },
      ];

      const inputDescriptions = extractInputDescriptions(eventsWithEmptyInputs);
      expect(inputDescriptions).toHaveLength(1);
      expect(inputDescriptions[0].description).toBe('Valid field');
    });
  });

  describe('processEventsForLLM', () => {
    test('should extract relevant event data for LLM processing', () => {
      const processed = processEventsForLLM(mockEvents);

      expect(processed).toHaveLength(4);
      expect(processed[0]).toEqual({
        type: 'navigation',
        timestamp: 1000,
        url: 'https://example.com',
        title: 'Example Page',
        elementDescription: undefined,
        value: undefined,
        pageInfo: undefined,
        elementRect: undefined,
      });
    });
  });

  describe('prepareEventSummary', () => {
    test('should create comprehensive event summary', () => {
      const summary = prepareEventSummary(mockEvents, {
        testName: 'Custom Test Name',
      });

      expect(summary.testName).toBe('Custom Test Name');
      expect(summary.startUrl).toBe('https://example.com');
      expect(summary.eventCounts.total).toBe(4);
      expect(summary.events).toHaveLength(4);
      expect(summary.events[0].title).toBe('Example Page');
      expect(summary.clickDescriptions).toContain('Login button');
      expect(summary.inputDescriptions).toHaveLength(1);
      expect(summary.urls).toContain('https://example.com');
    });

    test('should use default test name when not provided', () => {
      const summary = prepareEventSummary(mockEvents);
      expect(summary.testName).toBe('Automated test from recorded events');
    });
  });

  describe('createMessageContent', () => {
    test('should create message content with text only', () => {
      const content = createMessageContent('Test prompt', [], false);

      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({
        type: 'text',
        text: 'Test prompt',
      });
    });

    test('should include screenshots when provided', () => {
      const screenshots = ['data:image/png;base64,screenshot1'];
      const content = createMessageContent('Test prompt', screenshots, true);

      expect(content).toHaveLength(3); // intro text, prompt text, image
      expect(content[0]).toEqual({
        type: 'text',
        text: 'Here are screenshots from the recording session to help you understand the context:',
      });
      expect(content[1]).toEqual({
        type: 'text',
        text: 'Test prompt',
      });
      expect(content[2]).toEqual({
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,screenshot1',
        },
      });
    });
  });

  describe('validateEvents', () => {
    test('should not throw for valid events', () => {
      expect(() => validateEvents(mockEvents)).not.toThrow();
    });

    test('should throw for empty events array', () => {
      expect(() => validateEvents([])).toThrow(
        'No events provided for test generation',
      );
    });
  });

  describe('generatePlaywrightTest', () => {
    const mockPlaywrightCode = `import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture({
  waitForNetworkIdleTimeout: 2000,
}));

test.beforeEach(async ({ page }) => {
  await page.goto('https://example.com');
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('Generated test', async ({ aiInput, aiAssert, aiTap, page }) => {
  await aiAssert('The page shows the login interface');
  await aiInput('testuser', 'in username field');
  await aiTap('click login button');
});`;

    beforeEach(() => {
      mockCallAiWithStringResponse.mockResolvedValue({
        content: mockPlaywrightCode,
        usage: undefined,
      });
    });

    const mockedModelConfig = {
      modelName: 'mock',
      modelDescription: 'mock',
      intent: 'default',
      from: 'modelConfig',
    } as const satisfies IModelConfig;

    test('should generate Playwright test successfully', async () => {
      const result = await generatePlaywrightTest(
        mockEvents,
        {},
        mockedModelConfig,
      );

      expect(result).toBe(mockPlaywrightCode);
      expect(mockCallAiWithStringResponse).toHaveBeenCalledTimes(1);
      expect(mockCallAiWithStringResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'You are an expert test automation engineer',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.any(Array),
          }),
        ]),
        mockedModelConfig,
      );
    });

    test('should handle custom options', async () => {
      const options: PlaywrightGenerationOptions = {
        testName: 'Custom Login Test',
        viewportSize: { width: 1920, height: 1080 },
        waitForNetworkIdle: false,
        waitForNetworkIdleTimeout: 5000,
        maxScreenshots: 2,
      };

      await generatePlaywrightTest(mockEvents, options, mockedModelConfig);

      const callArgs = mockCallAiWithStringResponse.mock.calls[0];
      const userMessage = callArgs[0][1];
      const messageContent = userMessage.content as any[];

      // Find the main prompt text (not the intro text about screenshots)
      const textMessages = messageContent.filter((msg) => msg.type === 'text');
      const promptText = textMessages.find((msg) =>
        msg.text?.includes('Event Summary:'),
      )?.text;

      expect(promptText).toBeDefined();
      expect(promptText!).toContain('Custom Login Test');
      expect(promptText!).toContain('"width": 1920');
      expect(promptText!).toContain('"height": 1080');
      expect(promptText!).toContain('"waitForNetworkIdle": false');
      expect(promptText!).toContain('"waitForNetworkIdleTimeout": 5000');
    });

    test('should include screenshots when available', async () => {
      const options: PlaywrightGenerationOptions = {
        includeScreenshots: true,
        maxScreenshots: 2,
      };

      await generatePlaywrightTest(mockEvents, options, mockedModelConfig);

      const callArgs = mockCallAiWithStringResponse.mock.calls[0];
      const userMessage = callArgs[0][1];
      const messageContent = userMessage.content as any[];

      const imageMessages = messageContent.filter(
        (msg) => msg.type === 'image_url',
      );
      expect(imageMessages).toHaveLength(2);
    });

    test('should throw error for empty events', async () => {
      await expect(
        generatePlaywrightTest([], {}, mockedModelConfig),
      ).rejects.toThrow('No events provided for test generation');
    });

    test('should handle AI call failure', async () => {
      mockCallAiWithStringResponse.mockRejectedValue(
        new Error('AI service unavailable'),
      );

      await expect(
        generatePlaywrightTest(mockEvents, {}, mockedModelConfig),
      ).rejects.toThrow('AI service unavailable');
    });
  });
});
