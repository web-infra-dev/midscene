import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { collectStoredReportImages } from '../scripts/extract-test-data-utils';

describe('collectStoredReportImages', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it('should include screenshot and WebP prompt image assets in a fixture', () => {
    const screenshot = 'data:image/png;base64,dGVzdC1zY3JlZW5zaG90';
    const promptImage = 'data:image/webp;base64,dGVzdC13ZWJw';
    const result = collectStoredReportImages(
      {
        executions: [
          {
            tasks: [
              {
                param: {
                  images: [
                    {
                      name: 'reference',
                      url: {
                        type: 'midscene_image_url_ref',
                        id: 'prompt-webp',
                        mimeType: 'image/webp',
                        storage: 'inline',
                      },
                    },
                  ],
                },
                recorder: [
                  {
                    screenshot: {
                      type: 'midscene_screenshot_ref',
                      id: 'task-screenshot',
                      capturedAt: 1787630400000,
                      mimeType: 'image/png',
                      storage: 'inline',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        reportPath: '/unused/report.html',
        inlineImages: {
          'prompt-webp': promptImage,
          'task-screenshot': screenshot,
        },
      },
    );

    expect(result).toEqual({
      'prompt-webp': promptImage,
      'task-screenshot': screenshot,
    });
  });

  it('should resolve a prompt image file using its MIME extension', () => {
    const reportDirectory = mkdtempSync(join(tmpdir(), 'midscene-fixture-'));
    temporaryDirectories.push(reportDirectory);
    const reportPath = join(reportDirectory, 'report.html');
    const screenshotsDirectory = join(reportDirectory, 'screenshots');
    const imageBytes = Buffer.from('test-webp-file');
    mkdirSync(screenshotsDirectory);
    writeFileSync(reportPath, '<html></html>');
    writeFileSync(join(screenshotsDirectory, 'prompt-webp.webp'), imageBytes);

    const result = collectStoredReportImages(
      {
        type: 'midscene_image_url_ref',
        id: 'prompt-webp',
        mimeType: 'image/webp',
        storage: 'inline',
      },
      { reportPath, inlineImages: {} },
    );

    expect(result).toEqual({
      'prompt-webp': `data:image/webp;base64,${imageBytes.toString('base64')}`,
    });
  });
});
