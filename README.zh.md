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
  视觉模型驱动，支持全平台 UI 自动化
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B"><img src="https://img.shields.io/badge/UI%20TARS%20Models-yellow" alt="hugging face model" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <a href="https://github.com/web-infra-dev/midscene/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/2JyBHxszE4"><img src="https://img.shields.io/discord/1328277792730779648?style=flat-square&color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai?style=flat-square" alt="twitter" /></a>
  <a href="https://deepwiki.com/web-infra-dev/midscene">
    <img alt="Ask DeepWiki.com" src="https://devin.ai/assets/deepwiki-badge.png" style="height: 18px; vertical-align: middle;" />
  </a>
</p>

## 📣 Midscene Skills 已上线！

使用 [Midscene Skills](https://github.com/web-infra-dev/midscene-skills) 搭配 [OpenClaw](https://github.com/OpenClaw/OpenClaw) 控制任意平台

## 案例

* [Web 自动化 - 在浏览器中自动注册 GitHub 表单并通过所有字段校验](https://midscenejs.com/zh/showcases#web)
* [iOS 自动化 - 美团下单咖啡](https://midscenejs.com/zh/showcases#ios)
* [iOS 自动化 - 自动点赞 @midscene_ai 的第一条推文](https://midscenejs.com/zh/showcases#ios)
* [Android 自动化 - 懂车帝：查看小米 SU7 参数](https://midscenejs.com/zh/showcases#android)
* [Android 自动化 - 预订圣诞节酒店](https://midscenejs.com/zh/showcases#android)
* [MCP 集成 - Midscene MCP UI prepatch 版本发布](https://midscenejs.com/zh/showcases#mcp)
* [车机测试中的机械臂 + 视觉 + 语音方案](https://midscenejs.com/zh/showcases#community-showcases)

## 💡 特性

### 用自然语言编写自动化
- 描述你的目标和步骤，Midscene 会为你规划并操作用户界面。
- 使用 Javascript SDK 或 YAML 编写自动化脚本。

### Web + 移动 App + 任意界面
- **Web 自动化**: 可与 [Puppeteer](https://midscenejs.com/zh/integrate-with-puppeteer)、[Playwright](https://midscenejs.com/zh/integrate-with-playwright) 集成，或使用 [Bridge Mode](https://midscenejs.com/zh/bridge-mode) 控制桌面浏览器。
- **Android 自动化**: 使用 [Javascript SDK](https://midscenejs.com/zh/android-getting-started) 搭配 adb 控制本地 Android 设备。
- **iOS 自动化**: 使用 [Javascript SDK](https://midscenejs.com/zh/ios-getting-started) 搭配 WebDriverAgent 控制本地 iOS 设备与模拟器。
- **任意界面自动化**: 使用 [Javascript SDK](https://midscenejs.com/zh/integrate-with-any-interface) 控制你自己的界面。

### 面向开发者
- **三类 API**:
  - [交互 API](https://midscenejs.com/zh/api#interaction-methods): 与用户界面交互。
  - [数据提取 API](https://midscenejs.com/zh/api#data-extraction): 从用户界面与 DOM 中提取数据。
  - [工具 API](https://midscenejs.com/zh/api#more-apis): `aiAssert()`、`aiLocate()`、`aiWaitFor()` 等实用函数。
- **MCP**: Midscene 提供 MCP 服务，将 Midscene Agent 的原子操作暴露为 MCP 工具，让上层 Agent 可以用自然语言检查和操作 UI。[文档](https://midscenejs.com/zh/mcp)
- [**缓存加速**](https://midscenejs.com/zh/caching): 通过缓存回放脚本，更快得到结果。
- **调试体验**: Midscene.js 提供可视化回放报告、内置 playground 和 Chrome 插件，简化调试流程。这些正是开发者真正需要的工具。


## 👉 零代码快速体验

- **[Chrome 插件](https://midscenejs.com/zh/quick-experience)**: 通过 [Chrome 插件](https://midscenejs.com/zh/quick-experience) 立刻在浏览器内体验，无需编写代码。
- **[Android Playground](https://midscenejs.com/zh/android-getting-started)**: 内置 Android playground，可控制本地 Android 设备。
- **[iOS Playground](https://midscenejs.com/zh/ios-getting-started)**: 内置 iOS playground，可控制本地 iOS 设备。

## ✨ 视觉语言模型驱动

Midscene.js 在 UI 操作上完全采用纯视觉路线：元素定位与交互仅基于截图。它支持 `Qwen3-VL`、`Doubao-1.6-vision`、`gemini-3-pro`、`UI-TARS` 等视觉语言模型。在数据提取与页面理解场景中，你仍可按需选择携带 DOM。

* UI 操作使用纯视觉定位；不再保留 DOM 提取模式。
* 支持 Web、移动端、桌面端，甚至 `<canvas>` 场景。
* UI 操作跳过 DOM，token 更少，成本更低，速度更快。
* 数据提取与页面理解场景仍可按需带上 DOM。
* 支持强大的开源模型自托管方案。

阅读更多：[模型策略](https://midscenejs.com/zh/model-strategy)



## 📄 资源

* 官网: [https://midscenejs.com](https://midscenejs.com/)
* 文档: [https://midscenejs.com/zh](https://midscenejs.com/zh)
* 示例项目: [https://github.com/web-infra-dev/midscene-example](https://github.com/web-infra-dev/midscene-example)
* API 参考: [https://midscenejs.com/zh/api](https://midscenejs.com/zh/api)
* GitHub: [https://github.com/web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)

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
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) 提供开源视觉语言模型 Qwen-VL。
- [scrcpy](https://github.com/Genymobile/scrcpy) 与 [yume-chan](https://github.com/yume-chan) 让我们能在浏览器中控制 Android 设备。
- [appium-adb](https://github.com/appium/appium-adb) 提供 adb 的 Javascript 桥接。
- [appium-webdriveragent](https://github.com/appium/WebDriverAgent) 提供 Javascript 操作 XCTest 能力。
- [YADB](https://github.com/ysbing/YADB) 提供 yadb 工具以提升文本输入性能。
- [libnut-core](https://github.com/nut-tree/libnut-core) 提供跨平台原生键鼠控制。
- [Puppeteer](https://github.com/puppeteer/puppeteer) 提供浏览器自动化与控制能力。
- [Playwright](https://github.com/microsoft/playwright) 提供浏览器自动化、控制与测试能力。

## 📖 引用

如果你在研究或项目中使用了 Midscene.js，请引用：

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: Your AI Operator for Web, Android, iOS, Automation & Testing.},
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
