# 快速开始

我们用这个需求来举例：使用 OpenAI GPT-4o 在 eBay 上搜索 "耳机"，并以 JSON 格式返回商品和价格结果。

在运行该示例之前，请确保您已经准备了能够调用 OpenAI GPT-4o 模型的 API key。

> [Puppeteer](https://pptr.dev/) 是一个 Node.js 库，它通过 DevTools Protocol 或 WebDriver BiDi 提供了用于控制 Chrome 或 Firefox 的高级 API。默认情况下，Puppeteer 运行在无头模式（headless mode, 即没有可见的 UI），但也可以配置为在有头模式（headed mode, 即有可见的浏览器界面）下运行。

## 准备工作

配置 API Key

```bash
# 更新为你自己的 Key
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

## 集成到 Playwright

> [Playwright.js](https://playwright.com/) 是由微软开发的一个开源自动化库，主要用于对网络应用程序进行端到端测试（end-to-end test）和网页抓取。

这里我们假设你已经拥有一个集成了 Playwright 的仓库。

### 新增依赖 

```bash
npm install @midscene/web --save-dev
```

### 第一步：更新 playwright.config.ts

```diff
export default defineConfig({
  testDir: './e2e',
+ timeout: 90 * 1000,
+ reporter: '@midscene/web/playwright-report',
});
```

### 第二步：扩展 `test` 实例

把下方代码保存为 `./fixture.ts`;

```typescript
import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web';
import { PlaywrightAiFixture } from '@midscene/web';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
```

### 第三步：编写测试用例

编写下方代码，保存为 `./e2e/ebay-search.spec.ts`

```typescript
import { expect } from "@playwright/test";
import { test } from "./fixture";

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto("https://www.ebay.com");
  await page.waitForLoadState("networkidle");
});

test("search headphone on ebay", async ({ ai, aiQuery }) => {
  // 👀 输入关键字，执行搜索
  // 注：尽管这是一个英文页面，你也可以用中文指令控制它
  await ai('在搜索框输入 "Headphones" ，敲回车');

  // 👀 找到列表里耳机相关的信息
  const items = await aiQuery(
    '{itemTitle: string, price: Number}[], 找到列表里的商品标题和价格'
  );

  console.log("headphones in stock", items);
  expect(items?.length).toBeGreaterThan(0);
});

```

### Step 4. 运行测试用例

```bash
npx playwright test ./e2e/ebay-search.spec.ts
```

### Step 5. 查看测试报告

根据命令行输出，执行命令，可以以此打开可视化报告

```bash
# 样例
npx http-server ./midscene_run/report -p 9888 -o -s
```

## 集成到 Puppeteer

> [Puppeteer](https://pptr.dev/) 是一个 Node.js 库，它通过 DevTools 协议或 WebDriver BiDi 提供控制 Chrome 或 Firefox 的高级 API。Puppeteer 默认在无界面模式（headless）下运行，但可以配置为在可见的浏览器模式（headed）中运行。

### 第一步：安装依赖

```bash
npm install @midscene/web --save-dev
npm install puppeteer ts-node --save-dev 
```

### 第二步：编写脚本

编写下方代码，保存为 `./demo.ts`

```typescript
import puppeteer from "puppeteer";
import { PuppeteerAgent } from "@midscene/web";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    const browser = await puppeteer.launch({
      headless: false, // here we use headed mode to help debug
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    await page.goto("https://www.ebay.com");
    await sleep(5000);

    // 👀 初始化 MidScene agent 
    const mid = new PuppeteerAgent(page);

    // 👀 执行搜索
    // 注：尽管这是一个英文页面，你也可以用中文指令控制它
    await mid.aiAction('在搜索框输入 "Headphones" ，敲回车');
    await sleep(5000);

    // 👀 理解页面，提取数据
    const items = await mid.aiQuery(
      '{itemTitle: string, price: Number}[], 找到列表里的商品标题和价格',
    );
    console.log("耳机商品信息", items);

    await browser.close();
  })()
);
```

:::tip

你可能已经注意到了，上述文件中的关键代码只有两行，且都是用自然语言编写的

```typescript
await mid.aiAction('在搜索框输入 "Headphones" ，敲回车');
await mid.aiQuery(
  '{itemTitle: string, price: Number}[], 找到列表里的商品标题和价格',
);
```
:::

### 第三步：运行

使用 `ts-node` 来运行，你会看到命令行打印出了耳机的商品信息：

```bash
# run
npx ts-node demo.ts

# 命令行应该有如下输出
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

### 第四步：查看运行报告

运行 MidScene 之后，系统会生成一个日志文件，默认存放在 `./midscene_run/report/latest.web-dump.json`。然后，你可以把这个文件导入 [可视化工具](/visualization/)，这样你就能更清楚地了解整个过程。

在 [可视化工具](/visualization/) 中，点击 `Load Demo` 按钮，你将能够看到上方代码的运行结果以及其他的一些示例。
