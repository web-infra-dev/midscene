/**
 * 验证目录报告格式功能的测试用例
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

    // 导航到测试页面
    await page.goto(
      'data:text/html,<html><body><h1>Test Page</h1><button>Click Me</button></body></html>',
    );

    // 记录多个截图
    await agent.recordToReport('Initial-State', {
      content: 'Page loaded successfully',
    });

    await agent.recordToReport('After-Action', {
      content: 'Performed some action',
    });

    // 验证报告文件生成
    expect(agent.reportFile).toBeTruthy();
    expect(agent.reportFile).toMatch(/index\.html$/);

    // 验证目录结构
    const reportDir = path.dirname(agent.reportFile!);
    const screenshotsDir = path.join(reportDir, 'screenshots');

    expect(fs.existsSync(agent.reportFile!)).toBe(true);
    expect(fs.existsSync(screenshotsDir)).toBe(true);

    // 验证截图文件
    const screenshots = fs.readdirSync(screenshotsDir);
    expect(screenshots.length).toBeGreaterThan(0);
    expect(screenshots.every((file) => file.endsWith('.png'))).toBe(true);

    // 验证 HTML 内容包含相对路径
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

    // 验证生成单个 HTML 文件
    expect(agent.reportFile).toBeTruthy();
    expect(agent.reportFile).toMatch(/\.html$/);
    expect(agent.reportFile).not.toMatch(/index\.html$/);

    // 验证是单个文件，不是目录
    const reportPath = agent.reportFile!;
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(fs.statSync(reportPath).isFile()).toBe(true);

    await agent.destroy();
  });
});
