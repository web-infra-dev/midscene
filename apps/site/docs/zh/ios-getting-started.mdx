import StartExperience from './common/start-experience.mdx';
import SetupEnv from './common/setup-env.mdx';
import PrepareIOS from './common/prepare-ios.mdx';

import { PackageManagerTabs } from '@theme';

# iOS 开始使用

本指南会带你完成使用 Midscene 控制 iOS 设备的全部步骤：通过 WebDriverAgent 连接真机、配置模型 API Key、体验零代码 Playground，并运行你的首个 JavaScript 脚本。

:::info 示例项目

使用 JavaScript 控制 iOS 设备：[https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo)

集成 Vitest 进行测试：[https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo)

:::

<SetupEnv />

## 准备工作

继续之前，请确保 WebDriverAgent 可以与设备通信。

<PrepareIOS />

## 试用 Playground（零代码）

Playground 是验证连接、观察 AI 驱动步骤的最快方式，无需编写代码。它与 `@midscene/ios` 共享相同的核心，因此在 Playground 中通过的流程，在脚本中运行会保持一致。

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/x2.mp4" controls/>

1. 启动 Playground CLI：

```bash
npx --yes @midscene/ios-playground
```

2. 点击窗口中的齿轮按钮进入配置页，粘贴你的 API Key 配置。如果还没有 API Key，请回到 [模型配置](./model-config) 获取。

![](/ios-set-env.png)

## 开始体验

<StartExperience />

## 集成 Midscene Agent

当 Playground 工作正常后，就可以切换到可复用的 JavaScript 脚本。

### 第 1 步：安装依赖

<PackageManagerTabs command="install @midscene/ios dotenv --save-dev" />

### 第 2 步：编写脚本

下面的示例会在设备上打开 Safari，搜索 eBay，并断言结果列表。

```typescript title="./demo.ts"
import 'dotenv/config'; // 通过 dotenv/config 自动加载 .env 文件中的环境变量
import {
  IOSAgent,
  IOSDevice,
  agentFromWebDriverAgent,
} from '@midscene/ios';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    // 方式一：直接创建设备和 Agent
    const page = new IOSDevice({
      wdaPort: 8100,
      wdaHost: 'localhost',
    });

    // 👀 初始化 Midscene Agent
    const agent = new IOSAgent(page, {
      aiActionContext:
        'If any location, permission, user agreement, etc. popup appears, click agree. If login page appears, close it.',
    });
    await page.connect();

    // 方式二：使用便捷函数（推荐）
    // const agent = await agentFromWebDriverAgent({
    //   wdaPort: 8100,
    //   wdaHost: 'localhost',
    //   aiActionContext: 'If any location, permission, user agreement, etc. popup appears, click agree. If login page appears, close it.',
    // });

    // 👀 直接打开 ebay.com（推荐做法）
    await page.launch('https://ebay.com');
    await sleep(3000);

    // 👀 输入关键字并执行搜索
    await agent.aiAct('Search for "Headphones"');

    // 👀 等待加载完成
    await agent.aiWaitFor('At least one headphone product is displayed on the page');
    // 或简单地等待几秒：
    // await sleep(5000);

    // 👀 理解页面内容并提取数据
    const items = await agent.aiQuery(
      '{itemTitle: string, price: Number}[], find product titles and prices in the list',
    );
    console.log('Headphone product information', items);

    // 👀 使用 AI 断言
    await agent.aiAssert('Multiple headphone products are displayed on the interface');

    await page.destroy();
  })(),
);
```

### 第 3 步：运行示例

```bash
npx tsx demo.ts
```

### 第 4 步：查看报告

脚本成功后会输出 `Midscene - report file updated: /path/to/report/some_id.html`。在浏览器中打开对应 HTML 文件即可回放每一步交互、查询与断言。

## API 参考与更多资源

需要查看构造函数、辅助方法或平台专属设备 API？请移步 [iOS API 参考](./ios-api-reference) 获取详细参数及自定义操作等高级主题。若想了解跨平台共用的 API，可阅读 [通用 API 参考](./api)。

## 常见问题

### 为什么 WebDriverAgent 已连接，但仍无法控制设备？

请检查以下事项：

1. **开发者模式**：在“设置 > 隐私与安全性 > 开发者模式”中确认已开启。
2. **UI Automation**：在“设置 > 开发者 > UI Automation”中确认已开启。
3. **设备信任**：确保设备信任当前 Mac。

### 模拟器与真机有哪些区别？

| 特性 | 真机 | 模拟器 |
|------|------|--------|
| 端口转发 | 需要 iproxy | 不需要 |
| 开发者模式 | 必须手动开启 | 默认开启 |
| UI Automation 设置 | 需手动开启 | 默认开启 |
| 性能 | 真实设备性能 | 取决于 Mac 性能 |
| 传感器 | 真实硬件 | 模拟数据 |

### 如何自定义 WebDriverAgent 的端口和 Host？

可以通过 `IOSDevice` 构造函数或 `agentFromWebDriverAgent` 来指定端口和 Host：

```typescript
// 方式一：使用 IOSDevice
const device = new IOSDevice({
  wdaPort: 8100,        // 自定义端口
  wdaHost: '192.168.1.100', // 自定义主机
});

// 方式二：使用便捷函数（推荐）
const agent = await agentFromWebDriverAgent({
  wdaPort: 8100,        // 自定义端口
  wdaHost: '192.168.1.100', // 自定义主机
});
```

针对远程设备，还需要按需设置端口转发：

```bash
iproxy 8100 8100 YOUR_DEVICE_ID
```

### 如何在 Playground 中获得更流畅的实时画面？

Playground 的画面预览支持两种模式：

- **轮询模式**（默认）：逐帧调用 WDA 截图 API，帧率约 5-10fps。
- **原生 MJPEG 流**（推荐）：直接代理 WDA 内置的 MJPEG Server，帧率更高、延迟更低。

要启用原生 MJPEG 流，需要将 WDA MJPEG Server 的端口（默认 9100）转发到本机：

```bash
# 真机需要端口转发（模拟器不需要）
iproxy 9100 9100 YOUR_DEVICE_ID
```

Playground 启动时会自动探测 9100 端口。如果可用，日志会显示 `MJPEG: streaming via native WDA MJPEG server`；否则自动回退到轮询模式。

## 更多

- 查看所有 Agent 方法：[API 参考（通用）](./api#interaction-methods)
- iOS 专属参数与接口：[iOS Agent API](./ios-api-reference)
- 示例项目
  - iOS JavaScript SDK 示例：[https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo](https://github.com/web-infra-dev/midscene-example/blob/main/ios/javascript-sdk-demo)
  - iOS + Vitest 示例：[https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo](https://github.com/web-infra-dev/midscene-example/tree/main/ios/vitest-demo)
