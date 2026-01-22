import fs from 'node:fs';
import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('SVG Icon Cache Tests', () => {
  let resetFn: () => Promise<void>;
  let agent: PuppeteerAgent;
  const cacheId = 'svg-icon-cache-test';
  const cacheDir = path.join(process.cwd(), 'midscene_run', 'cache');
  const cacheFilePath = path.join(cacheDir, `${cacheId}.cache.yaml`);

  afterEach(async () => {
    if (agent) {
      try {
        await agent.destroy();
      } catch (e) {
        console.warn('agent destroy error', e);
      }
    }
    if (resetFn) {
      await resetFn();
    }
    // Clean up cache file
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }
  });

  it('should cache and reuse XPath for SVG icons with indices', async () => {
    // Create a test HTML page with multiple SVG icons in a table cell
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>SVG Icon Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    td {
      padding: 10px;
      border: 1px solid #ccc;
    }
    svg {
      width: 20px;
      height: 20px;
      margin: 0 5px;
      cursor: pointer;
      fill: #1890ff;
    }
    svg:hover {
      fill: #40a9ff;
    }
    #result {
      margin-top: 20px;
      padding: 10px;
      border: 1px solid #ccc;
      background: #f5f5f5;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>Table with Multiple SVG Icons</h1>
  <table>
    <thead>
      <tr>
        <th>Project Name</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Test Project 1</td>
        <td>Active</td>
        <td class="action-cell">
          <!-- View icon -->
          <svg id="view-icon" viewBox="0 0 1024 1024" onclick="handleClick('view')">
            <path d="M512 256c-192 0-352 128-416 288 64 160 224 288 416 288s352-128 416-288c-64-160-224-288-416-288z m0 480c-106 0-192-86-192-192s86-192 192-192 192 86 192 192-86 192-192 192z m0-320c-70.4 0-128 57.6-128 128s57.6 128 128 128 128-57.6 128-128-57.6-128-128-128z"/>
          </svg>
          <!-- Copy icon -->
          <svg id="copy-icon" viewBox="0 0 1024 1024" onclick="handleClick('copy')">
            <path d="M832 64H296c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h496v688c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V96c0-17.7-14.3-32-32-32z M704 192H192c-17.7 0-32 14.3-32 32v530.7c0 8.5 3.4 16.6 9.4 22.6l173.3 173.3c2.2 2.2 4.7 4 7.4 5.5v1.9h4.2c3.5 1.3 7.2 2 11 2H704c17.7 0 32-14.3 32-32V224c0-17.7-14.3-32-32-32z"/>
          </svg>
          <!-- Delete icon -->
          <svg id="delete-icon" viewBox="0 0 1024 1024" onclick="handleClick('delete')">
            <path d="M360 184h-8c4.4 0 8-3.6 8-8v8h304v-8c0 4.4 3.6 8 8 8h-8v72h72v-80c0-35.3-28.7-64-64-64H352c-35.3 0-64 28.7-64 64v80h72v-72z m504 72H160c-17.7 0-32 14.3-32 32v32c0 4.4 3.6 8 8 8h60.4l24.7 523c1.6 34.1 29.8 61 63.9 61h454c34.2 0 62.3-26.8 63.9-61l24.7-523H888c4.4 0 8-3.6 8-8v-32c0-17.7-14.3-32-32-32z"/>
          </svg>
          <!-- Edit icon (4th SVG) -->
          <svg id="edit-icon" viewBox="0 0 1024 1024" onclick="handleClick('edit')">
            <path d="M257.7 752c2 0 4-.2 6-.5L431.9 722c2-.4 3.9-1.3 5.3-2.8l423.9-423.9c3.9-3.9 3.9-10.2 0-14.1L694.9 114.9c-1.9-1.9-4.4-2.9-7.1-2.9s-5.2 1-7.1 2.9L256.8 538.8c-1.5 1.5-2.4 3.3-2.8 5.3l-29.5 168.2c-1.9 11.1 1.5 21.9 9.4 29.8 6.6 6.4 14.9 9.9 23.8 9.9z m67.4-174.4L687.8 215l73.3 73.3-362.7 362.6-88.9 15.7 15.6-89z"/>
          </svg>
        </td>
      </tr>
    </tbody>
  </table>
  <div id="result">No icon clicked yet</div>
  <script>
    function handleClick(action) {
      document.getElementById('result').innerText = 'Clicked: ' + action;
    }
  </script>
</body>
</html>
    `;

    // Write test HTML to temporary file
    const testHtmlPath = path.join(process.cwd(), 'midscene_run', 'test-svg-icons.html');
    fs.mkdirSync(path.dirname(testHtmlPath), { recursive: true });
    fs.writeFileSync(testHtmlPath, testHtml);

    try {
      // === First run: Generate cache ===
      console.log('=== First Run: Generating cache ===');
      const { originPage: page1, reset: reset1 } = await launchPage(`file://${testHtmlPath}`);
      resetFn = reset1;

      agent = new PuppeteerAgent(page1, {
        cache: {
          id: cacheId,
          strategy: 'read-write',
        },
        testId: 'svg-icon-cache-first-run',
      });

      // Click the 4th SVG icon (edit icon)
      await agent.aiAction('click the edit icon (the 4th icon in the action cell)');

      // Verify the click worked
      const result1 = await page1.evaluate(() => {
        return document.getElementById('result')?.innerText;
      });
      expect(result1).toBe('Clicked: edit');

      // Verify cache was written
      expect(fs.existsSync(cacheFilePath)).toBe(true);

      // Read cache content
      const cacheContent1 = fs.readFileSync(cacheFilePath, 'utf-8');
      console.log('Cache content after first run:\n', cacheContent1);

      // Verify cache contains svg[4] in the XPath
      expect(cacheContent1).toContain('svg[4]');
      expect(cacheContent1).toMatch(/edit.*icon/i);

      // Clean up first agent
      await agent.destroy();
      await reset1();

      // === Second run: Use cache ===
      console.log('\n=== Second Run: Using cache ===');
      const { originPage: page2, reset: reset2 } = await launchPage(`file://${testHtmlPath}`);
      resetFn = reset2;

      agent = new PuppeteerAgent(page2, {
        cache: {
          id: cacheId,
          strategy: 'read-only',
        },
        testId: 'svg-icon-cache-second-run',
      });

      // Click the same icon using cache
      await agent.aiAction('click the edit icon (the 4th icon in the action cell)');

      // Verify the click worked again
      const result2 = await page2.evaluate(() => {
        return document.getElementById('result')?.innerText;
      });
      expect(result2).toBe('Clicked: edit');

      console.log('✅ SVG icon cache test passed!');

      // Clean up
      await agent.destroy();
      await reset2();
      fs.unlinkSync(testHtmlPath);
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(testHtmlPath)) {
        fs.unlinkSync(testHtmlPath);
      }
      throw error;
    }
  });

  it('should distinguish between different SVG icons in the same cell', async () => {
    // Create a test HTML page with multiple SVG icons
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Multiple SVG Icons Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
    }
    .icon-container {
      display: flex;
      gap: 10px;
    }
    svg {
      width: 24px;
      height: 24px;
      cursor: pointer;
      fill: #1890ff;
    }
    svg:hover {
      fill: #40a9ff;
    }
    #result {
      margin-top: 20px;
      padding: 10px;
      border: 1px solid #ccc;
      background: #f5f5f5;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>Multiple SVG Icon Test</h1>
  <div class="icon-container">
    <svg id="icon1" viewBox="0 0 1024 1024" onclick="document.getElementById('result').innerText='Clicked: Icon 1'">
      <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z m0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"/>
    </svg>
    <svg id="icon2" viewBox="0 0 1024 1024" onclick="document.getElementById('result').innerText='Clicked: Icon 2'">
      <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z m193.5 301.7l-210.6 292c-12.7 17.7-39 17.7-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"/>
    </svg>
    <svg id="icon3" viewBox="0 0 1024 1024" onclick="document.getElementById('result').innerText='Clicked: Icon 3'">
      <path d="M685.4 354.8c0-4.4-3.6-8-8-8l-66 .3L512 465.6l-99.3-118.4-66.1-.3c-4.4 0-8 3.5-8 8 0 1.9.7 3.7 1.9 5.2l130.1 155L340.5 670c-1.2 1.5-1.9 3.3-1.9 5.2 0 4.4 3.6 8 8 8l66.1-.3L512 564.4l99.3 118.4 66 .3c4.4 0 8-3.5 8-8 0-1.9-.7-3.7-1.9-5.2L553.5 515l130.1-155c1.2-1.4 1.8-3.3 1.8-5.2z"/>
    </svg>
  </div>
  <div id="result">No icon clicked</div>
</body>
</html>
    `;

    const testHtmlPath = path.join(process.cwd(), 'midscene_run', 'test-multiple-svg-icons.html');
    fs.mkdirSync(path.dirname(testHtmlPath), { recursive: true });
    fs.writeFileSync(testHtmlPath, testHtml);

    try {
      const { originPage, reset } = await launchPage(`file://${testHtmlPath}`);
      resetFn = reset;

      agent = new PuppeteerAgent(originPage, {
        cache: {
          id: `${cacheId}-multiple`,
          strategy: 'read-write',
        },
        testId: 'svg-multiple-icons-test',
      });

      // Click the second SVG icon
      await agent.aiAction('click the second circular icon');

      // Verify correct icon was clicked
      const result = await originPage.evaluate(() => {
        return document.getElementById('result')?.innerText;
      });
      expect(result).toBe('Clicked: Icon 2');

      // Verify cache contains svg[2]
      const multipleCachePath = path.join(cacheDir, `${cacheId}-multiple.cache.yaml`);
      if (fs.existsSync(multipleCachePath)) {
        const cacheContent = fs.readFileSync(multipleCachePath, 'utf-8');
        console.log('Cache for multiple icons:\n', cacheContent);
        expect(cacheContent).toContain('svg[2]');
        fs.unlinkSync(multipleCachePath);
      }

      console.log('✅ Multiple SVG icons distinction test passed!');

      // Clean up
      await agent.destroy();
      await reset();
      fs.unlinkSync(testHtmlPath);
    } catch (error) {
      if (fs.existsSync(testHtmlPath)) {
        fs.unlinkSync(testHtmlPath);
      }
      throw error;
    }
  });
});
