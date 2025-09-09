import type {
  StreamingAIResponse,
  StreamingCodeGenerationOptions,
} from '@midscene/core';
import {
  generateYamlTest as generateYamlTestCore,
  generateYamlTestStream as generateYamlTestStreamCore,
} from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import type { IModelConfig } from '@midscene/shared/env';
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
  options: YamlGenerationOptions,
  modelConfig: IModelConfig,
): Promise<string> => {
  try {
    // Extract navigation and viewport information
    const navigationInfo = extractNavigationAndViewportInfo(events);

    recordLogger.info('Starting AI-powered YAML test generation', {
      eventsCount: events.length,
      events,
      navigationInfo,
    });

    // Merge navigation and viewport info into options
    const enhancedOptions = {
      ...options,
      navigationInfo,
    };

    const yamlContent = await generateYamlTestCore(
      events,
      enhancedOptions,
      modelConfig,
    );

    recordLogger.success('AI-powered YAML test generated successfully', {
      eventsCount: events.length,
      events,
      yamlContent,
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
  modelConfig: IModelConfig,
  options: YamlGenerationOptions = {},
): Promise<void> => {
  try {
    recordLogger.info('Exporting events to AI-generated YAML', {
      eventsCount: events.length,
    });

    const yamlContent = await generateYamlTest(
      events,
      {
        testName: sessionName,
        description: `Test session recorded on ${new Date().toLocaleDateString()}`,
        ...options,
      },
      modelConfig,
    );

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

/**
 * Generates YAML test configuration from recorded events using AI with streaming support
 * Uses the core package implementation
 */
export const generateYamlTestStream = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions & StreamingCodeGenerationOptions,
  modelConfig: IModelConfig,
): Promise<StreamingAIResponse> => {
  try {
    // Extract navigation and viewport information
    const navigationInfo = extractNavigationAndViewportInfo(events);

    recordLogger.info(
      'Starting AI-powered YAML test generation with streaming',
      {
        eventsCount: events.length,
        events,
        navigationInfo,
      },
    );

    // Merge navigation and viewport info into options
    const enhancedOptions = {
      ...options,
      navigationInfo,
    };

    const result = await generateYamlTestStreamCore(
      events,
      enhancedOptions,
      modelConfig,
    );

    recordLogger.success(
      'AI-powered YAML test generated successfully with streaming',
      {
        eventsCount: events.length,
        events,
        yamlContent: result.content,
      },
    );

    return result;
  } catch (error) {
    throw handleTestGenerationError(error, 'YAML test', events.length);
  }
};
