import { describe, it, afterEach } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// Use Playwright's bundled Chromium since puppeteer's download failed
const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';

/**
 * Parse the proxy URL from environment and extract proxy server + auth info.
 * Format: http://user:pass@host:port
 */
function getProxyConfig() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return null;

  try {
    const url = new URL(proxyUrl);
    return {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return null;
  }
}

describe('ebay search token consumption', () => {
  let browser: Browser;
  let page: Page;
  let agent: PuppeteerAgent;

  afterEach(async () => {
    if (agent) await agent.destroy();
    if (browser) await browser.close();
  });

  it('open ebay.com and search for headphones, measure token usage', async () => {
    const proxyConfig = getProxyConfig();
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--ignore-certificate-errors',
    ];

    if (proxyConfig) {
      launchArgs.push(`--proxy-server=${proxyConfig.server}`);
      console.log(`Using proxy: ${proxyConfig.server}`);
    }

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: launchArgs,
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Set proxy authentication if needed
    if (proxyConfig?.username) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password,
      });
    }

    await page.goto('https://www.ebay.com', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Create agent
    agent = new PuppeteerAgent(page, {
      generateReport: false,
    });

    console.log('\n========================================');
    console.log('Starting: open ebay.com, search for headphones');
    console.log('========================================\n');

    // Perform search action
    const startTime = Date.now();
    await agent.aiAct('在搜索框中输入"耳机"，然后点击搜索按钮');
    const endTime = Date.now();

    console.log(`\nAction completed in ${((endTime - startTime) / 1000).toFixed(1)}s`);

    // Wait a bit for page to load results
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    // Assert search results are visible
    const assertStartTime = Date.now();
    await agent.aiAssert('页面上显示了搜索结果');
    const assertEndTime = Date.now();

    // Extract token usage from dump
    const dump = agent.dump;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCachedInput = 0;
    let callCount = 0;

    console.log('\n========================================');
    console.log('Token Usage Breakdown');
    console.log('========================================\n');

    for (const execution of dump.executions) {
      for (const task of execution.tasks) {
        if (task.usage) {
          callCount++;
          const u = task.usage;
          console.log(
            `[Call #${callCount}] ${u.intent || task.type || 'unknown'}`,
          );
          console.log(`  Model: ${u.model_name || 'unknown'}`);
          console.log(`  Prompt tokens:     ${u.prompt_tokens ?? 0}`);
          console.log(`  Completion tokens: ${u.completion_tokens ?? 0}`);
          console.log(`  Total tokens:      ${u.total_tokens ?? 0}`);
          console.log(`  Cached input:      ${u.cached_input ?? 0}`);
          console.log(`  Time cost:         ${u.time_cost ?? 0}ms`);
          console.log('');

          totalPromptTokens += u.prompt_tokens ?? 0;
          totalCompletionTokens += u.completion_tokens ?? 0;
          totalTokens += u.total_tokens ?? 0;
          totalCachedInput += u.cached_input ?? 0;
        }
      }
    }

    const totalTime = (assertEndTime - startTime) / 1000;
    console.log('========================================');
    console.log('TOTAL TOKEN USAGE SUMMARY');
    console.log('========================================');
    console.log(`Total AI calls:         ${callCount}`);
    console.log(`Total prompt tokens:    ${totalPromptTokens}`);
    console.log(`Total completion tokens:${totalCompletionTokens}`);
    console.log(`Total tokens:           ${totalTokens}`);
    console.log(`Total cached input:     ${totalCachedInput}`);
    console.log(`Total time:             ${totalTime.toFixed(1)}s`);
    console.log('========================================\n');
  });
});
