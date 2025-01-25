<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

[English](./README.md) | 简体中文

</div>

<p align="center">
  让 AI 成为你的浏览器操作员
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" />
  <a href="https://huggingface.co/bytedance-research/UI-TARS-7B-SFT"><img src="https://img.shields.io/badge/%F0%9F%A4%97-UI%20TARS%20Models-yellow" alt="huagging face model" /></a>
  <img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/AFHJBdnn"><img src="https://img.shields.io/discord/1328277792730779648?color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai" alt="twitter" /></a>
</p>

Midscene.js 让 AI 成为你的浏览器操作员 🤖。只需用自然语言描述你想做什么，它就能帮你操作网页、验证内容，并提取数据。无论你是想快速体验还是深度开发，都可以轻松上手。如果您在项目中使用了 Midscene.js，可以加入我们的 [社区](https://github.com/web-infra-dev/midscene?tab=readme-ov-file#-community) 来与我们交流和分享。

## 案例

下面的录制 example 视频基于 [UI-TARS 7B SFT](https://huggingface.co/bytedance-research/UI-TARS-7B-SFT) 模型，视频没有任何加速～

| 指令  | 视频 |
| :---:  | :---: |
| 发布一条 Twitter      |    <video src="https://github.com/user-attachments/assets/bb3d695a-fbff-4af1-b6cc-5e967c07ccee" height="300" />    |
| 用 JS 代码驱动编排任务，搜集周杰伦演唱会的信息，并写入 Google Docs   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |



## 📢 支持了新的开源模型 - UI-TARS

从 v0.10.0 版本开始，我们支持了新的开源模型 [`UI-TARS`](https://github.com/bytedance/ui-tars)。更多信息请查看 [选择 AI 模型](https://midscenejs.com/zh/choose-a-model)。

## 💡 特性

- **自然语言互动 👆**：只需描述你的目标和步骤，Midscene 会为你规划和操作用户界面。
- **Chrome 插件体验 🖥️**：通过 Chrome 插件，你可以立即开始体验，无需编写代码。
- **Puppeteer/Playwright 集成 🔧**：支持 Puppeteer 和 Playwright 集成，让你能够结合 AI 能力和这些自动化工具的强大功能，轻松实现自动化操作。
- **支持私有化部署 🤖**：支持私有化部署 [`UI-TARS`](https://github.com/bytedance/ui-tars) 模型，相比 GPT-4o、Claude 等闭源模型，不仅在 UI 自动化场景下表现更加出色，还能更好地保护数据安全。
- **支持通用模型 🌟**：支持 GPT-4o、Claude 等通用大模型，适配多种场景需求。
- **用可视化报告来调试 🎞️**：通过我们的测试报告和 Playground，你可以轻松理解、回放和调试整个过程。
- **完全开源 🔥**：体验全新的自动化开发体验，尽情享受吧！
- **理解UI、JSON格式回答 🔍**：你可以提出关于数据格式的要求，然后得到 JSON 格式的预期回应。
- **直观断言 🤔**：用自然语言表达你的断言，AI 会理解并处理。

## ✨ 选择 AI 模型 

- 你可以使用通用的 LLM 模型，如 `gpt-4o`，它适用于大多数情况。同时，`gemini-1.5-pro` 和 `qwen-vl-max-latest`（千问）也是支持的。
- 你也可以使用 [`UI-TARS` 模型](https://github.com/bytedance/ui-tars) ，这是一个专为 UI 自动化设计的大模型。你可以私有化部署，以提高性能和数据隐私。
- 更多信息请查看 [选择 AI 模型](https://midscenejs.com/zh/choose-a-model)。

## 👀 与其他工具比较

业界的 UI 自动化工具层出不穷，每个 Demo 都看起来很科幻。Midscene.js 有什么特别之处？

* 调试体验：你很快就会发现，调试和维护自动化脚本才是真正的痛点。无论模型多么强大，你仍然需要调试过程以确保其保持长期稳定。Midscene.js 提供了可视化报告、内置的 Playground 和 Chrome 插件，以调试整个运行过程。这是大多数开发者真正需要的特性，我们也在持续努力改进调试体验。

* 开源、免费、部署灵活：Midscene.js 是一个开源项目。它与云服务和模型提供商解耦，你可以选择公共或私有部署。总会有一个适合你的计划。

* 与 Javascript 集成：你可以永远相信 Javascript 😎

## 📄 资源

* [官网首页: https://midscenejs.com](https://midscenejs.com/zh)
* [使用 Chrome 插件体验](https://midscenejs.com/zh/quick-experience.html)，请从这里开始体验 Midscene 
* 集成方案
  * [使用 YAML 格式的自动化脚本](https://midscenejs.com/zh/automate-with-scripts-in-yaml.html), 如果你更喜欢写 YAML 文件而不是代码
  * [使用 Chrome 插件桥接模式（Bridge Mode）](https://midscenejs.com/zh/bridge-mode-by-chrome-extension.html), 使用 Midscene 来控制桌面端 Chrome 
  * [集成到 Puppeteer](https://midscenejs.com/zh/integrate-with-puppeteer.html)
  * [集成到 Playwright](https://midscenejs.com/zh/integrate-with-playwright.html)
* [API 文档](https://midscenejs.com/zh/api.html)
* [选择 AI 模型](https://midscenejs.com/zh/choose-a-model.html)
* [配置模型和服务商（e.g. 使用千问模型）](https://midscenejs.com/zh/model-provider.html)

## 🤝 社区

* [飞书交流群](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d)
* [Discord](https://discord.gg/XEYR3tmZ)
* [Follow us on X](https://x.com/midscene_ai)

  <img src="https://github.com/user-attachments/assets/211b05c9-3ccd-4f52-b798-f3a7f51330ed" alt="lark group link" width="300" />

## 引用

如果您在研究或项目中使用了 Midscene.js，请引用：

```bibtex
@software{Midscene.js,
  author = {Zhou xiao, Yutao},
  title = {Midscene.js: Assign AI as your web operator.},
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
