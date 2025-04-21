<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

[English](./README.md) | 简体中文

</div>

<p align="center">
  你的 AI 操作助手，适用于 Web、Android、自动化和测试
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B"><img src="https://img.shields.io/badge/%F0%9F%A4%97-UI%20TARS%20Models-yellow" alt="huagging face model" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/2JyBHxszE4"><img src="https://img.shields.io/discord/1328277792730779648?style=flat-square&color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai?style=flat-square" alt="twitter" /></a>
</p>

Midscene.js 是一个 AI 操作助手，适用于 Web、Android、自动化和测试。只需用自然语言描述你想做什么，它就能帮你操作网页、验证内容，并提取数据。无论你是想快速体验还是深度开发，都可以轻松上手。

## 案例

| 指令  | 视频 |
| :---:  | :---: |
| 发布一条 Twitter      |    <video src="https://github.com/user-attachments/assets/bb3d695a-fbff-4af1-b6cc-5e967c07ccee" height="300" />    |
| 用 JS 代码驱动编排任务，搜集周杰伦演唱会的信息，并写入 Google Docs   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |
| 控制地图 App 在 Android 上导航到目的地   | <video src="https://github.com/user-attachments/assets/1f5bab0e-4c28-44e1-b378-a38809b05a00" height="300" />        |

## 📢 2025 年 4 月：新增支持 Android 自动化

你可以在 Android 设备上使用视觉语言 AI 模型来控制设备，并利用 Midscene.js 的强大功能。只需连接 adb 即可实现这一功能。了解更多详情，请阅读 [博客：支持 Android 自动化](https://midscenejs.com/zh/blog-support-android-automation.html)。

## 📢 新增支持开源模型 - UI-TARS 和 Qwen2.5-VL（千问）

除了默认的 *GPT-4o* 模型之外，我们还为 Midscene.js 添加了两个全新推荐的开源模型：*UI-TARS* 和 *Qwen2.5-VL*。（没错，全都是开源模型！）它们是专门用于图像识别和 UI 自动化的模型，在 UI 自动化场景中表现尤为出色。了解更多详情，请阅读 [选择模型](https://midscenejs.com/choose-a-model)。

## 💡 特性

- **自然语言互动 👆**：只需描述你的目标和步骤，Midscene 会为你规划和操作用户界面。
- **UI 自动化 🤖**
  - **Web 自动化 🖥️**：通过 [Chrome 插件](https://midscenejs.com/zh/quick-experience.html)，你可以立即开始体验，无需编写代码。
  - **Android 自动化 📱**：使用 [Android Playground](https://midscenejs.com/zh/quick-experience-with-android.html) 快速体验，或使用 javascript SDK 与 [adb](https://midscenejs.com/zh/integrate-with-android.html) 集成。
- **用可视化报告来调试 🎞️**：通过我们的测试报告和 Playground，你可以轻松理解、回放和调试整个过程。
- **支持缓存 🔄**：首次通过 AI 执行后任务会被缓存，后续执行相同任务时可显著提升执行效率。
- **完全开源 🔥**：体验全新的自动化开发体验，尽情享受吧！
- **理解UI、JSON格式回答 🔍**：你可以提出关于数据格式的要求，然后得到 JSON 格式的预期回应。
- **直观断言 🤔**：用自然语言表达你的断言，AI 会理解并处理。

## ✨ 选择 AI 模型 

你可以使用多模态 LLM 模型，如 `gpt-4o`，或者视觉语言模型，如 `Qwen2.5-VL`，`gemini-2.5-pro` 和 `UI-TARS`。其中 `UI-TARS` 是一个专为 UI 自动化设计的大模型。

更多信息请查看 [选择 AI 模型](https://midscenejs.com/zh/choose-a-model)。

## 👀 与其他工具比较

业界的 UI 自动化工具层出不穷，每个 Demo 都看起来很科幻。Midscene.js 有什么特别之处？

* 调试体验：你很快就会发现，调试和维护自动化脚本才是真正的痛点。无论模型多么强大，你仍然需要调试过程以确保其保持长期稳定。Midscene.js 提供了可视化报告、内置的 Playground 和 Chrome 插件，以调试整个运行过程。这是大多数开发者真正需要的特性，我们也在持续努力改进调试体验。

* 开源、免费、部署灵活：Midscene.js 是一个开源项目。它与云服务和模型提供商解耦，你可以选择公共或私有部署。总会有一个适合你的计划。

* 与 Javascript 集成：你可以永远相信 Javascript 😎

## 📄 资源

* [官网首页: https://midscenejs.com](https://midscenejs.com/zh)
* Web 浏览器自动化
  * [使用 Chrome 插件体验](https://midscenejs.com/zh/quick-experience.html)
  * [使用 YAML 格式的自动化脚本](https://midscenejs.com/zh/automate-with-scripts-in-yaml.html)
  * [使用 Chrome 插件桥接模式（Bridge Mode）](https://midscenejs.com/zh/bridge-mode-by-chrome-extension.html)
  * [与 Puppeteer 集成](https://midscenejs.com/zh/integrate-with-puppeteer.html)
  * [与 Playwright 集成](https://midscenejs.com/zh/integrate-with-playwright.html)
* Android 自动化
  * [使用 Android Playground 快速体验](https://midscenejs.com/zh/quick-experience-with-android.html)
  * [与 Android(adb) 集成](https://midscenejs.com/zh/integrate-with-android.html)
* [API 文档](https://midscenejs.com/zh/api.html)
* [选择 AI 模型](https://midscenejs.com/zh/choose-a-model.html)
* [配置模型和服务商（e.g. 使用千问模型）](https://midscenejs.com/zh/model-provider.html)

## 🤝 社区

* [飞书交流群](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d)
* [Discord](https://discord.gg/2JyBHxszE4)
* [Follow us on X](https://x.com/midscene_ai)

  <img src="https://github.com/user-attachments/assets/211b05c9-3ccd-4f52-b798-f3a7f51330ed" alt="lark group link" width="300" />

## 📝 致谢

我们感谢以下项目：

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) 用于构建工具。
- [UI-TARS](https://github.com/bytedance/ui-tars) 用于开源的 AI 模型 UI-TARS。
- [Qwen2.5-VL](https://github.com/QwenLM/Qwen2.5-VL) 用于开源的视觉语言模型 Qwen2.5-VL。
- [scrcpy](https://github.com/Genymobile/scrcpy) 和 [yume-chan](https://github.com/yume-chan) 允许我们使用浏览器控制 Android 设备。
- [appium-adb](https://github.com/appium/appium-adb) 用于 javascript 桥接 adb。
- [YADB](https://github.com/ysbing/YADB) 用于提高文本输入的兼容性。

## 引用

如果您在研究或项目中使用了 Midscene.js，请引用：

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: Your AI Operator for Web, Android, Automation & Testing.},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/web-infra-dev/midscene}
}
```


## 📝 授权许可

Midscene.js 遵循 [MIT 许可协议](https://github.com/web-infra-dev/midscene/blob/main/LICENSE)。


---

<div align="center">
  如果本项目对你有帮助或启发，请给我们一个 ⭐️
</div>
