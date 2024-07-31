# 快速开始

在这个例子中，我们将使用 OpenAI GPT-4o 和 Puppeteer.js 在 eBay 上搜索 "耳机"，并以 JSON 格式返回商品和价格结果。

在运行该示例之前，请确保您已经准备了有权限访问 GPT-4o 的 OpenAI key。

> [Puppeteer](https://pptr.dev/) 是一个 Node.js 库，它通过 DevTools Protocol 或 WebDriver BiDi 提供了用于控制 Chrome 或 Firefox 的高级 API。默认情况下，Puppeteer 运行在无头模式（headless mode, 即没有可见的 UI），但也可以配置为在有头模式（headed mode, 即有可见的浏览器界面）下运行。

配置 API Key

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

安装依赖 

```bash
npm install @midscene/web --save-dev
# for demo use
npm install puppeteer ts-node --save-dev 
```

编写下方代码，保存为 `./demo.ts`

```typescript
import puppeteer, { Viewport } from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

// 初始化 Puppeteer Page
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

// 👀 初始化 MidScene agent 
const mid = new PuppeteerAgent(page);

// 👀 执行搜索
await mid.aiAction('type "Headphones" in search box, hit Enter');
await sleep(5000);

// 👀 提取数据
const items = await mid.aiQuery(
  '{itemTitle: string, price: Number}[], find item in list and corresponding price',
);
console.log('headphones in stock', items);
```

:::tip

你可能已经注意到了，上述文件中的关键代码只有两行，且都是用自然语言编写的

```typescript
await mid.aiAction('type "Headphones" in search box, hit Enter');
await mid.aiQuery(
  '{itemTitle: string, price: Number}[], find item in list and corresponding price',
);
```
:::

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

运行 MidScene 之后，系统会生成一个日志文件，默认存放在 `./midscene_run/latest.web-dump.json`。然后，你可以把这个文件导入 [可视化工具](/visualization/)，这样你就能更清楚地了解整个过程。

在 [可视化工具](/visualization/) 中，点击 `Load Demo` 按钮，你将能够看到上方代码的运行结果以及其他的一些示例。