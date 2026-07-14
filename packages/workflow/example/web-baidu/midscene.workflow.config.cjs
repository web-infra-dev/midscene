const { PlaywrightAgent } = require('@midscene/web/playwright');
const { defineWorkflowProject } = require('@midscene/test/config');
const { createMidsceneNodes } = require('@midscene/test/midscene');
const { chromium } = require('playwright');

const midsceneNodes = createMidsceneNodes({
  getAgent: ({ context }) => context.agent,
});

module.exports = defineWorkflowProject({
  files: {
    include: ['baidu.yaml'],
  },
  nodes: [...midsceneNodes],

  async setupDocument({ onTeardown }) {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    onTeardown(() => browser.close());

    const page = await browser.newPage({
      viewport: { width: 1280, height: 768 },
    });
    const response = await page.goto('https://www.baidu.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!response?.ok()) {
      throw new Error(
        `Baidu returned an unsuccessful HTTP status: ${response?.status() ?? 'no response'}`,
      );
    }

    return {
      agent: new PlaywrightAgent(page),
    };
  },
});
