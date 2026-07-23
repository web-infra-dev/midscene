import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { reportFileToMarkdown } from '@midscene/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

const FIXTURES_DIR = join(__dirname, '../../fixtures');
const REPORT_NAME =
  process.env.MIDSCENE_WEBP_REPORT_NAME || 'webp-model-input-validation';

vi.setConfig({
  testTimeout: 180 * 1000,
});

describe('WebP model input report', () => {
  let reset: (() => Promise<void>) | undefined;
  let agent: PuppeteerAgent | undefined;

  afterEach(async () => {
    if (agent) {
      await agent.destroy();
    }
    await reset?.();
  });

  it('keeps the exact WebP model input in HTML and Markdown reports', async () => {
    const launched = await launchPage(
      `file://${join(FIXTURES_DIR, 'search-engine.html')}`,
      { viewport: { width: 1120, height: 700 } },
    );
    reset = launched.reset;
    agent = new PuppeteerAgent(launched.originPage, {
      generateReport: true,
      reportFileName: REPORT_NAME,
    });

    const captured = await agent.interface.screenshotBase64();
    expect(captured).toMatch(/^data:image\/webp;base64,UklGR/);

    await agent.aiAssert('A search input box and a search button are visible');
    await agent.destroy();
    const reportFile = agent.reportFile;
    agent = undefined;

    expect(reportFile).toBeTruthy();
    expect(existsSync(reportFile!)).toBe(true);

    const markdownDir = join(dirname(reportFile!), `${REPORT_NAME}-markdown`);
    rmSync(markdownDir, { recursive: true, force: true });
    const markdownResult = await reportFileToMarkdown({
      htmlPath: reportFile!,
      outputDir: markdownDir,
    });
    const markdown = readFileSync(markdownResult.markdownFiles[0], 'utf8');
    expect(markdown).not.toContain('No model metadata recorded.');
    expect(markdown).not.toContain('No token usage recorded.');
    expect(markdown).toContain('timing=model-input');

    const modelInputHash = markdown.match(
      /Model input \d+ \(exact bytes, sha256: ([a-f0-9]{64})\)/,
    )?.[1];
    expect(modelInputHash).toBeTruthy();
    expect(markdownResult.screenshotFiles.length).toBeGreaterThan(0);
    expect(
      markdownResult.screenshotFiles.every((file) => file.endsWith('.webp')),
    ).toBe(true);

    const screenshots = markdownResult.screenshotFiles.map((file) => {
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      return {
        file: basename(file),
        bytes: statSync(file).size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    expect(screenshots.some((item) => item.sha256 === modelInputHash)).toBe(
      true,
    );

    const manifestFile = join(markdownDir, 'validation-manifest.json');
    writeFileSync(
      manifestFile,
      `${JSON.stringify(
        {
          reportFile,
          markdownFile: markdownResult.markdownFiles[0],
          modelInputHash,
          screenshots,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    console.log(`WebP validation report: ${reportFile}`);
    console.log(`WebP validation manifest: ${manifestFile}`);
  });
});
