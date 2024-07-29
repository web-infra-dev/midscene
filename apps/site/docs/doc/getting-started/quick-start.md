# Quick Start

In this example, we use OpenAI GPT-4o and Puppeteer.js to _________. Remember to prepare an OpenAI key that is eligible for accessing GPT-4o before running.

> [Puppeteer](https://pptr.dev/) is a Node.js library which provides a high-level API to control Chrome or Firefox over the DevTools Protocol or WebDriver BiDi. Puppeteer runs in the headless (no visible UI) by default but can be configured to run in a visible ("headful") browser.

Config the API key

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Install 

```bash
npm install @midscene/web --save-dev
# for demo use
npm install puppeteer ts-node --save-dev 
```

Write a simple demo to **extract the main download button of vscode website**.
Save the following code as `./demo.ts`.

```typescript
import puppeteer, { Viewport } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// init Puppeteer page
const browser = await puppeteer.launch({
  headless: false, // here we use headed mode to help debug
});

const page = await browser.newPage();
await page.goto('https://www.bing.com');
await page.waitForNavigation({
  timeout: 20 * 1000,
  waitUntil: 'networkidle0',
});
const page = await launchPage();

// init MidScene agent
const agent = new PuppeteerAgent(page);
await agent.aiAction('type "how much is the ferry ticket in Shanghai" in search box, hit Enter');

```

Using ts-node to run:

```bash
# run
npx ts-node demo.ts

# it should print '... is blue'
```

After running, MidScene will generate a log dump, which is placed in `./midscene_run/latest.web-dump.json` by default. Then put this file into [Visualization Tool](/visualization/), and you will have a clearer understanding of the process.

