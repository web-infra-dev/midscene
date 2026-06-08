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
  开源、视觉驱动的 UI 测试——用自然语言编写测试用例，自动化任意平台。
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

## 💡 为什么选择 Midscene

大多数 UI 自动化——包括读取 DOM 或无障碍树的 AI 工具——都依赖页面结构。而页面结构既脆弱又不完整：选择器一重构就失效，缺少语义化标注的元素（纯图标按钮、自定义控件、`<canvas>`）对它们“看不见”，原生应用与跨域 iframe 更是够不到，也无法判断界面实际看起来是否正确。Midscene 仅凭截图工作，你只需用自然语言描述每一步：

- **更低的维护成本** —— UI 变化时无需再追着改选择器。
- **触达每个元素与界面** —— 只要人眼能看到，Midscene 就能定位，哪怕元素没有语义化标注，或位于 `<canvas>`、原生应用、跨域 iframe 上。
- **校验用户真正看到的效果** —— 验证颜色、高亮、布局与渲染状态，而不只是判断 DOM 节点是否存在。
- **两种测试方式** —— 接入你的 [Playwright](https://midscenejs.com/zh/integrate-with-playwright) / Vitest 测试，或让 AI Agent 通过 [Skills](https://midscenejs.com/zh/skills) 与 [MCP](https://midscenejs.com/zh/mcp) 自主测试。

Midscene 首先为 UI 测试而生，但同一套视觉驱动引擎也能胜任任意 UI 自动化任务。

## 💡 能自动化什么

只要能截图，Midscene 就能工作——Web 浏览器、Android、iOS、HarmonyOS、桌面应用，以及[任意自定义界面](https://midscenejs.com/zh/integrate-with-any-interface)，全部通过同一套 API。你可以用 JavaScript SDK 或 YAML 编写自动化，通过 [Skills](https://midscenejs.com/zh/skills) 与 [MCP](https://midscenejs.com/zh/mcp) 交给 AI Agent，并在 [API 参考](https://midscenejs.com/zh/api) 中查阅 `aiAct`、`aiQuery`、`aiAssert` 等所有方法。

## 🚀 开始使用

- **几分钟写出第一个脚本** —— [快速开始](https://midscenejs.com/zh/quick-start)。
- **想零代码？** 用 [Chrome 插件](https://midscenejs.com/zh/quick-experience) 在任意网页上直接体验。
- **其他平台** —— [Android](https://midscenejs.com/zh/android-getting-started)、[iOS](https://midscenejs.com/zh/ios-getting-started)、[HarmonyOS](https://midscenejs.com/zh/harmony-getting-started) 与[桌面端](https://midscenejs.com/zh/computer-getting-started) 的上手指南。

## ✨ 多模态模型驱动

Midscene 在 UI 操作上完全采用纯视觉路线：元素定位仅基于截图。它支持 `Qwen3.x`、`Doubao-Seed-2.0`、`GLM-4.6V`、`gemini-3.5-flash`、`UI-TARS` 等具备极强 UI 定位能力的多模态模型，也包括可自托管的开源选项。在数据提取与页面理解场景中，你仍可按需选择携带 DOM。

阅读更多：[模型策略](https://midscenejs.com/zh/model-strategy)。



## 📄 资源

* 文档: [https://midscenejs.com/zh](https://midscenejs.com/zh)
* 示例项目: [midscene-example](https://github.com/web-infra-dev/midscene-example)
* API 参考: [https://midscenejs.com/zh/api](https://midscenejs.com/zh/api)

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
