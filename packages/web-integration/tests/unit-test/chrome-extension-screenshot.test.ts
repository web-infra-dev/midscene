import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  ExecutionDump,
  ReportGenerator,
  ScreenshotItem,
  parseImageScripts,
  reportFileToMarkdown,
} from '@midscene/core';
import { describe, expect, it, vi } from 'vitest';
import { captureChromeExtensionScreenshot } from '../../src/chrome-extension/screenshot';
import { launchPage } from '../ai/web/puppeteer/utils';

describe('Chrome extension screenshot format', () => {
  it('captures WebP at quality 90 by default', async () => {
    const sendCaptureCommand = vi
      .fn()
      .mockResolvedValue({ data: 'SCREENSHOT_BASE64' });

    await expect(
      captureChromeExtensionScreenshot(sendCaptureCommand),
    ).resolves.toBe('data:image/webp;base64,SCREENSHOT_BASE64');
    expect(sendCaptureCommand).toHaveBeenCalledWith({
      format: 'webp',
      quality: 90,
    });
  });

  it('allows an explicit JPEG fallback', async () => {
    const sendCaptureCommand = vi
      .fn()
      .mockResolvedValue({ data: 'SCREENSHOT_BASE64' });

    await expect(
      captureChromeExtensionScreenshot(sendCaptureCommand, 'jpeg'),
    ).resolves.toBe('data:image/jpeg;base64,SCREENSHOT_BASE64');
    expect(sendCaptureCommand).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 90,
    });
  });

  it('keeps a real CDP WebP capture intact through report and Markdown export', async () => {
    const tmpDir = mkdtempSync(
      join(tmpdir(), 'midscene-chrome-extension-webp-'),
    );

    try {
      const pageHtml = `<!doctype html>
        <html>
          <body style="margin: 0; background: #f4efe6">
            <main style="width: 100vw; height: 100vh; display: grid; place-items: center">
              <div style="padding: 24px; background: #2463eb; color: white">WebP report fixture</div>
            </main>
          </body>
        </html>`;
      const { originPage, reset } = await launchPage(
        `data:text/html,${encodeURIComponent(pageHtml)}`,
        {
          viewport: {
            width: 320,
            height: 180,
            deviceScaleFactor: 1,
          },
        },
      );

      try {
        const cdpSession = await originPage.createCDPSession();

        try {
          const screenshotBase64 = await captureChromeExtensionScreenshot(
            (params) => cdpSession.send('Page.captureScreenshot', params),
          );
          const screenshotBytes = Buffer.from(
            screenshotBase64.split(',')[1],
            'base64',
          );

          expect(screenshotBase64).toMatch(/^data:image\/webp;base64,/);
          expect(screenshotBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
          expect(screenshotBytes.subarray(8, 12).toString('ascii')).toBe(
            'WEBP',
          );

          const capturedAt = Date.now();
          const screenshot = ScreenshotItem.create(
            screenshotBase64,
            capturedAt,
          );
          const execution = new ExecutionDump({
            id: 'chrome-extension-webp-report',
            logTime: capturedAt,
            name: 'Chrome extension WebP report',
            tasks: [
              {
                taskId: 'capture-webp',
                type: 'Insight',
                subType: 'Locate',
                param: { prompt: 'Capture the fixture page' },
                uiContext: {
                  screenshot,
                  shotSize: { width: 320, height: 180 },
                  shrunkShotToLogicalRatio: 1,
                },
                executor: async () => undefined,
                recorder: [],
                status: 'finished',
              },
            ],
          });
          const reportPath = join(tmpDir, 'chrome-extension-webp.html');
          const reportGenerator = new ReportGenerator({
            reportPath,
            screenshotMode: 'inline',
            autoPrint: false,
          });

          reportGenerator.onExecutionUpdate(execution, {
            groupName: 'Chrome extension WebP integration test',
            sdkVersion: 'test',
            modelBriefs: [],
          });
          await expect(reportGenerator.finalize()).resolves.toBe(reportPath);

          const reportHtml = readFileSync(reportPath, 'utf-8');
          expect(parseImageScripts(reportHtml)[screenshot.id]).toBe(
            screenshotBase64,
          );
          expect(reportHtml).toContain('"mimeType":"image/webp"');

          const markdownDir = join(tmpDir, 'markdown');
          const markdownResult = await reportFileToMarkdown({
            htmlPath: reportPath,
            outputDir: markdownDir,
          });

          expect(markdownResult.screenshotFiles).toHaveLength(1);
          const [exportedScreenshotPath] = markdownResult.screenshotFiles;
          expect(exportedScreenshotPath).toMatch(/\.webp$/);
          expect(readFileSync(exportedScreenshotPath)).toEqual(screenshotBytes);
          expect(
            readFileSync(join(markdownDir, 'report.md'), 'utf-8'),
          ).toContain(`./screenshots/${basename(exportedScreenshotPath)}`);
        } finally {
          await cdpSession.detach();
        }
      } finally {
        await reset();
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
