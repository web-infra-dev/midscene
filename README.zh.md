<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

[English](./README.md) | 简体中文

<strong>官网</strong>: <a href="https://midscenejs.com/">https://midscenejs.com/</a>

<a href="https://trendshift.io/repositories/12524" target="_blank"><img src="https://trendshift.io/api/badge/repositories/12524" alt="web-infra-dev%2Fmidscene | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

</div>

<p align="center">
  视觉模型驱动，支持全平台的 UI 自动化 SDK
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B"><img src="https://img.shields.io/badge/%F0%9F%A4%97-UI%20TARS%20Models-yellow" alt="hugging face model" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/2JyBHxszE4"><img src="https://img.shields.io/discord/1328277792730779648?style=flat-square&color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai?style=flat-square" alt="twitter" /></a>
  <a href="https://deepwiki.com/web-infra-dev/midscene">
    <img alt="Ask DeepWiki.com" src="https://devin.ai/assets/deepwiki-badge.png" style="height: 18px; vertical-align: middle;">
  </a>
</p>

## 📣 v1.0 正式发布公告

> **我们已发布 v1.0 版本。** 目前已在 npm 发布。  
> v1.0 文档与代码请查看 [https://midscenejs.com/](https://midscenejs.com/) 以及 `main` 分支。  
> v0.x 文档与代码请查看 [https://v0.midscenejs.com/](https://v0.midscenejs.com/) 以及 `v0` 分支。  
> v1.0 变更记录: [https://midscenejs.com/zh/changelog](https://midscenejs.com/zh/changelog)

## 案例

在 Web 浏览器中自主注册 Github 表单，并通过所有字段校验。

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github2.mp4" height="300" controls></video>

此外还有这些实战案例：
* [iOS 自动化 - 美团下单咖啡](https://midscenejs.com/zh/showcases#ios)
* [iOS 自动化 - Twitter 自动点赞 @midscene_ai 首条推文](https://midscenejs.com/zh/showcases#ios)
* [Android 自动化 - 懂车帝查看小米 SU7 参数](https://midscenejs.com/zh/showcases#android)
* [Android 自动化 - Booking 预订圣诞酒店](https://midscenejs.com/zh/showcases#android)
* [MCP 集成 - Midscene MCP 操作界面发布 prepatch 版本](https://midscenejs.com/zh/showcases#mcp)

更多实战案例请点击查看：[案例展示](https://midscenejs.com/zh/showcases)
社区案例： [车机大屏测试中的机械臂 + 视觉 + 语音方案](https://midscenejs.com/zh/showcases#社区案例)

## 💡 特性

### 用自然语言编写自动化脚本
- 描述你的目标和步骤，Midscene 会为你规划和操作用户界面。
- 使用 Javascript SDK 或 YAML 格式编写自动化脚本。

### Web & Mobile App & 任意界面
- **Web 自动化**: 可以[与 Puppeteer 集成](https://midscenejs.com/zh/integrate-with-puppeteer)，[与 Playwright 集成](https://midscenejs.com/zh/integrate-with-playwright)或使用[桥接模式](https://midscenejs.com/zh/bridge-mode)来控制桌面浏览器。
- **Android 自动化**: 使用 [Javascript SDK](https://midscenejs.com/zh/android-getting-started) 配合 adb 来控制本地 Android 设备。
- **iOS 自动化**: 使用 [Javascript SDK](https://midscenejs.com/zh/ios-getting-started) 配合 WebDriverAgent 来控制本地 iOS 设备。
- **任意界面自动化**: 使用 [Javascript SDK](https://midscenejs.com/zh/integrate-with-any-interface) 来控制你自己的界面。

### 工具
- **用于调试的可视化报告**: 通过我们的测试报告和 Playground，你可以轻松理解、回放和调试整个过程。
- [**使用缓存，提高执行效率**](https://midscenejs.com/zh/caching): 使用缓存能力重放脚本，提高执行效率。
- **MCP**: Midscene 提供 MCP 服务，将 Midscene Agent 的原子操作暴露为 MCP 工具，上层 Agent 可以用自然语言检查和操作界面。[文档](https://midscenejs.com/zh/mcp)。

### 三种类型的 API
  - [**交互 API**](https://midscenejs.com/zh/api#interaction-methods): 与用户界面交互。
  - [**数据提取 API**](https://midscenejs.com/zh/api#data-extraction): 从用户界面和 DOM 中提取数据。
  - [**实用 API**](https://midscenejs.com/zh/api#more-apis): 实用函数，如 `aiAssert()` （断言）, `aiLocate()` （定位）, `aiWaitFor()` （等待）。

## 👉 无需代码，快速体验

- **[Chrome 插件](https://midscenejs.com/zh/quick-experience)**: 通过 [Chrome 插件](https://midscenejs.com/zh/quick-experience) 立即开始体验，无需编写代码。
- **[Android Playground](https://midscenejs.com/zh/android-getting-started)**: 内置的 Android Playground 可以控制你的本地 Android 设备。
- **[iOS Playground](https://midscenejs.com/zh/ios-getting-started)**: 内置的 iOS Playground 可以控制你的本地 iOS 设备。

## ✨ 视觉语言模型驱动

Midscene.js 在 UI 操作上采用纯视觉（pure-vision）路线：元素定位和交互只基于截图完成。支持视觉语言模型，例如 `Qwen3-VL`、`Doubao-1.6-vision`、`gemini-3-pro` 和 `UI-TARS`。在数据提取和页面理解场景中，需要时仍可选择附带 DOM 信息。

* UI 操作采用纯视觉定位，不再提供 DOM 提取兼容模式。
* 适用于 Web、移动端、桌面应用，甚至 `<canvas>` 场景。
* UI 操作无需 DOM，Token 更少、成本更低、运行更快。
* 数据提取和页面理解可按需附带 DOM 信息。
* 支持开源模型，方便自托管。

更多信息请阅读 [模型策略](https://midscenejs.com/zh/model-strategy)。

## 👀 与其它工具比较

* **视觉驱动带来可靠性和效率**: 借助视觉语言模型，Midscene.js 适用于 Web 和移动 App 的自动化，无论界面采用何种技术栈。

* **调试体验**: 你很快就会发现，调试和维护自动化脚本才是真正的痛点。无论模型多么强大，你仍然需要调试过程以确保其保持长期稳定。Midscene.js 提供了可视化报告、内置的 Playground 和 Chrome 插件，以调试整个运行过程。这是大多数开发者真正需要的能力。

* **开源、免费、部署灵活**: Midscene.js 是一个开源项目，并且支持自托管模型。

* **与 Javascript 集成**: 你可以永远相信 Javascript

## 📄 资源 

* 官网: [https://midscenejs.com](https://midscenejs.com/)
* 文档: [https://midscenejs.com/zh](https://midscenejs.com/zh)
* 示例项目: [https://github.com/web-infra-dev/midscene-example](https://github.com/web-infra-dev/midscene-example)
* API 文档: [https://midscenejs.com/zh/api](https://midscenejs.com/zh/api)
* GitHub: [https://github.com/web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)

## 🤝 社区

* [Web Infra 团队微信公众号](https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/web-infra-wechat.jpg)
* [飞书交流群](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba)
* [Discord](https://discord.gg/2JyBHxszE4)
* [Follow us on X](https://x.com/midscene_ai)

  <img src="https://github.com/user-attachments/assets/211b05c9-3ccd-4f52-b798-f3a7f51330ed" alt="lark group link" width="300" />

## 🌟 Awesome Midscene

基于 Midscene.js 开发的社区项目：

* [midscene-ios](https://github.com/lhuanyu/midscene-ios) - iOS 设备自动化工具
* [midscene-pc](https://github.com/Mofangbao/midscene-pc) - 支持 Windows、macOS 和 Linux 的 PC 操作设备
* [midscene-pc-docker](https://github.com/Mofangbao/midscene-pc-docker) - 预装 Midscene-PC 服务器的 Docker 容器镜像
* [Midscene-Python](https://github.com/Python51888/Midscene-Python) - Python 版本的 Midscene SDK
* [midscene-java](https://github.com/Master-Frank/midscene-java) by @Master-Frank - Java 版本的 Midscene SDK，便于在 JVM 项目中使用自动化能力
* [midscene-java](https://github.com/alstafeev/midscene-java) by @alstafeev - Java SDK,用于 Midscene 自动化

## 📝 致谢

我们感谢以下项目：

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) 和 [Rslib](https://github.com/web-infra-dev/rslib) 用于构建工具。
- [UI-TARS](https://github.com/bytedance/ui-tars) 用于开源的 AI 模型 UI-TARS。
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) 用于开源的视觉语言模型 Qwen-VL。
- [scrcpy](https://github.com/Genymobile/scrcpy) 和 [yume-chan](https://github.com/yume-chan) 允许我们使用浏览器控制 Android 设备。
- [appium-adb](https://github.com/appium/appium-adb) 用于 javascript 桥接 adb。
- [appium-webdriveragent](https://github.com/appium/WebDriverAgent) 用于 javascript 操作 XCTest。
- [YADB](https://github.com/ysbing/YADB) 用于提高文本输入的兼容性。
- [libnut-core](https://github.com/nut-tree/libnut-core) 用于跨平台的原生键盘和鼠标控制。
- [Puppeteer](https://github.com/puppeteer/puppeteer) 用于浏览器自动化与控制。
- [Playwright](https://github.com/microsoft/playwright) 用于浏览器自动化与控制和测试。

## 📖 引用

如果您在研究或项目中使用了 Midscene.js，请引用：

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: Your AI Operator for Web, Android, iOS, Automation & Testing.},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/web-infra-dev/midscene}
}
```

## ✨ Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=web-infra-dev/midscene&type=Date)](https://www.star-history.com/#web-infra-dev/midscene&Date)

## 📝 授权许可

Midscene.js 遵循 [MIT 许可协议](https://github.com/web-infra-dev/midscene/blob/main/LICENSE)。

---

<div align="center">
  如果本项目对你有帮助或启发，请给我们一个 star
</div>
