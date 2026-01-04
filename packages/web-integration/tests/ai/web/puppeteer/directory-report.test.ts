/**
 * Verify directory report format functionality test cases
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Directory Report Format', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should generate directory-based report with separate image files', async () => {
    const agent = new PuppeteerAgent(page, {
      useDirectoryReport: true,
      generateReport: true,
      groupName: 'Directory-Report-Test',
      autoPrintReportMsg: false,
    });

    // nav to test page
    await page.goto(
      'data:text/html,<html><body><h1>Test Page</h1><button>Click Me</button></body></html>',
    );

    // record multiple screenshots
    await agent.recordToReport('Initial-State', {
      content: 'Page loaded successfully',
    });

    await agent.recordToReport('After-Action', {
      content: 'Performed some action',
    });

    // verify report file generation
    expect(agent.reportFile).toBeTruthy();
    expect(agent.reportFile).toMatch(/index\.html$/);

    // verify directory structure
    const reportDir = path.dirname(agent.reportFile!);
    const screenshotsDir = path.join(reportDir, 'screenshots');

    expect(fs.existsSync(agent.reportFile!)).toBe(true);
    expect(fs.existsSync(screenshotsDir)).toBe(true);

    // verify screenshot files
    const screenshots = fs.readdirSync(screenshotsDir);
    expect(screenshots.length).toBeGreaterThan(0);
    expect(screenshots.every((file) => file.endsWith('.png'))).toBe(true);

    // verify HTML content contains relative paths
    const htmlContent = fs.readFileSync(agent.reportFile!, 'utf-8');
    expect(htmlContent).toContain('./screenshots/');

    await agent.destroy();
  });

  it('should use traditional format when useDirectoryReport is false', async () => {
    const agent = new PuppeteerAgent(page, {
      useDirectoryReport: false,
      generateReport: true,
      groupName: 'Traditional-Report-Test',
      autoPrintReportMsg: false,
    });

    await page.goto(
      'data:text/html,<html><body><h1>Traditional Test</h1></body></html>',
    );

    await agent.recordToReport('Traditional-Screenshot', {
      content: 'Traditional format test',
    });

    // verify single HTML file generation
    expect(agent.reportFile).toBeTruthy();
    expect(agent.reportFile).toMatch(/\.html$/);
    expect(agent.reportFile).not.toMatch(/index\.html$/);

    // verify it is a single file, not a directory
    const reportPath = agent.reportFile!;
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(fs.statSync(reportPath).isFile()).toBe(true);

    await agent.destroy();
  });

  it('should clear base64 from dump memory after report generation', async () => {
    const agent = new PuppeteerAgent(page, {
      useDirectoryReport: true,
      generateReport: true,
      groupName: 'Memory-Clear-Test',
      autoPrintReportMsg: false,
    });

    await page.goto(
      'data:text/html,<html><body><h1>Memory Test</h1></body></html>',
    );

    // take screenshot to capture base64
    const base64 = await page.screenshot({ encoding: 'base64' });
    expect(base64.length).toBeGreaterThan(100);

    // manually add base64 to dump to verify it exists before processing
    const testExecution = {
      logTime: Date.now(),
      name: 'Test-Execution',
      description: 'test',
      tasks: [
        {
          type: 'Log' as const,
          subType: 'Screenshot' as const,
          status: 'finished' as const,
          recorder: [
            {
              type: 'screenshot' as const,
              ts: Date.now(),
              screenshot: `data:image/png;base64,${base64}`,
            },
          ],
          timing: { start: Date.now(), end: Date.now(), cost: 0 },
          param: { content: '' },
          executor: async () => {},
        },
      ],
    };
    agent.appendExecutionDump(testExecution);

    // verify base64 exists in dump before report generation
    const dumpBeforeReport = JSON.stringify(agent.dump);
    expect(dumpBeforeReport.includes('data:image/')).toBe(true);

    // trigger report generation which should clear base64
    agent.writeOutActionDumps();

    // verify report was generated
    expect(agent.reportFile).toBeTruthy();

    // check dump memory for base64 strings - should be cleared
    const dumpAfterReport = JSON.stringify(agent.dump);
    expect(dumpAfterReport.includes('data:image/')).toBe(false);

    await agent.destroy();
  });

  it('should clear base64 from dump memory when useDirectoryReport is false', async () => {
    const agent = new PuppeteerAgent(page, {
      useDirectoryReport: false,
      generateReport: true,
      groupName: 'Memory-Clear-Traditional',
      autoPrintReportMsg: false,
    });

    await page.goto(
      'data:text/html,<html><body><h1>Memory Test Traditional</h1></body></html>',
    );

    // take screenshot to capture base64
    const base64 = await page.screenshot({ encoding: 'base64' });
    expect(base64.length).toBeGreaterThan(100);

    // manually add base64 to dump to verify it exists before processing
    const testExecution = {
      logTime: Date.now(),
      name: 'Test-Execution',
      description: 'test',
      tasks: [
        {
          type: 'Log' as const,
          subType: 'Screenshot' as const,
          status: 'finished' as const,
          recorder: [
            {
              type: 'screenshot' as const,
              ts: Date.now(),
              screenshot: `data:image/png;base64,${base64}`,
            },
          ],
          timing: { start: Date.now(), end: Date.now(), cost: 0 },
          param: { content: '' },
          executor: async () => {},
        },
      ],
    };
    agent.appendExecutionDump(testExecution);

    // verify base64 exists in dump before report generation
    const dumpBeforeReport = JSON.stringify(agent.dump);
    expect(dumpBeforeReport.includes('data:image/')).toBe(true);

    // trigger report generation which should clear base64
    agent.writeOutActionDumps();

    // verify report was generated
    expect(agent.reportFile).toBeTruthy();

    // check dump memory for base64 strings - should be cleared
    const dumpAfterReport = JSON.stringify(agent.dump);
    expect(dumpAfterReport.includes('data:image/')).toBe(false);

    await agent.destroy();
  });
});
