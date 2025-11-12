# GEM Browser Remote Browser 接入指南

本指南介绍如何在 `@midscene/web` 中使用 `RemoteBrowserAgent` 接入 GEM Browser 云浏览器服务。

## 📋 目录

- [简介](#简介)
- [快速开始](#快速开始)
- [核心功能](#核心功能)
- [配置选项](#配置选项)
- [使用示例](#使用示例)
- [API 参考](#api-参考)
- [常见问题](#常见问题)

## 简介

GEM Browser 是部署在 ByteFaaS/veFaaS 的轻量级云浏览器服务，支持：

- ✅ **CDP 协议直连**：通过 Puppeteer/Playwright 完全控制浏览器
- ✅ **自动实例管理**：自动创建/删除 FaaS 实例
- ✅ **多环境支持**：内场（CN/i18n/BOE）、外场（火山引擎）
- ✅ **VNC 远程查看**：实时查看和人工接管浏览器
- ✅ **AI 驱动自动化**：使用 Midscene AI 能力进行智能操作

## 快速开始

### 安装依赖

```bash
npm install @midscene/web puppeteer
# 或使用 Playwright
npm install @midscene/web playwright
```

### 基础用法

```typescript
import { RemoteBrowserAgent } from '@midscene/web/remote-browser';

// 创建并启动 Agent
const agent = await RemoteBrowserAgent.create({
  environment: 'CN',  // 选择环境：CN, I18N, BOE, VOLCANO
  engine: 'puppeteer', // 或 'playwright'
  ttlMinutes: 60,      // 实例存活时间
});

// 打印 VNC 地址（可在浏览器中查看）
console.log('VNC URL:', agent.getVncUrl());
console.log('Sandbox ID:', agent.getSandboxId());

// 使用 AI 进行自动化操作
await agent.aiAction('Navigate to https://www.baidu.com');
await agent.aiAction('Search for "Midscene.js"');
await agent.aiAction('Click the first search result');

// 清理资源
await agent.cleanup();
```

## 核心功能

### 1. 自动实例管理

Agent 会自动管理 FaaS 实例的生命周期：

```typescript
// 自动创建实例
const agent = new RemoteBrowserAgent({
  environment: 'CN',
  ttlMinutes: 60,
  autoCleanup: true, // 销毁时自动删除实例
});
await agent.launch();

// 手动管理 TTL
await agent.updateTTL(120); // 延长到 120 分钟

// 检查实例状态
const isRunning = await agent.isInstanceRunning();

// 清理（如果 autoCleanup=true，会自动删除实例）
await agent.cleanup();
```

### 2. 连接现有实例

```typescript
// 连接到已存在的实例
const agent = new RemoteBrowserAgent({
  environment: 'CN',
  sandboxId: 'ondemand-j2pd9man-kwveilcg0k-bflgz',
  autoCleanup: false, // 不要删除现有实例
});
await agent.launch();
```

### 3. VNC 远程查看

```typescript
// 获取 VNC URL（带自动连接）
const vncUrl = agent.getVncUrl();
console.log('Open in browser:', vncUrl);

// 自定义 VNC 参数
const vncUrlCustom = agent.getVncUrl({
  autoconnect: true,
  query: {
    resize: 'scale',
    quality: '9',
  },
});
```

### 4. 多环境支持

```typescript
// 内场 CN 环境
const cnAgent = await RemoteBrowserAgent.create({
  environment: 'CN',
});

// 内场 i18n 环境
const i18nAgent = await RemoteBrowserAgent.create({
  environment: 'I18N',
});

// 外场火山引擎环境
const volcanoAgent = await RemoteBrowserAgent.create({
  environment: 'VOLCANO',
});

// 自定义 URL
const customAgent = await RemoteBrowserAgent.create({
  baseUrl: 'https://your-custom-gem-browser.example.com',
});
```

## 配置选项

### RemoteBrowserOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `environment` | `'CN' \| 'I18N' \| 'BOE' \| 'VOLCANO'` | `'CN'` | GEM Browser 环境 |
| `baseUrl` | `string` | - | 自定义基础 URL（优先级高于 environment） |
| `engine` | `'puppeteer' \| 'playwright'` | `'puppeteer'` | 浏览器引擎 |
| `ttlMinutes` | `number` | `60` | 实例存活时间（3-1440 分钟） |
| `displayWidth` | `number` | `1920` | 显示宽度 |
| `displayHeight` | `number` | `1080` | 显示高度 |
| `userAgent` | `string` | - | 自定义 User Agent |
| `autoCleanup` | `boolean` | `true` | 销毁时是否自动删除实例 |
| `requestTimeout` | `number` | `30000` | 请求超时时间（毫秒） |
| `connectionTimeout` | `number` | `30000` | 连接超时时间（毫秒） |
| `sandboxId` | `string` | - | 连接现有实例（而非创建新实例） |
| `faasEnvs` | `Record<string, string>` | `{}` | FaaS 实例环境变量 |
| `faasMetadata` | `Record<string, string>` | `{}` | FaaS 实例元数据 |
| `jwtToken` | `string` | - | JWT 认证令牌 |

### 预设常量

```typescript
import {
  GEM_BROWSER_ENVIRONMENTS,
  COMMON_RESOLUTIONS,
  USER_AGENTS,
} from '@midscene/web/remote-browser';

// 环境地址
console.log(GEM_BROWSER_ENVIRONMENTS.CN);    // https://agent-browser-puppeteer.bytedance.net
console.log(GEM_BROWSER_ENVIRONMENTS.I18N);  // https://agent-browser-puppeteer.byteintl.net

// 常用分辨率
const { FHD, HD, MOBILE_PORTRAIT } = COMMON_RESOLUTIONS;
console.log(FHD);             // { width: 1920, height: 1080 }
console.log(HD);              // { width: 1280, height: 720 }
console.log(MOBILE_PORTRAIT); // { width: 640, height: 720 }

// User Agent
console.log(USER_AGENTS.CHROME_DESKTOP);
console.log(USER_AGENTS.IPHONE);
console.log(USER_AGENTS.ANDROID);
```

## 使用示例

### 示例 1：移动端浏览器

```typescript
import { RemoteBrowserAgent, COMMON_RESOLUTIONS, USER_AGENTS } from '@midscene/web/remote-browser';

const agent = await RemoteBrowserAgent.create({
  environment: 'CN',
  displayWidth: COMMON_RESOLUTIONS.IPHONE_12.width,
  displayHeight: COMMON_RESOLUTIONS.IPHONE_12.height,
  userAgent: USER_AGENTS.IPHONE,
  ttlMinutes: 60,
});

await agent.aiAction('Navigate to https://m.baidu.com');
await agent.aiAction('Search for something on mobile');

await agent.cleanup();
```

### 示例 2：使用 Playwright

```typescript
const agent = await RemoteBrowserAgent.create({
  environment: 'CN',
  engine: 'playwright', // 使用 Playwright
  ttlMinutes: 60,
});

await agent.aiAction('Navigate to https://github.com');
await agent.cleanup();
```

### 示例 3：低级别访问

```typescript
const agent = await RemoteBrowserAgent.create({
  environment: 'CN',
  engine: 'puppeteer',
});

// 获取底层 RemoteBrowserPage
const remotePage = agent.getRemotePage();

// 获取 Puppeteer Browser 和 Page
const browser = remotePage.getBrowser();
const page = remotePage.getPage();

// 直接使用 Puppeteer API
await page.goto('https://example.com');
const title = await page.title();
console.log('Page title:', title);

// 混合使用 AI 操作
await agent.aiAction('Scroll down');

await agent.cleanup();
```

### 示例 4：错误处理

```typescript
let agent: RemoteBrowserAgent | null = null;

try {
  agent = new RemoteBrowserAgent({
    environment: 'CN',
    ttlMinutes: 60,
    requestTimeout: 30000,
  });

  await agent.launch();
  console.log('VNC URL:', agent.getVncUrl());

  await agent.aiAction('Do something');

  // 检查实例状态
  if (!(await agent.isInstanceRunning())) {
    throw new Error('Instance stopped unexpectedly');
  }

} catch (error) {
  console.error('Error occurred:', error);
  // 处理错误
} finally {
  // 确保清理
  if (agent) {
    await agent.cleanup();
    console.log('Cleanup completed');
  }
}
```

### 示例 5：JWT 认证

```typescript
const agent = await RemoteBrowserAgent.create({
  environment: 'CN',
  jwtToken: 'your-jwt-token-here',
  ttlMinutes: 60,
});

await agent.aiAction('Navigate to https://example.com');
await agent.cleanup();
```

## API 参考

### RemoteBrowserAgent

#### 构造函数

```typescript
constructor(options?: RemoteBrowserOptions)
```

#### 静态方法

```typescript
// 创建并启动 Agent（快捷方式）
static async create(options?: RemoteBrowserOptions): Promise<RemoteBrowserAgent>
```

#### 实例方法

```typescript
// 启动 Agent（创建/连接实例）
async launch(): Promise<void>

// 获取 Sandbox ID
getSandboxId(): string

// 获取 VNC URL
getVncUrl(options?: VncOptions): string

// 获取 MCP URL
getMcpUrl(): string

// 获取实例信息
getInstanceInfo(): FaaSInstanceInfo | null

// 更新实例 TTL
async updateTTL(ttlMinutes: number): Promise<void>

// 检查实例是否运行
async isInstanceRunning(): Promise<boolean>

// 获取底层 RemoteBrowserPage
getRemotePage(): RemoteBrowserPage

// 清理资源（关闭连接，可选删除实例）
async cleanup(): Promise<void>

// 销毁 Agent（调用 cleanup + 父类 destroy）
async destroy(): Promise<void>

// AI 操作（继承自 PageAgent）
async aiAction(action: string, options?: any): Promise<any>
async aiQuery(query: string, options?: any): Promise<any>
async aiAssert(assertion: string, options?: any): Promise<any>
```

### FaaSInstanceManager

用于高级场景，直接管理 FaaS 实例：

```typescript
import { FaaSInstanceManager } from '@midscene/web/remote-browser';

const manager = new FaaSInstanceManager({
  baseUrl: 'https://agent-browser-puppeteer.bytedance.net',
  requestTimeout: 30000,
});

// 创建实例
const instance = await manager.createInstance({
  ttlMinutes: 60,
  displayWidth: 1920,
  displayHeight: 1080,
});

// 获取 CDP Endpoint
const cdpInfo = await manager.getCdpEndpoint(instance.sandboxId);

// 更新 TTL
await manager.updateInstanceTTL(instance.sandboxId, 120);

// 检查实例
const exists = await manager.checkInstance(instance.sandboxId);

// 删除实例
await manager.deleteInstance(instance.sandboxId);

// 获取 VNC URL
const vncUrl = manager.getVncUrl(instance.sandboxId);

// 获取 MCP URL
const mcpUrl = manager.getMcpUrl(instance.sandboxId);
```

## 常见问题

### 1. 如何选择 Puppeteer 还是 Playwright？

- **Puppeteer**：更轻量，启动快，社区成熟
- **Playwright**：功能更丰富，跨浏览器支持更好，返回更详细的 DOM 信息

推荐默认使用 Puppeteer，如果需要更高级的功能再切换到 Playwright。

### 2. 实例什么时候被删除？

- 如果 `autoCleanup: true`（默认），调用 `cleanup()` 或 `destroy()` 时会自动删除
- 如果 `autoCleanup: false`，需要手动删除或等待 TTL 过期
- 如果连接现有实例（`sandboxId` 选项），不会删除实例

### 3. VNC URL 无法访问？

确保：
- 实例已成功创建（检查 `agent.getSandboxId()`）
- 网络可以访问对应的 GEM Browser 环境
- VNC URL 中的 `sandboxId` 正确

### 4. 如何处理超时？

```typescript
const agent = new RemoteBrowserAgent({
  requestTimeout: 60000,      // API 请求超时
  connectionTimeout: 60000,   // CDP 连接超时
  waitForNavigationTimeout: 30000, // 页面导航超时
});
```

### 5. 支持多个实例同时运行吗？

是的，可以创建多个 Agent 实例：

```typescript
const agent1 = await RemoteBrowserAgent.create({ environment: 'CN' });
const agent2 = await RemoteBrowserAgent.create({ environment: 'I18N' });

// 并行操作
await Promise.all([
  agent1.aiAction('Do something'),
  agent2.aiAction('Do something else'),
]);

await Promise.all([
  agent1.cleanup(),
  agent2.cleanup(),
]);
```

### 6. 如何查看完整的示例代码？

查看 `examples.ts` 文件，包含 12 个详细示例：

```typescript
import {
  basicExample,
  customConfigExample,
  playwrightExample,
  // ... more examples
} from '@midscene/web/remote-browser/examples';

// 运行示例
await basicExample();
```

## 相关资源

- [GEM Browser 官方文档](云浏览器 Remote Browser MCP + VNC 使用文档（GEM Browser）.md)
- [Midscene.js 文档](https://midscenejs.com)
- [Puppeteer 文档](https://pptr.dev)
- [Playwright 文档](https://playwright.dev)

## 技术支持

如有问题，请联系：
- GEM Browser 用户群
- 提交 Issue 到项目仓库
