<p align="center">
  <img alt="Midscene.js" width="180" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4"><br />
  <strong>面向 E2E 测试的 GUI Agent</strong><br />
  AI 视觉驱动。全平台覆盖。开箱即用。
</p>

<p align="center">
  <a href="https://midscenejs.com/zh/">官网</a> · <a href="./README.md">English</a> / 简体中文
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <a href="https://github.com/web-infra-dev/midscene/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" /></a>
  <a href="https://trendshift.io/repositories/12524"><img src="https://img.shields.io/badge/Trendshift-Midscene-00a8f0?style=flat-square" alt="Midscene on Trendshift" /></a>
</p>

## 如何使用

Midscene 将视觉驱动的 GUI Agent 与编写、验证和调试 UI 测试所需的 Testing Kit 结合在一起，通过同一套 Agent API 覆盖 Web、移动端和桌面应用。下面以 Playwright 的 Web 测试为例：配置好模型，并在已有的 Playwright `page` 中打开你的应用后，就可以这样编写测试：

```typescript
import { PlaywrightAgent } from '@midscene/web/playwright';

const agent = new PlaywrightAgent(page);

// 让 Agent 完成流程，再验证结果。
await agent.aiAct('搜索耳机，然后将结果筛选为价格低于 100 美元');
await agent.aiWaitFor('筛选后的搜索结果已显示');
await agent.aiAssert('搜索结果中的每件商品价格都低于 100 美元');
```

打开生成的 HTML 报告，即可查看截图、操作与断言结果。[Playwright 集成指南](https://midscenejs.com/zh/integrate-with-playwright)提供模型配置、完整示例和测试运行器集成步骤。

## 👁️ GUI Agent

### 视觉理解与跨平台操作

Midscene 根据截图定位元素，根据自然语言指令规划操作。无需编写选择器或添加语义化标注，就能定位纯图标按钮、自定义控件、`<canvas>` 和跨域 iframe 中的元素。

同一套 Agent API 覆盖 [Web](https://midscenejs.com/zh/integrate-with-playwright)、[Android](https://midscenejs.com/zh/platforms/android)、[iOS](https://midscenejs.com/zh/platforms/ios)、[HarmonyOS](https://midscenejs.com/zh/platforms/harmonyos) 和[桌面应用](https://midscenejs.com/zh/platforms/desktop)。提供截图和操作能力后，你也可以接入[自定义界面](https://midscenejs.com/zh/integrate-with-any-interface)。

### 验证用户真正看到的效果

Midscene 直接根据截图判断界面实际呈现的效果。用自然语言描述预期外观，就能检查颜色、选中高亮、布局和视觉反馈，也适用于 `<canvas>` 绘制的内容和原生应用界面。

```typescript
await agent.aiAssert('选中的套餐带有蓝色边框和勾选标记');
await agent.aiAssert('邮箱输入框下方显示了错误提示');
```

### Benchmark 表现

| Benchmark | Pass@1 | 对应评测使用的模型 |
| --- | --- | --- |
| [AndroidWorld](https://midscenejs.com/zh/android-world-benchmark-report) | 93.1% | Gemini-3.5-Flash |
| [MobileWorld](https://midscenejs.com/zh/mobile-world-benchmark-report) | 78.6% | Gemini-3.6-Flash |
| [AppControlBench](https://midscenejs.com/zh/app-control-bench-report) | 96.7% | Doubao Seed 2.1 Turbo |

各报告包含运行配置与任务结果；AndroidWorld 报告还说明了环境与校验器的调整。

### 运行成本与模型选择

基于截图的 UI 操作无需向模型发送庞大的 DOM 树。在上述 AppControlBench 评测中，Midscene 搭配 Doubao Seed 2.1 Turbo 完成了 60 个任务的评测，**模型调用总费用为 0.59 美元**，其中 58 个任务通过。[评测报告](https://midscenejs.com/zh/app-control-bench-report)提供了逐任务费用与不同模型的对比。

Midscene 支持 `Qwen3.x`、`Doubao-Seed-2.1`、`GLM-4.6V`、`gemini-3.5-flash`、`UI-TARS` 等多模态模型，也包括可自托管的开源选项。你可以先使用单模型，再按场景组合规划模型与视觉模型。在数据提取与页面理解场景中，仍可按需选择携带 DOM。详见[模型策略](https://midscenejs.com/zh/model-strategy)。

### 案例

* [Web 自动化 - 在浏览器中自动注册 GitHub 表单并通过所有字段校验](https://midscenejs.com/zh/showcases#web)
* [iOS 自动化 - 美团下单咖啡](https://midscenejs.com/zh/showcases#ios)
* [iOS 自动化 - 自动点赞 @midscene_ai 的第一条推文](https://midscenejs.com/zh/showcases#ios)
* [Android 自动化 - 懂车帝：查看小米 SU7 参数](https://midscenejs.com/zh/showcases#android)
* [Android 自动化 - 预订圣诞节酒店](https://midscenejs.com/zh/showcases#android)
* [车机测试中的机械臂 + 视觉 + 语音方案](https://midscenejs.com/zh/showcases#community-showcases)

## 🧰 Testing Kit

### 编写与控制测试流程

使用 `aiAct` 规划并执行流程，也可以通过 `aiTap`、`aiInput` 等 API 逐步编排操作。将自然语言指令与 JavaScript 逻辑结合，为测试的不同部分选择合适的控制粒度。

### 断言、查询与等待

使用 `aiAssert` 将视觉预期转为测试断言，通过 `aiQuery` 提取结构化数据并在测试代码中进一步校验，使用 `aiWaitFor` 等待预期界面状态。详见 [API 参考](https://midscenejs.com/zh/reference/#common)。

### 回放与调试执行过程

可视化 HTML 报告记录截图、操作与结果，帮助你逐步查看执行过程、排查失败原因。通过 [Playground](https://midscenejs.com/zh/quick-start#chrome-extension)，可以先在界面上试验指令，再将其加入测试。

### 集成与扩展测试工程

将 Midscene 接入 [Playwright](https://midscenejs.com/zh/integrate-with-playwright)，在自己的测试工程中使用 JavaScript SDK，或通过 [YAML](https://midscenejs.com/zh/automate-with-scripts-in-yaml) 编写流程。[测试运行器](https://midscenejs.com/zh/test-runner-overview)提供生命周期钩子、并发控制与自定义 TypeScript 节点，用于测试数据准备和业务操作。

AI 编程 Agent 也可以通过 [Midscene Skills](https://midscenejs.com/zh/skills) 调用 Midscene CLI 测试界面，包括在 OpenClaw 中使用。

## 🚀 开始使用

- **在 Chrome 中体验一条指令**：按照[快速开始](https://midscenejs.com/zh/quick-start)配置模型并安装 Chrome Extension。
- **通过 SDK 或 YAML 编写测试**：从 [Playwright](https://midscenejs.com/zh/integrate-with-playwright)、[Puppeteer](https://midscenejs.com/zh/integrate-with-puppeteer) 或[测试运行器](https://midscenejs.com/zh/use-test-runner)开始。
- **让 AI Agent 操作界面**：安装 [Midscene Skills](https://midscenejs.com/zh/skills)。
- **测试其他平台**：查看 [Android](https://midscenejs.com/zh/platforms/android)、[iOS](https://midscenejs.com/zh/platforms/ios)、[HarmonyOS](https://midscenejs.com/zh/platforms/harmonyos) 或[桌面端](https://midscenejs.com/zh/platforms/desktop)指南。

## 📄 资源

* 文档：[https://midscenejs.com/zh](https://midscenejs.com/zh)
* 示例项目：[midscene-example](https://github.com/web-infra-dev/midscene-example)
* API 参考：[https://midscenejs.com/zh/reference/#common](https://midscenejs.com/zh/reference/#common)

## 🤝 社区

* [Discord](https://discord.gg/2JyBHxszE4)
* [关注 X](https://x.com/midscene_ai)
* [飞书交流群](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba)

## 🌟 Awesome Midscene

扩展 Midscene.js 能力的社区项目：

* [midscene-ios](https://github.com/lhuanyu/midscene-ios) - 面向 Midscene 的 iOS Mirror 自动化支持
* [midscene-pc](https://github.com/Mofangbao/midscene-pc) - 适配 Windows、macOS、Linux 的 PC 操作设备
* [midscene-pc-docker](https://github.com/Mofangbao/midscene-pc-docker) - 预装 Midscene-PC 服务端的 Docker 镜像
* [Midscene-Python](https://github.com/Python51888/Midscene-Python) - Midscene 自动化 Python SDK
* [midscene-java](https://github.com/Master-Frank/midscene-java) by @Master-Frank - Midscene 自动化 Java SDK
* [midscene-java](https://github.com/alstafeev/midscene-java) by @alstafeev - Midscene 自动化 Java SDK


## 📝 致谢

感谢以下项目：

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) 与 [Rslib](https://github.com/web-infra-dev/rslib) 提供构建工具支持。
- [UI-TARS](https://github.com/bytedance/ui-tars) 提供开源 Agent 模型 UI-TARS。
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) 提供开源多模态模型 Qwen-VL。
- [scrcpy](https://github.com/Genymobile/scrcpy) 与 [yume-chan](https://github.com/yume-chan) 让我们能在浏览器中控制 Android 设备。
- [appium-adb](https://github.com/appium/appium-adb) 提供 ADB 的 JavaScript 桥接。
- [appium-webdriveragent](https://github.com/appium/WebDriverAgent) 提供 JavaScript 操作 XCTest 能力。
- [YADB](https://github.com/ysbing/YADB) 提供 yadb 工具以提升文本输入性能。
- [libnut-core](https://github.com/nut-tree/libnut-core) 提供跨平台原生键鼠控制。
- [Puppeteer](https://github.com/puppeteer/puppeteer) 提供浏览器自动化与控制能力。
- [Playwright](https://github.com/microsoft/playwright) 提供浏览器自动化、控制与测试能力。

## 📖 引用

如果你在研究或项目中使用了 Midscene.js，请引用：

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: GUI Agent for E2E Testing.},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/web-infra-dev/midscene}
}
```

## ✨ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=web-infra-dev/midscene&type=Date)](https://www.star-history.com/#web-infra-dev/midscene&Date)


## 📝 许可协议

Midscene.js 采用 [MIT 许可证](https://github.com/web-infra-dev/midscene/blob/main/LICENSE)。

---

<div align="center">
  如果这个项目对你有帮助或启发，欢迎点个 Star
</div>
