<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

[English](./README.md) | 简体中文

</div>

<p align="center">
  开源的 AI 操作助手，适用于 Web、移动端、自动化和测试
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

## 案例

| 指令  | 视频 |
| :---:  | :---: |
| 用 JS 代码驱动编排任务，搜集周杰伦演唱会的信息，并写入 Google Docs   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |
| 控制地图 App 在 Android 上导航到目的地   | <video src="https://github.com/user-attachments/assets/1f5bab0e-4c28-44e1-b378-a38809b05a00" height="300" />        |
|  使用 midscene mcp 的方法，浏览页面（ https://www.saucedemo.com/ ），进行登录，添加商品、下单商品最终根据 mcp 执行的步骤和 playwright example 生成最终的测试用例   | <video src="https://github.com/user-attachments/assets/5cab578d-feb3-4250-8c7e-6793fe38a5be" height="300" />        |

## 💡 特性

### 用自然语言编写自动化脚本
- 描述你的目标和步骤，Midscene 会为你规划和操作用户界面。
- 使用 Javascript SDK 或 YAML 格式编写自动化脚本。

### Web & Mobile App
- **Web 自动化 🖥️**: 可以[与 Puppeteer 集成](https://midscenejs.com/integrate-with-puppeteer.html)，[与 Playwright 集成](https://midscenejs.com/integrate-with-playwright.html)或使用[桥接模式](https://midscenejs.com/bridge-mode-by-chrome-extension.html)来控制桌面浏览器。
- **Android 自动化 📱**: 使用 [Javascript SDK](https://midscenejs.com/integrate-with-android.html) 配合 adb 来控制本地 Android 设备。

### 工具
- **用于调试的可视化报告 🎞️**: 通过我们的测试报告和 Playground，你可以轻松理解、回放和调试整个过程。
- [**使用缓存，提高执行效率 🔄**](https://midscenejs.com/zh/caching.html): 使用缓存能力重放脚本，提高执行效率。
- [**MCP 🔗**](https://midscenejs.com/zh/mcp.html): 允许其他 MCP Client 直接使用 Midscene 的能力。

### 三种类型的 API
  - [**交互 API 🔗**](https://midscenejs.com/zh/api.html#interaction-methods): 与用户界面交互。
  - [**数据提取 API 🔗**](https://midscenejs.com/zh/api.html#data-extraction): 从用户界面和 DOM 中提取数据。
  - [**实用 API 🔗**](https://midscenejs.com/zh/api.html#more-apis): 实用函数，如 `aiAssert()` （断言）, `aiLocate()` （定位）, `aiWaitFor()` （等待）。

## 👉 无需代码，快速体验

- **[Chrome 插件](https://midscenejs.com/zh/quick-experience.html)**: 通过 [Chrome 插件](https://midscenejs.com/zh/quick-experience.html) 立即开始体验，无需编写代码。
- **[Android Playground](https://midscenejs.com/zh/quick-experience-with-android.html)**: 内置的 Android Playground 可以控制你的本地 Android 设备。

## ✨ 选择 AI 模型

Midscene.js 支持多模态 LLM 模型，如 `gpt-4o`，以及视觉语言模型，如 `Qwen2.5-VL`，`gemini-2.5-pro` 和 `UI-TARS`。

视觉语言模型是 UI 自动化场景的首选。

更多信息请查看 [选择 AI 模型](https://midscenejs.com/zh/choose-a-model)。

## 💡 两种风格的自动化

### 自动规划

Midscene 会自动规划步骤并执行。它可能较慢，并且深度依赖于 AI 模型的质量。

```javascript
await aiAction('click all the records one by one. If one record contains the text "completed", skip it');
```

### 工作流风格

将复杂逻辑拆分为多个步骤，以提高自动化代码的稳定性。

```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

> 有关工作流风格的更多详细信息，请参阅 [Blog - 使用 JavaScript 优化 AI 自动化代码
](https://midscenejs.com/zh/blog-programming-practice-using-structured-api.html)


## 👀 与其它工具比较

* **调试体验**: 你很快就会发现，调试和维护自动化脚本才是真正的痛点。无论模型多么强大，你仍然需要调试过程以确保其保持长期稳定。Midscene.js 提供了可视化报告、内置的 Playground 和 Chrome 插件，以调试整个运行过程。这是大多数开发者真正需要的特性，我们也在持续努力改进调试体验。

* **开源、免费、部署灵活**: Midscene.js 是一个开源项目。它与云服务和模型提供商解耦，你可以选择公共或私有部署。总会有一个适合你的方案。

* **与 Javascript 集成**: 你可以永远相信 Javascript 😎

## 📄 资源

* 官网和文档: [https://midscenejs.com](https://midscenejs.com/zh)
* API 文档: [https://midscenejs.com/zh/api.html](https://midscenejs.com/zh/api.html)
* GitHub: [https://github.com/web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)

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
- [Puppeteer](https://github.com/puppeteer/puppeteer) 用于浏览器自动化与控制。
- [Playwright](https://github.com/microsoft/playwright) 用于浏览器自动化与控制和测试。

## 📝 引用

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
