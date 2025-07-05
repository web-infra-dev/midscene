// import { generatePlaywrightTest as coreGeneratePlaywrightTest } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/recorder';

// Note: Streaming support will be added once the core package exports are updated
import { generatePlaywrightTestStream as coreGeneratePlaywrightTestStream } from '@midscene/core/ai-model';
import type { StreamingCodeGenerationOptions, StreamingAIResponse } from '@midscene/core';
import { recordLogger } from '../logger';
import { handleTestGenerationError } from './shared/testGenerationUtils';

/**
 * Extracts navigation and viewport information from events
 */
export const extractNavigationAndViewportInfo = (
  events: ChromeRecordedEvent[],
) => {
  const navigationEvents = events.filter(
    (event) => event.type === 'navigation',
  );
  const allViewportSizes = events
    .map((event) => event.pageInfo)
    .filter(Boolean);

  return {
    urls: navigationEvents.map((event) => event.url).filter(Boolean),
    titles: navigationEvents.map((event) => event.title).filter(Boolean),
    initialViewport: allViewportSizes[0],
  };
};

/**
 * Generates Playwright test code from recorded events
 * Uses the core package implementation with extension-specific logging
 */
// export const generatePlaywrightTest = async (
//   events: ChromeRecordedEvent[],
// ): Promise<string> => {
//   try {
//     recordLogger.info('Starting Playwright test generation', {
//       eventsCount: events.length,
//     });

//     // Extract navigation and viewport information
//     const navigationInfo = extractNavigationAndViewportInfo(events);

//     recordLogger.info('Navigation and viewport info extracted', {
//       eventsCount: events.length,
//     });

//     // Merge navigation and viewport info into options
//     const enhancedOptions = {
//       navigationInfo,
//       // Set initial viewport if not already specified
//       viewportSize: navigationInfo.initialViewport,
//     };

//     const result = await coreGeneratePlaywrightTest(events, enhancedOptions);

//     recordLogger.success('Playwright test generated successfully', {
//       eventsCount: events.length,
//     });

//     return result;
//   } catch (error) {
//     throw handleTestGenerationError(error, 'Playwright test', events.length);
//   }
// };

// TODO: Add streaming support once core package exports are updated
export const generatePlaywrightTestStream = async (
  events: ChromeRecordedEvent[],
  options: StreamingCodeGenerationOptions = {},
): Promise<StreamingAIResponse> => {
  try {
    recordLogger.info('Starting streaming Playwright test generation', {
      eventsCount: events.length,
    });

    // Extract navigation and viewport information
    const navigationInfo = extractNavigationAndViewportInfo(events);

    recordLogger.info('Navigation and viewport info extracted', {
      eventsCount: events.length,
    });

    // Merge navigation and viewport info into options
    const enhancedOptions = {
      ...options,
      navigationInfo,
      // Set initial viewport if not already specified
      viewportSize: navigationInfo.initialViewport,
    };

    const result = await coreGeneratePlaywrightTestStream(events, enhancedOptions);

    recordLogger.success('Streaming Playwright test generated successfully', {
      eventsCount: events.length,
    });

    return result;
  } catch (error) {
    throw handleTestGenerationError(error, 'Playwright test', events.length);
  }
};
