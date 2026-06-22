import type { RecorderYamlGenerationInput } from '@midscene/core/ai-model';
import { getPreferredLanguage } from '@midscene/shared/env';
import {
  DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  type MidsceneRecorderEvent,
} from '@midscene/shared/recorder';
import type { StudioRecordingSession } from './types';

export function toStudioRecorderCodegenEvents(
  events: MidsceneRecorderEvent[],
): MidsceneRecorderEvent[] {
  return events.map((event) => {
    const {
      target: _target,
      platformId: _platformId,
      rawPayload: _rawPayload,
      ...recorderEvent
    } = event as MidsceneRecorderEvent & {
      target?: unknown;
      platformId?: unknown;
    };
    return recorderEvent;
  });
}

export function toStudioRecorderCodegenInput(
  session: StudioRecordingSession,
  options: {
    language?: string;
    maxScreenshots?: number;
  } = {},
): RecorderYamlGenerationInput {
  return {
    target: session.target,
    events: toStudioRecorderCodegenEvents(session.events),
    testName: session.name,
    includeTimestamps: true,
    language: options.language || getPreferredLanguage(),
    maxScreenshots:
      options.maxScreenshots ??
      DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  };
}
