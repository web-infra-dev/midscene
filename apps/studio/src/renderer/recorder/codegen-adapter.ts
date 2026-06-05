import type { RecorderYamlGenerationInput } from '@midscene/core/ai-model';
import { getPreferredLanguage } from '@midscene/shared/env';
import type { StudioRecordingSession } from './types';

export function toStudioRecorderCodegenInput(
  session: StudioRecordingSession,
  options: {
    language?: string;
  } = {},
): RecorderYamlGenerationInput {
  return {
    target: session.target,
    events: session.events,
    testName: session.name,
    includeTimestamps: true,
    language: options.language || getPreferredLanguage(),
    maxScreenshots: 5,
  };
}
