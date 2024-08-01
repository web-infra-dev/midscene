# Quick Start

In this example, we use OpenAI GPT-4o to search headphones on ebay, and then get the result items and prices in JSON format. 

Remember to prepare an API key that is eligible for accessing OpenAI's GPT-4o before running.

## Preparation

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

## Integrate with Playwright

> [Playwright.js](https://playwright.com/) is an open-source automation library developed by Microsoft, primarily designed for end-to-end testing and web scraping of web applications.

### Step 1. update playwright.config.ts

```diff
export default defineConfig({
  testDir: './e2e',
+ timeout: 90 * 1000,
+ reporter: '@midscene/web/playwright-report',
});
```

### Step 2. extend the `test` instance

Save the following code as `./fixture.ts`;

```typescript
import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web';
import { PlaywrightAiFixture } from '@midscene/web';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
```

### Step 3. write the test case

Save the following code as `./e2e/ebay.spec.ts`;

```typescript
// ...
```

### Step 4. run the test case

```bash
npx playwright test ./test/ebay.spec.ts
```

### Step 5. view test report after running

```bash

```


## Integrate with Puppeteer

> [Puppeteer](https://pptr.dev/) is a Node.js library which provides a high-level API to control Chrome or Firefox over the DevTools Protocol or WebDriver BiDi. Puppeteer runs in the headless (no visible UI) by default but can be configured to run in a visible ("headful") browser.

Write and save the following code as `./demo.ts`.

```typescript
import puppeteer, { Viewport } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// init Puppeteer page
const browser = await puppeteer.launch({
  headless: false, // here we use headed mode to help debug
});

const page = await browser.newPage();
await page.goto('https://www.ebay.com');
await page.waitForNavigation({
  timeout: 20 * 1000,
  waitUntil: 'networkidle0',
});
const page = await launchPage();

// 👀 init MidScene agent 
const mid = new PuppeteerAgent(page);

// 👀 perform a search
await mid.aiAction('type "Headphones" in search box, hit Enter');
await sleep(5000);

// 👀 find the items
const items = await mid.aiQuery(
  '{itemTitle: string, price: Number}[], find item in list and corresponding price',
);
console.log('headphones in stock', items);
```

:::tip
You may have noticed that the key lines of code for this only consist of two lines. They are all written in plain language.

```typescript
await mid.aiAction('type "Headphones" in search box, hit Enter');
await mid.aiQuery(
  '{itemTitle: string, price: Number}[], find item in list and corresponding price',
);
```
:::

Using ts-node to run, you will get the data of Headphones on ebay:

```bash
# run
npx ts-node demo.ts

# it should print 
#  [
#   {
#     itemTitle: 'JBL Tour Pro 2 - True wireless Noise Cancelling earbuds with Smart Charging Case',
#     price: 551.21
#   },
#   {
#     itemTitle: 'Soundcore Space One无线耳机40H ANC播放时间2XStronger语音还原',
#     price: 543.94
#   }
# ]
```

After running, MidScene will generate a log dump, which is placed in `./midscene_run/latest.web-dump.json` by default. Then put this file into [Visualization Tool](/visualization/), and you will have a clearer understanding of the process.

Click the 'Load Demo' button in the [Visualization Tool](/visualization/), you will be able to see the results of the previous code as well as some other samples.