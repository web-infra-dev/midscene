import { createMidsceneRecorderMarkdownScreenshotAssets } from '@midscene/shared/recorder';
import type { PrepareRecorderMarkdownReplayRequest } from '@shared/electron-contract';
import type { StudioRecordingSession } from './types';

export function createRecorderMarkdownReplayRequest(
  session: StudioRecordingSession,
): PrepareRecorderMarkdownReplayRequest {
  const markdown = session.generatedCode?.markdown;
  if (!markdown) {
    throw new Error('Generate Markdown before replay.');
  }

  const screenshots = createMidsceneRecorderMarkdownScreenshotAssets(
    session.events,
    { baseDir: './screenshots' },
  ).map((asset) => ({
    relativePath: asset.relativePath,
    base64Data: asset.base64Data,
  }));

  return {
    markdown,
    screenshots,
  };
}

export function getRecorderYamlReplayContent(
  session: StudioRecordingSession,
): string {
  const yaml = session.generatedCode?.yaml;
  if (!yaml) {
    throw new Error('Generate YAML before replay.');
  }
  return yaml;
}
