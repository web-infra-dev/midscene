/**
 * Verify directory report format and Screenshot Registry functionality test cases
 *
 * These tests validate:
 * - Directory-based report generation with separate image files
 * - Screenshot Registry integration for memory optimization
 * - Image reference format (#midscene-img:xxx) in dump data
 * - Both traditional single-file and directory-based report formats
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Constants matching the implementation
// Screenshots are serialized as { $screenshot: "uuid" } format
const SCREENSHOT_REF_KEY = '$screenshot';

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

  describe('Directory-based report generation', () => {
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

      // write report before verifying
      await agent.writeOutActionDumps();

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
  });

  describe('Traditional report format', () => {
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

      // write report before verifying
      await agent.writeOutActionDumps();

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
  });

  describe('Screenshot Registry integration', () => {
    it('should use image references in dump instead of raw base64', async () => {
      const agent = new PuppeteerAgent(page, {
        useDirectoryReport: true,
        generateReport: false, // only checking dump content, no report needed
        groupName: 'Registry-Test',
        autoPrintReportMsg: false,
      });

      await page.goto(
        'data:text/html,<html><body><h1>Registry Test</h1></body></html>',
      );

      // record a screenshot which should use the registry
      await agent.recordToReport('Test-Screenshot', {
        content: 'Testing registry references',
      });

      // get dump string and verify it contains references, not raw base64
      const dumpString = agent.dumpDataString();

      // should contain screenshot references in the format { $screenshot: "uuid" }
      expect(dumpString).toContain(SCREENSHOT_REF_KEY);

      // should NOT contain raw base64 data URIs
      expect(dumpString).not.toMatch(
        /data:image\/png;base64,[A-Za-z0-9+/]{100,}/,
      );

      await agent.destroy();
    });

    it('should generate valid image script tags in traditional report', async () => {
      const agent = new PuppeteerAgent(page, {
        useDirectoryReport: false,
        generateReport: true,
        groupName: 'Script-Tag-Test',
        autoPrintReportMsg: false,
      });

      await page.goto(
        'data:text/html,<html><body><h1>Script Tag Test</h1></body></html>',
      );

      await agent.recordToReport('Test-Screenshot', {
        content: 'Testing script tag generation',
      });

      // trigger report write
      await agent.writeOutActionDumps();

      // verify report was generated
      expect(agent.reportFile).toBeTruthy();

      // read the report content
      const htmlContent = fs.readFileSync(agent.reportFile!, 'utf-8');

      // should contain midscene-image script tags with the image data
      expect(htmlContent).toContain('type="midscene-image"');
      expect(htmlContent).toContain('data-id="');

      // should contain the dump script tag with references
      expect(htmlContent).toContain('type="midscene_web_dump"');

      await agent.destroy();
    });

    it('should properly clean up registry on agent destroy', async () => {
      const agent = new PuppeteerAgent(page, {
        useDirectoryReport: true,
        generateReport: true,
        groupName: 'Cleanup-Test',
        autoPrintReportMsg: false,
      });

      await page.goto(
        'data:text/html,<html><body><h1>Cleanup Test</h1></body></html>',
      );

      await agent.recordToReport('Test-Screenshot', {
        content: 'Testing cleanup',
      });

      // write report before verifying and destroying
      await agent.writeOutActionDumps();

      // verify report file exists before destroy
      expect(agent.reportFile).toBeTruthy();
      expect(fs.existsSync(agent.reportFile!)).toBe(true);

      // destroy should not throw and should clean up registry
      await expect(agent.destroy()).resolves.not.toThrow();
    });

    it('should handle multiple screenshots with incremental IDs', async () => {
      const agent = new PuppeteerAgent(page, {
        useDirectoryReport: false,
        generateReport: true,
        groupName: 'Multi-Screenshot-Test',
        autoPrintReportMsg: false,
      });

      await page.goto(
        'data:text/html,<html><body><h1>Multiple Screenshots</h1></body></html>',
      );

      // record multiple screenshots
      await agent.recordToReport('Screenshot-1', { content: 'First' });
      await agent.recordToReport('Screenshot-2', { content: 'Second' });
      await agent.recordToReport('Screenshot-3', { content: 'Third' });

      // trigger report write
      await agent.writeOutActionDumps();

      // verify report was generated
      expect(agent.reportFile).toBeTruthy();

      const htmlContent = fs.readFileSync(agent.reportFile!, 'utf-8');

      // should have multiple image script tags with different IDs
      const imageTagMatches = htmlContent.match(/data-id="[^"]+"/g);
      expect(imageTagMatches).toBeTruthy();
      expect(imageTagMatches!.length).toBeGreaterThanOrEqual(3);

      // verify IDs are unique
      const ids = imageTagMatches!.map((m) =>
        m.replace('data-id="', '').replace('"', ''),
      );
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds.length).toBe(ids.length);

      await agent.destroy();
    });
  });

  describe('Memory optimization verification', () => {
    it('should not hold raw base64 in dump after recordToReport', async () => {
      const agent = new PuppeteerAgent(page, {
        useDirectoryReport: true,
        generateReport: false, // only checking dump content, no report needed
        groupName: 'Memory-Opt-Test',
        autoPrintReportMsg: false,
      });

      await page.goto(
        'data:text/html,<html><body><h1>Memory Optimization Test</h1></body></html>',
      );

      // record a screenshot
      await agent.recordToReport('Test-Screenshot', {
        content: 'Memory optimization test',
      });

      // the dump should contain screenshot references, not raw base64
      const dumpString = agent.dumpDataString();

      // verify no large base64 strings in dump (over 1000 chars is suspicious)
      const base64Pattern = /data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{1000,}/;
      expect(dumpString).not.toMatch(base64Pattern);

      // verify references are present in { $screenshot: "uuid" } format
      expect(dumpString).toContain(SCREENSHOT_REF_KEY);

      await agent.destroy();
    });
  });
});
