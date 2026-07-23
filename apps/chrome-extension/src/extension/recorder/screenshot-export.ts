import {
  type ScreenshotImageFormat,
  type ScreenshotImageMimeType,
  inferScreenshotImageFormatFromBase64,
  screenshotImageExtension,
  screenshotImageMimeType,
} from '@midscene/shared/img/image-format';
import type { RecordingSession } from '../../store';

export interface RecorderScreenshotAsset {
  body: string;
  extension: ScreenshotImageFormat;
  mimeType: ScreenshotImageMimeType;
}

export const recorderScreenshotAsset = (
  screenshotBase64: string,
): RecorderScreenshotAsset => {
  const separator = ';base64,';
  const separatorIndex = screenshotBase64.indexOf(separator);
  const body = (
    separatorIndex === -1
      ? screenshotBase64
      : screenshotBase64.slice(separatorIndex + separator.length)
  ).replace(/\s/g, '');
  const format = inferScreenshotImageFormatFromBase64(body);
  if (!format) {
    throw new Error('Unsupported recorder screenshot image format');
  }

  return {
    body,
    extension: screenshotImageExtension(format),
    mimeType: screenshotImageMimeType(format),
  };
};

export const generateEventsMarkdownTable = (
  sessions: RecordingSession[],
): string => {
  let markdown = '# Test Events Report\n\n';

  sessions.forEach((session, sessionIndex) => {
    if (session.events.length === 0) return;

    markdown += `## ${session.name}\n\n`;
    if (session.description) {
      markdown += `**Description:** ${session.description}\n\n`;
    }
    markdown += `**Created:** ${new Date(session.createdAt).toLocaleString()}\n\n`;

    markdown += '| Page | Screenshot Before | Screenshot After | Action |\n';
    markdown += '|------|------------|------------|--------|\n';

    session.events.forEach((event, eventIndex) => {
      const page = event.title || event.url || '';
      const screenshotBefore = event.screenshotBefore
        ? `![](./images/screenshot_${sessionIndex}_${eventIndex}_before.${recorderScreenshotAsset(event.screenshotBefore).extension})`
        : 'N/A';
      const screenshotAfter = event.screenshotAfter
        ? `![](./images/screenshot_${sessionIndex}_${eventIndex}_after.${recorderScreenshotAsset(event.screenshotAfter).extension})`
        : 'N/A';
      let action = '';
      switch (event.type) {
        case 'click':
          action = `Click on ${event.elementDescription || 'element'}`;
          break;
        case 'input':
          action = `Input "${event.value}" into ${event.elementDescription || 'field'}`;
          break;
        case 'navigation':
          action = `Navigate to ${event.url}`;
          break;
        default:
          action = `${event.type} on ${event.elementDescription || 'element'}`;
      }

      markdown += `| ${page} | ${screenshotBefore} | ${screenshotAfter} | ${action} |\n`;
    });

    if (session.generatedCode?.yaml || session.generatedCode?.playwright) {
      markdown += '## Generated Code\n\n';
      if (session.generatedCode?.yaml) {
        markdown += '### YAML\n\n';
        markdown += `\`\`\`yaml\n${session.generatedCode.yaml}\n\`\`\`\n\n`;
      }
      if (session.generatedCode?.playwright) {
        markdown += '### Playwright\n\n';
        markdown += `\`\`\`playwright\n${session.generatedCode.playwright}\n\`\`\`\n\n`;
      }
    }

    markdown += '\n\n\n';
  });

  return markdown;
};
