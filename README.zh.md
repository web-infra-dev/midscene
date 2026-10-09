<p align="center">
  <img alt="Midscene.js" width="180" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4"><br />
  <strong>像人一样看懂界面，用自然语言完成 E2E 测试</strong><br />
  基于视觉的 GUI Agent 与可扩展的测试框架，覆盖 Web、移动端和桌面应用。
</p>

<p align="center">
  <a href="https://midscenejs.com/zh/">官网</a> · <a href="./README.md">English</a> / 简体中文
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <a href="https://github.com/web-infra-dev/midscene/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" /></a>
  <a href="https://trendshift.io/repositories/12524"><img src="https://img.shields.io/badge/GitHub_Trending-featured-00a8f0?style=flat-square&logo=github" alt="Featured on GitHub Trending" /></a>
</p>

## 用自然语言编写测试

Midscene.js 帮助开发者将 AI 引入 E2E 测试。用自然语言描述界面操作和预期结果，视觉 GUI Agent 会执行这些步骤，并验证用户看到的效果。你可以通过 Midscene Test 组织测试，也可以将 Agent API 接入现有测试框架。

### 使用 Midscene Test 编写 YAML 用例

[创建 Midscene Test 项目](https://midscenejs.com/zh/midscene-test/extend)，配置好模型和 Web 运行环境后，就可以编写下面这样的用例。请将示例网址替换为你的应用地址：

```yaml
beforeEach:
  - gotoUrl: https://your-shop.example

cases:
  - name: 筛选 100 美元以下的耳机
    steps:
      - aiAct: 搜索耳机，然后将结果筛选为价格低于 100 美元
      - aiWaitFor: 筛选后的搜索结果已显示
      - aiAssert: 搜索结果中有商品，且每件商品价格都低于 100 美元
```

### 使用 JavaScript 与 Playwright

你也可以在已有测试中直接使用 Agent。配置好模型，并在 Playwright `page` 中打开应用后，用代码描述同样的步骤：

```javascript
import { PlaywrightAgent } from '@midscene/web/playwright';

const agent = new PlaywrightAgent(page);

await agent.aiAct('搜索耳机，然后将结果筛选为价格低于 100 美元');
await agent.aiWaitFor('筛选后的搜索结果已显示');
await agent.aiAssert('搜索结果中有商品，且每件商品价格都低于 100 美元');
```

打开生成的 HTML 报告，即可查看截图、操作与断言结果。[Midscene Test 使用指南](https://midscenejs.com/zh/midscene-test/use)和 [Playwright 集成指南](https://midscenejs.com/zh/integrate-with-playwright)提供配置步骤与完整示例。

## 👁️ 视觉驱动，低成本运行测试

Midscene 的操作与断言都仿照人使用软件的方式：**观察屏幕，根据看到的内容操作，再检查界面呈现的结果**。

### 根据截图定位与操作

Midscene 根据元素的外观和位置进行定位，再通过点击、输入、滚动等操作完成你的指令。无需维护选择器或添加语义化标注，就能定位纯图标按钮、自定义控件、`<canvas>` 和跨域 iframe 中的元素。

### 验证用户看到的结果

用自然语言描述预期外观，就能检查颜色、选中高亮、布局和视觉反馈，也适用于 `<canvas>` 绘制的内容和原生应用界面。

```javascript
await agent.aiAssert('选中的套餐带有蓝色边框和勾选标记');
await agent.aiAssert('邮箱输入框下方显示了错误提示');
```

### 按效果与预算选择模型

基于截图的 UI 操作无需向模型发送庞大的 DOM 树。在 AppControlBench 评测中，Midscene 搭配豆包 Seed 2.1 Turbo，**60 项任务通过 58 项，模型调用总费用为 0.59 美元**。[评测报告](https://midscenejs.com/zh/app-control-bench-report)提供了逐任务费用与不同模型的对比。

Midscene 支持 `Qwen3.x`、`Doubao-Seed-2.1`、`DeepSeek V4 Flash`、`GLM-4.6V`、`gemini-3.5-flash`、`UI-TARS` 等模型，也包括可自托管的开源选项。通过[模型策略](https://midscenejs.com/zh/model-strategy)选择适合的模型，再按照[模型配置指南](https://midscenejs.com/zh/model-common-config)完成配置。

## 🌐 一套 API，覆盖不同平台

通过同一套 Agent API，在不同平台上描述操作和断言：

| 平台 | 接入方式 |
| --- | --- |
| Web | [Playwright](https://midscenejs.com/zh/integrate-with-playwright)、[Puppeteer](https://midscenejs.com/zh/integrate-with-puppeteer) 或[桌面 Chrome](https://midscenejs.com/zh/bridge-mode) |
| Android | [通过 ADB 连接真机或模拟器](https://midscenejs.com/zh/platforms/android) |
| iOS | [通过 WebDriverAgent 连接真机或模拟器](https://midscenejs.com/zh/platforms/ios) |
| HarmonyOS | [通过 HDC 连接 HarmonyOS NEXT](https://midscenejs.com/zh/platforms/harmonyos) |
| 桌面 | [macOS、Windows、Linux，支持远程 RDP](https://midscenejs.com/zh/platforms/desktop) |
| 自定义界面 | [提供截图与操作能力，即可接入](https://midscenejs.com/zh/integrate-with-any-interface) |

## 🧩 Midscene Test：用 YAML 组织用例，用 TypeScript 扩展

[Midscene Test](https://midscenejs.com/zh/midscene-test/overview)（`@midscene/test`，Beta）帮助你将 GUI 自动化组织为可持续维护的 E2E 测试工程：

- **用 YAML 描述测试用例**：组合界面操作、断言与业务节点，表达测试流程和预期结果。
- **用 TypeScript 节点复用业务能力**：将数据准备、接口调用与清理封装为节点，供不同用例复用。例如，一条退款用例可以先通过 API 准备订单，再通过 UI 申请退款并验证结果。
- **为开发者和 AI Agent 生成 Node 说明书**：将已注册节点与参数定义导出为 Markdown，让双方都能了解项目能力，共同编写和维护用例。

从[创建与扩展测试项目](https://midscenejs.com/zh/midscene-test/extend)开始，再了解如何[编写与运行用例](https://midscenejs.com/zh/midscene-test/use)。

## 🧰 编写与调试测试的工具链

### 灵活接入现有测试工程

通过 `aiAct` 自主执行流程，通过 `aiTap`、`aiInput` 控制单步操作，通过 `aiAssert` 编写断言，通过 `aiQuery` 提取结构化数据。借助 Playwright、Puppeteer 或 JavaScript SDK，你可以将这些 [Agent API](https://midscenejs.com/zh/reference/#common) 与已有代码、测试夹具和断言组合。

### 回放执行，调整指令

交互式 HTML 报告展示截图、元素定位、AI 决策过程，以及操作和断言结果。Midscene Test 还会记录自定义业务操作的输入、输出、耗时和状态，为开发者和 AI Agent 提供排查失败所需的上下文。通过 [Playground](https://midscenejs.com/zh/quick-start)，可以直接在界面上试验和调整指令。

### 让 AI 编程 Agent 操作界面

通过 [Midscene Skills](https://midscenejs.com/zh/skills)，让 AI 编程 Agent 操作应用、验证界面，并查看执行结果。

## 📊 Benchmark 与案例

| Benchmark | Pass@1 | 对应评测使用的模型 |
| --- | --- | --- |
| [AndroidWorld](https://midscenejs.com/zh/android-world-benchmark-report) | 93.1% | Gemini-3.5-Flash |
| [MobileWorld](https://midscenejs.com/zh/mobile-world-benchmark-report) | 78.6% | Gemini-3.6-Flash |
| [AppControlBench](https://midscenejs.com/zh/app-control-bench-report) | 96.7% | Doubao Seed 2.1 Turbo |

各报告包含运行配置与任务结果；AndroidWorld 报告还说明了环境与校验器的调整。

查看[跨平台案例](https://midscenejs.com/zh/showcases)，了解 Web 表单校验、移动端操作流程，以及社区构建的车机测试方案。

## 🚀 开始使用

- **编写 YAML 测试用例**：先[创建 Midscene Test 项目](https://midscenejs.com/zh/midscene-test/extend)。
- **为现有测试引入视觉能力**：接入 [Playwright](https://midscenejs.com/zh/integrate-with-playwright) 或 [Puppeteer](https://midscenejs.com/zh/integrate-with-puppeteer)。
- **编写测试前先体验**：使用 [Chrome 插件](https://midscenejs.com/zh/quick-start)，或启动[移动端或桌面端 Playground](https://midscenejs.com/zh/quick-start#在其他平台使用-midscene)。
- **让 AI Agent 操作界面**：安装 [Midscene Skills](https://midscenejs.com/zh/skills)。

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
