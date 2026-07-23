import { describe, expect, it } from 'vitest';
import {
  generateEventsMarkdownTable,
  recorderScreenshotAsset,
} from '../src/extension/recorder/screenshot-export';
import type { RecordingSession } from '../src/store';

const webpBody =
  'UklGRioAAABXRUJQVlA4IB4AAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+hNQAAAA=';
const pngBody =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Chrome recorder screenshot export', () => {
  it('derives the exported extension and MIME type from the image bytes', () => {
    expect(
      recorderScreenshotAsset(`data:image/png;base64,${webpBody}`),
    ).toEqual({
      body: webpBody,
      extension: 'webp',
      mimeType: 'image/webp',
    });
    expect(recorderScreenshotAsset(`data:image/png;base64,${pngBody}`)).toEqual(
      {
        body: pngBody,
        extension: 'png',
        mimeType: 'image/png',
      },
    );
  });

  it('uses each screenshot actual extension in the Markdown table', () => {
    const sessions = [
      {
        id: 'session-1',
        name: 'WebP export',
        createdAt: 1,
        updatedAt: 1,
        status: 'completed',
        events: [
          {
            type: 'click',
            timestamp: 1,
            hashId: 'event-1',
            screenshotBefore: `data:image/webp;base64,${webpBody}`,
            screenshotAfter: `data:image/png;base64,${pngBody}`,
          },
        ],
      },
    ] as RecordingSession[];

    const markdown = generateEventsMarkdownTable(sessions);

    expect(markdown).toContain('![](./images/screenshot_0_0_before.webp)');
    expect(markdown).toContain('![](./images/screenshot_0_0_after.png)');
    expect(markdown).not.toContain('screenshot_0_0_before.png');
  });
});
