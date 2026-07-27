# Guide content extracted from API Reference

This temporary file preserves tutorial-oriented content removed from the English and Chinese API Reference pages. Source labels show where each block came from. Relative links still use their original Reference-page paths and should be adjusted when the content is merged into its final guide.

本文临时保存从中英文 API Reference 迁出的教程性内容。每个区块都标明了原始章节。相对链接仍沿用 Reference 页面中的路径，合并到最终指南时需要按目标文件调整。

## English

The following sections were removed from `apps/site/docs/en/reference/index.mdx`. Each block retains its original text so it can be merged into the appropriate guide later.

### Source: Shared Agent APIs / Agent construction and options / Custom model configuration

**Basic example: one model for all intents**
```typescript
const agent = new PuppeteerAgent(page, {
  modelConfig: {
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    MIDSCENE_MODEL_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    MIDSCENE_MODEL_API_KEY: 'sk-...',
    MIDSCENE_MODEL_FAMILY: 'qwen3'
  }
});
```

**Configure different models with intent-specific keys**
```typescript
const agent = new PuppeteerAgent(page, {
  modelConfig: {
    // default
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    MIDSCENE_MODEL_API_KEY: 'sk-default-key',
    MIDSCENE_MODEL_BASE_URL: '.....',
    MIDSCENE_MODEL_FAMILY: 'qwen3',

    // planning intent
    MIDSCENE_PLANNING_MODEL_NAME: 'gpt-5.1',
    MIDSCENE_PLANNING_MODEL_API_KEY: 'sk-planning-key',
    MIDSCENE_PLANNING_MODEL_BASE_URL: '...',
    MIDSCENE_PLANNING_MODEL_FAMILY: 'gpt-5',

    // insight intent
    MIDSCENE_INSIGHT_MODEL_NAME: 'qwen-vl-plus',
    MIDSCENE_INSIGHT_MODEL_API_KEY: 'sk-insight-key',
    MIDSCENE_INSIGHT_MODEL_FAMILY: 'qwen2.5-vl'
  }
});
```

### Source: Shared Agent APIs / Agent construction and options / Custom OpenAI client

**Example: LangSmith integration**
```typescript
import { wrapOpenAI } from 'langsmith/wrappers';

const agent = new PuppeteerAgent(page, {
  createOpenAIClient: async (openai, options) => {
    // Wrap with LangSmith for planning tasks
    if (options.baseURL?.includes('planning')) {
      return wrapOpenAI(openai, {
        metadata: { task: 'planning' }
      });
    }

    // Return the original client for other tasks
    return openai;
  }
});
```

**Note:** For LangSmith and Langfuse integrations, we recommend the environment-variable approach documented in [Model configuration](../model-config#using-langsmith). This approach requires no `createOpenAIClient` code. A custom wrapper overrides automatic integration through environment variables.

### Source: Shared Agent APIs / Planning and interaction

:::info Auto planning vs. instant actions

Midscene supports auto planning and instant actions:

- `agent.ai()` uses auto planning. Midscene plans and executes the required steps. This approach is flexible, but it can be slower and depends more heavily on model quality.
- `agent.aiTap()`, `agent.aiHover()`, `agent.aiInput()`, `agent.aiClearInput()`, `agent.aiKeyboardPress()`, `agent.aiScroll()`, `agent.aiPinch()`, `agent.aiLongPress()`, `agent.aiDoubleClick()`, and `agent.aiRightClick()` are instant-action methods. Midscene performs the specified action while the model locates the target element. Use these methods when you already know which action to perform; they are generally faster and more reliable.

:::

### Source: Shared Agent APIs / Report utilities / ReportMergingTool

**Use cases**

- Test suites that run multiple workflows and need one consolidated report
- Cross-platform workflows, such as web and Android automation, that need one combined result
- CI/CD pipelines that need a summarized automation report

**Full example**

Below is a complete example of using `ReportMergingTool` in a Vitest suite:

```typescript
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';
import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';

describe('Android settings automation', () => {
  let device: AndroidDevice;
  let agent: AndroidAgent;
  let startTime: number;
  const reportMergingTool = new ReportMergingTool();

  beforeAll(async () => {
    const [first] = await getConnectedDevices();
    if (!first) {
      throw new Error('No connected Android device found');
    }

    device = new AndroidDevice(first.udid);
    await device.connect();
  });

  beforeEach((ctx) => {
    startTime = performance.now();
    agent = new AndroidAgent(device, {
      groupName: ctx.task.name,
    });
  });

  afterEach((ctx) => {
    let workflowStatus: TestStatus;
    if (ctx.task.result?.state === 'pass') {
      workflowStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      workflowStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0]?.message.includes('timed out')) {
      workflowStatus = 'timedOut';
    } else {
      workflowStatus = 'failed';
    }

    // Add the report to the merge list
    reportMergingTool.append({
      reportFilePath: agent.reportFile as string,
      reportAttributes: {
        testId: ctx.task.name,
        testTitle: ctx.task.name,
        testDescription: 'Automation workflow description',
        testDuration: performance.now() - startTime,
        testStatus: workflowStatus,
      },
    });
  });

  afterAll(async () => {
    // Merge all automation reports
    reportMergingTool.mergeReports('android-settings-automation-report');
    await device.destroy();
  });

  it('toggle WLAN', async () => {
    await agent.aiAct('Find and open WLAN settings');
    await agent.aiAct('Toggle WLAN once');
  });

  it('toggle Bluetooth', async () => {
    await agent.aiAct('Find and open Bluetooth settings');
    await agent.aiAct('Toggle Bluetooth once');
  });
});
```

:::tip

The merged report is saved under the `midscene_run/report` directory. Open the generated HTML file in your browser to review the workflows.

:::

### Source: Web / PuppeteerPageAgent and PuppeteerBrowserAgent / Examples

**Examples**

<a id="web-quick-start"></a>

**Quick start**

```ts
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
await page.goto('https://www.ebay.com');

const agent = new PuppeteerAgent(page, {
  aiActContext: 'When a cookie dialog appears, accept it.',
});

await agent.aiAct('search "Noise cancelling headphones" and open first result');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], list two products with price',
);
console.log(items);

await agent.aiAssert('there is a category filter on the left sidebar');
await browser.close();
```

<a id="web-connect-to-a-remote-puppeteer-browser"></a>

**Connect to a remote Puppeteer browser**

```ts
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const browser = await puppeteer.connect({
  browserWSEndpoint: process.env.REMOTE_CDP_URL!,
});

const [page = await browser.newPage()] = await browser.pages();
const agent = new PuppeteerAgent(page, {
  waitForNetworkIdleTimeout: 0,
});

await agent.aiAct('open https://example.com and click the login button');
await agent.destroy();
await browser.disconnect();
```

### Source: Web / PlaywrightPageAgent and PlaywrightBrowserAgent / Examples

**Examples**

<a id="web-playwright-quick-start"></a>

**Quick start**

```ts
import { chromium } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.ebay.com');

const agent = new PlaywrightAgent(page);
await agent.aiAct('search "Noise cancelling headphones" and wait for results');
await agent.aiWaitFor('the results grid becomes visible');

const price = await agent.aiNumber('price of the first headphone');
console.log('first price', price);

await agent.aiTap('click the first result card');
await browser.close();
```

<a id="web-extend-playwright-tests-with-midscene-fixtures"></a>

**Extend Playwright tests with Midscene fixtures**

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [['list'], ['@midscene/web/playwright-reporter']],
});

// e2e/fixture.ts
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend(
  PlaywrightAiFixture({ waitForNetworkIdleTimeout: 1000 }),
);

// e2e/examples.spec.ts
test('search flow', async ({ agentForPage, page }) => {
  await page.goto('https://www.ebay.com');
  const agent = await agentForPage(page);
  await agent.aiAct('search "keyboard" and open first listing');
  await agent.aiAssert('a product detail page is opened');
});
```

The fixture accepts all `PlaywrightAgent` options, so you can configure shared agent behavior once at fixture creation time. Per-test metadata such as `testId`, `reportFileName`, `groupName`, and `groupDescription` remain fixture-managed.

### Source: Web / Chrome Bridge Agent / Examples

**Examples**

<a id="web-open-a-new-desktop-tab"></a>

**Open a new desktop tab**

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

const agent = new AgentOverChromeBridge();
await agent.connectNewTabWithUrl('https://www.bing.com');

await agent.ai('search "AI automation" and summarise first result');
await agent.aiAssert('some search results show up');
await agent.destroy();
```

<a id="web-attach-to-current-tab"></a>

**Attach to current tab**

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

const agent = new AgentOverChromeBridge({
  allowRemoteAccess: false,
  closeNewTabsAfterDisconnect: true,
});

await agent.connectCurrentTab({ forceSameTabNavigation: true });
await agent.aiAct('open Gmail and report how many unread emails are visible');
await agent.destroy();
```

### Source: Android / AndroidDevice / scrcpy screenshot mode

- `scrcpyConfig?: object` — High-performance scrcpy screenshot configuration. Disabled by default. See [scrcpy screenshot mode](#scrcpy).

<a id="scrcpy"></a>

**scrcpy screenshot mode**

By default, Midscene captures screenshots through `adb shell screencap`, which takes approximately 500–2,000 ms per call. scrcpy mode streams H.264 video from the device and captures frames in real time, reducing screenshot latency to approximately **100–200 ms**.

**How to enable:**

```ts
const device = new AndroidDevice(deviceId, {
  scrcpyConfig: {
    enabled: true,
  },
});
```

**Optional parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable scrcpy screenshots |
| `maxSize` | `number` | `0` | Max video dimension (width or height). `0` = no scaling |
| `videoBitRate` | `number` | `2000000` | H.264 encoding bitrate (bps) |
| `idleTimeoutMs` | `number` | `30000` | Auto-disconnect after idle (ms). Set to `0` to disable |

:::tip
If the scrcpy connection fails, Midscene falls back to `adb` screenshots. After a transient failure, it waits five seconds before retrying scrcpy. You do not need to recreate the `AndroidDevice`.
:::

Use `getScrcpyStatus()` to detect when capture has fallen back to `adb`. Call `retryScrcpy()` to retry immediately instead of waiting for the cooldown:

```ts
const status = device.getScrcpyStatus();

if (status.enabled && !status.connected && status.lastError) {
  console.warn(status.lastError);
  await device.retryScrcpy();
}
```

`getScrcpyStatus()` returns `enabled`, `connected`, `lastError`, and `retryAfter`. Initialization errors include any output emitted by the device-side scrcpy server to help diagnose codec and media-stack failures.

### Source: Android / AndroidDevice / Examples

**Examples**

<a id="android-quick-start"></a>

**Quick start**

```ts
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';

const [first] = await getConnectedDevices();
const device = new AndroidDevice(first.udid);
await device.connect();

const agent = new AndroidAgent(device, {
  aiActContext: 'If a permissions dialog appears, accept it.',
});

await agent.launch('https://www.ebay.com');
await agent.aiAct('search "Headphones" and wait for results');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], find item in list and corresponding price',
);
console.log(items);
```

<a id="android-launch-native-packages"></a>

**Launch native packages**

```ts
await agent.launch('com.android.settings/.Settings');
await agent.back();
await agent.home();
```

### Source: iOS / IOSDevice / Examples

**Examples**

<a id="ios-quick-start"></a>

**Quick start**

```ts
import { IOSAgent, IOSDevice } from '@midscene/ios';

const device = new IOSDevice({ wdaHost: 'localhost', wdaPort: 8100 });
await device.connect();

const agent = new IOSAgent(device, {
  aiActContext: 'If any permission dialog appears, accept it.',
});

await agent.launch('https://ebay.com');
await agent.aiAct('Search for "Headphones"');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], list headphone products',
);
console.log(items);
```

<a id="ios-custom-host-and-port"></a>

**Custom host and port**

```ts
const device = new IOSDevice({
  wdaHost: '192.168.1.100',
  wdaPort: 8300,
});
await device.connect();
```

### Source: iOS / Usage patterns / Extending custom interaction actions

#### Usage patterns

**Extending custom interaction actions**

Extend the Agent's action space by supplying `customActions` with handlers created via `defineAction`. These actions appear after the built-in ones and can be called during planning.

```ts
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { agentFromWebDriverAgent } from '@midscene/ios';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z.number().int().positive().describe('How many times to click'),
  }),
  async call({ locate, count }) {
    console.log('click target center', locate.center);
    console.log('click count', count);
  },
});

const agent = await agentFromWebDriverAgent({
  customActions: [ContinuousClick],
});

await agent.aiAct('Click the red button five times');
```

### Source: HarmonyOS / HarmonyDevice / Examples

**Examples**

<a id="harmonyos-quick-start"></a>

**Quick start**

```ts
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '@midscene/harmony';

const [first] = await getConnectedDevices();
const device = new HarmonyDevice(first.deviceId, {});
await device.connect();

const agent = new HarmonyAgent(device, {
  aiActContext: 'This is a HarmonyOS device. Accept any confirmation dialog.',
});

await agent.launch('com.huawei.hmos.settings');
await agent.aiAct('scroll down one screen');
const items = await agent.aiQuery(
  'string[], list all visible setting item names',
);
console.log(items);
```

<a id="harmonyos-launch-apps"></a>

**Launch apps**

```ts
await agent.launch('com.huawei.hmos.settings'); // Open Settings
await agent.launch('com.huawei.hmos.camera');    // Open Camera
await agent.back();
await agent.home();
```

### Source: Desktop / Usage patterns

#### Usage patterns

**Open an application and navigate**

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer();

// Open application
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+Space');
  await agent.aiAct('type "TextEdit" and press Enter');
} else {
  await agent.aiAct('press Windows key');
  await agent.aiAct('type "Notepad" and press Enter');
}

await agent.aiWaitFor('text editor window is visible');

// Type content
await agent.aiAct('type "Hello, Midscene!"');

// Save file
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+S');
} else {
  await agent.aiAct('press Ctrl+S');
}
```

**Multi-display workflow**

```typescript
import { ComputerDevice, agentForComputer } from '@midscene/computer';

// List displays
const displays = await ComputerDevice.listDisplays();
console.log(`Found ${displays.length} displays`);

// Control primary display
const agent1 = await agentForComputer({
  displayId: displays[0].id,
});
await agent1.aiAct('move mouse to center of screen');

// Control secondary display
if (displays.length > 1) {
  const agent2 = await agentForComputer({
    displayId: displays[1].id,
  });
  await agent2.aiAct('move mouse to center of screen');
}
```

**Web browser automation**

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer();

// Open browser
if (process.platform === 'darwin') {
  await agent.aiAct('press Cmd+Space');
  await agent.aiAct('type "Safari" and press Enter');
} else {
  await agent.aiAct('press Windows key');
  await agent.aiAct('type "Chrome" and press Enter');
}

await agent.aiWaitFor('browser window is open');

// Navigate
await agent.aiAct('click on address bar');
await agent.aiAct('type "example.com" and press Enter');
await agent.aiWaitFor('page has loaded');

// Extract information
const title = await agent.aiQuery('string, get the page title');
console.log('Page title:', title);
```

## 中文

以下内容原样迁出自 `apps/site/docs/zh/reference/index.mdx`，并按原章节标注来源，供后续合并到相应 Guide。

### 来源：规划与交互：自动规划与即时操作的概念说明

:::info 自动规划 与 即时操作

在 Midscene 中，你可以选择使用自动规划（Auto Planning）或即时操作（Instant Action）。

- `agent.ai()` 是自动规划（Auto Planning）：Midscene 会自动规划操作步骤并执行。它更智能，更像流行的 AI Agent 风格，但可能较慢，且效果依赖于 AI 模型的质量。
- `agent.aiTap()`, `agent.aiHover()`, `agent.aiInput()`, `agent.aiClearInput()`, `agent.aiKeyboardPress()`, `agent.aiScroll()`, `agent.aiPinch()`, `agent.aiLongPress()`, `agent.aiDoubleClick()`, `agent.aiRightClick()` 是即时操作（Instant Action）：Midscene 会直接执行指定的操作，而 AI 模型只负责底层任务，如定位元素等。这种接口形式更快、更可靠。当你完全确定自己想要执行的操作时，推荐使用这种接口形式。

:::

### 来源：Agent 配置：modelConfig 完整配置示例

**基础示例（所有意图共用同一模型）：**
```typescript
const agent = new PuppeteerAgent(page, {
  modelConfig: {
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    MIDSCENE_MODEL_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    MIDSCENE_MODEL_API_KEY: 'sk-...',
    MIDSCENE_MODEL_FAMILY: 'qwen3'
  }
});
```

**为不同任务类型配置不同模型（使用针对意图的环境变量键）：**
```typescript
const agent = new PuppeteerAgent(page, {
  modelConfig: {
    // 默认
    MIDSCENE_MODEL_NAME: 'qwen3.7-plus',
    MIDSCENE_MODEL_API_KEY: 'sk-default-key',
    MIDSCENE_MODEL_BASE_URL: '.....',
    MIDSCENE_MODEL_FAMILY: 'qwen3',

    // planning 意图
    MIDSCENE_PLANNING_MODEL_NAME: 'gpt-5.1',
    MIDSCENE_PLANNING_MODEL_API_KEY: 'sk-planning-key',
    MIDSCENE_PLANNING_MODEL_BASE_URL: '...',
    MIDSCENE_PLANNING_MODEL_FAMILY: 'gpt-5',

    // insight 意图
    MIDSCENE_INSIGHT_MODEL_NAME: 'qwen-vl-plus',
    MIDSCENE_INSIGHT_MODEL_API_KEY: 'sk-insight-key',
    MIDSCENE_INSIGHT_MODEL_FAMILY: 'qwen2.5-vl'
  }
});
```

### 来源：Agent 配置：createOpenAIClient 的 LangSmith 示例与环境变量说明

**示例（集成 LangSmith）：**
```typescript
import { wrapOpenAI } from 'langsmith/wrappers';

const agent = new PuppeteerAgent(page, {
  createOpenAIClient: async (openai, options) => {
    // 为规划任务包装 LangSmith
    if (options.baseURL?.includes('planning')) {
      return wrapOpenAI(openai, {
        metadata: { task: 'planning' }
      });
    }

    // 其他任务返回原始客户端
    return openai;
  }
});
```

**注意：** 对于 LangSmith 和 Langfuse 集成，推荐使用 [模型配置](../model-config#使用-langsmith) 中介绍的环境变量方式，无需编写 `createOpenAIClient` 代码。如果你提供了自定义的客户端包装函数，它会覆盖环境变量的自动集成行为。

### 来源：报告工具：ReportMergingTool 使用场景

**使用场景**

- 在自动化套件中运行多个工作流，希望生成一个统一的报告
- 跨平台自动化(如 Web 和 Android)需要合并不同平台的自动化结果
- CI/CD 流程中需要生成汇总的自动化报告

### 来源：报告工具：ReportMergingTool 完整 Vitest 示例

**完整示例**

以下是在 Vitest 框架中使用 `ReportMergingTool` 的完整示例:

```typescript
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';
import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';

describe('Android 设置自动化', () => {
  let device: AndroidDevice;
  let agent: AndroidAgent;
  let startTime: number;
  const reportMergingTool = new ReportMergingTool();

  beforeAll(async () => {
    const [first] = await getConnectedDevices();
    if (!first) {
      throw new Error('未找到已连接的 Android 设备');
    }

    device = new AndroidDevice(first.udid);
    await device.connect();
  });

  beforeEach((ctx) => {
    startTime = performance.now();
    agent = new AndroidAgent(device, {
      groupName: ctx.task.name,
    });
  });

  afterEach((ctx) => {
    // 确定自动化状态
    let workflowStatus: TestStatus;
    if (ctx.task.result?.state === 'pass') {
      workflowStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      workflowStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0]?.message.includes('timed out')) {
      workflowStatus = 'timedOut';
    } else {
      workflowStatus = 'failed';
    }

    // 添加报告到合并列表
    reportMergingTool.append({
      reportFilePath: agent.reportFile as string,
      reportAttributes: {
        testId: ctx.task.name,
        testTitle: ctx.task.name,
        testDescription: '自动化工作流描述',
        testDuration: performance.now() - startTime,
        testStatus: workflowStatus,
      },
    });
  });

  afterAll(async () => {
    // 合并所有自动化报告
    reportMergingTool.mergeReports('android-settings-automation-report');
    await device.destroy();
  });

  it('切换 WLAN', async () => {
    await agent.aiAct('找到并进入 WLAN 设置');
    await agent.aiAct('切换 WLAN 状态一次');
  });

  it('切换蓝牙', async () => {
    await agent.aiAct('找到并进入蓝牙设置');
    await agent.aiAct('切换蓝牙状态一次');
  });
});
```

:::tip

合并后的报告文件会保存在 `midscene_run/report` 目录下。你可以使用浏览器打开合并后的 HTML 文件查看所有自动化工作流的执行情况。

:::

### 来源：Web：Puppeteer 快速上手与远程浏览器

**示例**

<a id="web-快速上手"></a>

**快速上手**

```ts
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
await page.goto('https://www.ebay.com');

const agent = new PuppeteerAgent(page, {
  aiActContext: 'When a cookie dialog appears, accept it.',
});

await agent.aiAct('search "Noise cancelling headphones" and open first result');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], list two products with price',
);
console.log(items);

await agent.aiAssert('there is a category filter on the left sidebar');
await browser.close();
```

<a id="web-连接远程-puppeteer-浏览器"></a>

**连接远程 Puppeteer 浏览器**

```ts
import puppeteer from 'puppeteer';
import { PuppeteerAgent } from '@midscene/web/puppeteer';

const browser = await puppeteer.connect({
  browserWSEndpoint: process.env.REMOTE_CDP_URL!,
});

const [page = await browser.newPage()] = await browser.pages();
const agent = new PuppeteerAgent(page, {
  waitForNetworkIdleTimeout: 0,
});

await agent.aiAct('open https://example.com and click the login button');
await agent.destroy();
await browser.disconnect();
```

### 来源：Web：Playwright 快速上手与 Fixture

**示例**

<a id="web-playwright-快速上手"></a>

**快速上手**

```ts
import { chromium } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.ebay.com');

const agent = new PlaywrightAgent(page);
await agent.aiAct('search "Noise cancelling headphones" and wait for results');
await agent.aiWaitFor('the results grid becomes visible');

const price = await agent.aiNumber('price of the first headphone');
console.log('first price', price);

await agent.aiTap('click the first result card');
await browser.close();
```

<a id="web-使用-midscene-fixture-扩展-playwright-测试"></a>

**使用 Midscene fixture 扩展 Playwright 测试**

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [['list'], ['@midscene/web/playwright-reporter']],
});

// e2e/fixture.ts
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

export const test = base.extend(
  PlaywrightAiFixture({ waitForNetworkIdleTimeout: 1000 }),
);

// e2e/examples.spec.ts
test('search flow', async ({ agentForPage, page }) => {
  await page.goto('https://www.ebay.com');
  const agent = await agentForPage(page);
  await agent.aiAct('search "keyboard" and open first listing');
  await agent.aiAssert('a product detail page is opened');
});
```

这个 fixture 也支持传入 `PlaywrightAgent` 的全部配置，因此你可以在创建 fixture 时统一配置共享的 Agent 行为。`testId`、`reportFileName`、`groupName`、`groupDescription` 这类按测试自动生成的元信息仍由 fixture 管理。

### 来源：Web：Chrome Bridge 使用示例

**示例**

<a id="web-打开新的桌面标签页"></a>

**打开新的桌面标签页**

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

const agent = new AgentOverChromeBridge();
await agent.connectNewTabWithUrl('https://www.bing.com');

await agent.ai('search "AI automation" and summarise first result');
await agent.aiAssert('some search results show up');
await agent.destroy();
```

<a id="web-附着到当前标签页"></a>

**附着到当前标签页**

```ts
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

const agent = new AgentOverChromeBridge({
  allowRemoteAccess: false,
  closeNewTabsAfterDisconnect: true,
});

await agent.connectCurrentTab({ forceSameTabNavigation: true });
await agent.aiAct('open Gmail and report how many unread emails are visible');
await agent.destroy();
```

### 来源：Android：scrcpy 截图模式教程

<a id="scrcpy"></a>

**scrcpy 截图模式**

默认情况下，Midscene 通过 `adb shell screencap` 截图，每次耗时约 500–2000ms。开启 scrcpy 模式后，通过 H.264 视频流实时获取画面，每次截图耗时约 **100–200ms**。

**开启方式：**

```ts
const device = new AndroidDevice(deviceId, {
  scrcpyConfig: {
    enabled: true,
  },
});
```

**可选参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用 scrcpy 截图 |
| `maxSize` | `number` | `0` | 视频流最大分辨率（宽或高），`0` 表示不缩放 |
| `videoBitRate` | `number` | `2000000` | H.264 编码码率（bps） |
| `idleTimeoutMs` | `number` | `30000` | 空闲超时后自动断开连接（ms），设为 `0` 禁用 |

:::tip
scrcpy 模式在连接失败时会自动降级到 ADB 截图。瞬态失败会进入五秒冷却期，冷却结束后的下一次截图会自动重试 scrcpy，无需重新创建 `AndroidDevice`。
:::

如果调用方需要感知截图已降级，可以使用 `getScrcpyStatus()`；如需跳过冷却期立即重试，可以使用 `retryScrcpy()`：

```ts
const status = device.getScrcpyStatus();

if (status.enabled && !status.connected && status.lastError) {
  console.warn(status.lastError);
  await device.retryScrcpy();
}
```

`getScrcpyStatus()` 返回 `enabled`、`connected`、`lastError` 和 `retryAfter`。初始化异常会包含可获取到的设备端 scrcpy server 输出，便于诊断编码器和媒体栈尚未就绪等问题。

### 来源：Android：AndroidDevice 使用示例

**示例**

<a id="android-快速开始"></a>

**快速开始**

```ts
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';

const [first] = await getConnectedDevices();
const device = new AndroidDevice(first.udid);
await device.connect();

const agent = new AndroidAgent(device, {
  aiActContext: 'If a permissions dialog appears, accept it.',
});

await agent.launch('https://www.ebay.com');
await agent.aiAct('search "Headphones" and wait for results');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], find item in list and corresponding price',
);
console.log(items);
```

<a id="android-启动原生-app"></a>

**启动原生 App**

```ts
await agent.launch('com.android.settings/.Settings');
await agent.back();
await agent.home();
```

### 来源：iOS：IOSDevice 使用示例

**示例**

<a id="ios-快速开始"></a>

**快速开始**

```ts
import { IOSAgent, IOSDevice } from '@midscene/ios';

const device = new IOSDevice({ wdaHost: 'localhost', wdaPort: 8100 });
await device.connect();

const agent = new IOSAgent(device, {
  aiActContext: 'If any permission dialog appears, accept it.',
});

await agent.launch('https://ebay.com');
await agent.aiAct('Search for \"Headphones\"');
const items = await agent.aiQuery(
  '{itemTitle: string, price: number}[], list headphone products',
);
console.log(items);
```

<a id="ios-自定义-host-与端口"></a>

**自定义 Host 与端口**

```ts
const device = new IOSDevice({
  wdaHost: '192.168.1.100',
  wdaPort: 8300,
});
await device.connect();
```

### 来源：iOS：自定义 Action 教程

#### 使用示例

**扩展自定义交互动作**

通过 `defineAction` 创建处理器并传入 `customActions`，即可扩展 Agent 的动作空间。这些动作会追加在内置动作之后，可在规划阶段被调用。

```ts
import { getMidsceneLocationSchema, z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { agentFromWebDriverAgent } from '@midscene/ios';

const ContinuousClick = defineAction({
  name: 'continuousClick',
  description: 'Click the same target repeatedly',
  paramSchema: z.object({
    locate: getMidsceneLocationSchema(),
    count: z
      .number()
      .int()
      .positive()
      .describe('How many times to click'),
  }),
  async call({ locate, count }) {
    console.log('click target center', locate.center);
    console.log('click count', count);
  },
});

const agent = await agentFromWebDriverAgent({
  customActions: [ContinuousClick],
});

await agent.aiAct('Click the red button five times');
```

### 来源：HarmonyOS：HarmonyDevice 使用示例

**示例**

<a id="harmonyos-快速开始"></a>

**快速开始**

```ts
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '@midscene/harmony';

const [first] = await getConnectedDevices();
const device = new HarmonyDevice(first.deviceId, {});
await device.connect();

const agent = new HarmonyAgent(device, {
  aiActContext: '这是一台鸿蒙设备，如果出现弹窗，点击同意。',
});

await agent.launch('com.huawei.hmos.settings');
await agent.aiAct('scroll down one screen');
const items = await agent.aiQuery(
  'string[], list all visible setting item names',
);
console.log(items);
```

<a id="harmonyos-启动应用"></a>

**启动应用**

```ts
await agent.launch('com.huawei.hmos.settings'); // 打开系统设置
await agent.launch('com.huawei.hmos.camera');    // 打开相机
await agent.back();
await agent.home();
```

### 来源：桌面端：三个完整工作流示例

#### 使用示例

**打开应用并导航**

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer();

// 打开应用
if (process.platform === 'darwin') {
  await agent.aiAct('按 Cmd+Space');
  await agent.aiAct('输入 "文本编辑" 并按回车');
} else {
  await agent.aiAct('按 Windows 键');
  await agent.aiAct('输入 "记事本" 并按回车');
}

await agent.aiWaitFor('文本编辑器窗口可见');

// 输入内容
await agent.aiAct('输入 "你好，Midscene！"');

// 保存文件
if (process.platform === 'darwin') {
  await agent.aiAct('按 Cmd+S');
} else {
  await agent.aiAct('按 Ctrl+S');
}
```

**多显示器工作流**

```typescript
import { ComputerDevice, agentForComputer } from '@midscene/computer';

// 列出显示器
const displays = await ComputerDevice.listDisplays();
console.log(`找到 ${displays.length} 个显示器`);

// 控制主显示器
const agent1 = await agentForComputer({
  displayId: displays[0].id,
});
await agent1.aiAct('将鼠标移动到屏幕中心');

// 控制副显示器
if (displays.length > 1) {
  const agent2 = await agentForComputer({
    displayId: displays[1].id,
  });
  await agent2.aiAct('将鼠标移动到屏幕中心');
}
```

**Web 浏览器自动化**

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer();

// 打开浏览器
if (process.platform === 'darwin') {
  await agent.aiAct('按 Cmd+Space');
  await agent.aiAct('输入 "Safari" 并按回车');
} else {
  await agent.aiAct('按 Windows 键');
  await agent.aiAct('输入 "Chrome" 并按回车');
}

await agent.aiWaitFor('浏览器窗口已打开');

// 导航
await agent.aiAct('点击地址栏');
await agent.aiAct('输入 "example.com" 并按回车');
await agent.aiWaitFor('页面已加载');

// 提取信息
const title = await agent.aiQuery('string, 获取页面标题');
console.log('页面标题:', title);
```
