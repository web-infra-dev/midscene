import { generateYamlTest as generateYamlTestCore } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from '../logger';
import { extractNavigationAndViewportInfo } from './playwrightGenerator';
import { handleTestGenerationError } from './shared/testGenerationUtils';
import type { YamlGenerationOptions } from './shared/types';

/**
 * Generates YAML test configuration from recorded events using AI
 * Uses the core package implementation
 */
export const generateYamlTest = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions = {},
): Promise<string> => {
  try {
    recordLogger.info('Starting AI-powered YAML test generation', {
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
    };

    const yamlContent = await generateYamlTestCore(events, enhancedOptions);

    recordLogger.success('AI-powered YAML test generated successfully', {
      eventsCount: events.length,
    });

    return yamlContent;
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
