import { generatePlaywrightTest as coreGeneratePlaywrightTest } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from '../logger';
import { handleTestGenerationError } from './shared/testGenerationUtils';
import type { PlaywrightGenerationOptions } from './shared/types';

/**
 * Generates Playwright test code from recorded events
 * Uses the core package implementation with extension-specific logging
 */
export const generatePlaywrightTest = async (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions = {},
): Promise<string> => {
  try {
    recordLogger.info('Starting Playwright test generation', {
      eventsCount: events.length,
    });

    const result = await coreGeneratePlaywrightTest(events, options);

    recordLogger.success('Playwright test generated successfully', {
      eventsCount: events.length,
    });

    return result;
  } catch (error) {
    throw handleTestGenerationError(error, 'Playwright test', events.length);
  }
};
