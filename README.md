<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

English | [简体中文](./README.zh.md)

</div>

<p align="center">
  Your AI Operator for Web, Android, Automation & Testing
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

## Showcases

| Instruction  | Video |
| :---:  | :---: |
| Use JS code to drive task orchestration, collect information about Jay Chou's concert, and write it into Google Docs (By UI-TARS model)   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |
| Control Maps App on Android (By Qwen-2.5-VL model)   | <video src="https://github.com/user-attachments/assets/1f5bab0e-4c28-44e1-b378-a38809b05a00" height="300" />        |
| Using midscene mcp to browse the page (https://www.saucedemo.com/), perform login, add products, place orders, and finally generate test cases based on mcp execution steps and playwright example | <video src="https://github.com/user-attachments/assets/a95ca353-e50c-4091-85ba-e542f576b6be" height="300" />   |

## 💡 Features

### Write Automation with Natural Language
- Describe your goals and steps, and Midscene will plan and operate the user interface for you.
- Use Javascript SDK or YAML to write your automation script.

### Web & Mobile App
- **Web Automation 🖥️**: Either integrate with [Puppeteer](https://midscenejs.com/integrate-with-puppeteer.html), [Playwright](https://midscenejs.com/integrate-with-playwright.html) or use [Bridge Mode](https://midscenejs.com/bridge-mode-by-chrome-extension.html) to control your desktop browser.
- **Android Automation 📱**: Use [Javascript SDK](https://midscenejs.com/integrate-with-android.html) with adb to control your local Android device.

### Tools
- **Visual Reports for Debugging 🎞️**: Through our test reports and Playground, you can easily understand, replay and debug the entire process.
- [**Caching for Efficiency 🔄**](https://midscenejs.com/caching.html): Replay your script with cache and get the result faster.
- [**MCP 🔗**](https://midscenejs.com/mcp.html): Allows other MCP Clients to directly use Midscene's capabilities.

### Three kinds of APIs
- [Interaction API 🔗](https://midscenejs.com/api.html#interaction-methods): interact with the user interface.
- [Data Extraction API 🔗](https://midscenejs.com/api.html#data-extraction): extract data from the user interface and dom.
- [Utility API 🔗](https://midscenejs.com/api.html#more-apis): utility functions like `aiAssert()`, `aiLocate()`, `aiWaitFor()`.

## 👉 Zero-code Quick Experience

- **[Chrome Extension](https://midscenejs.com/quick-experience.html)**: Start in-browser experience immediately through [the Chrome Extension](https://midscenejs.com/quick-experience.html), without writing any code.
- **[Android Playground](https://midscenejs.com/quick-experience-with-android.html)**: There is also a built-in Android playground to control your local Android device.

## ✨ Model Choices

Midscene.js supports both multimodal LLMs like `gpt-4o`, and visual-language models like `Qwen2.5-VL`, `Doubao-1.5-thinking-vision-pro`, `gemini-2.5-pro` and `UI-TARS`. 

Visual-language models are recommended for UI automation.

Read more about [Choose a model](https://midscenejs.com/choose-a-model)

## 💡 Two Styles of Automation

### Auto Planning

Midscene will automatically plan the steps and execute them. It may be slower and heavily rely on the quality of the AI model.

```javascript
await aiAction('click all the records one by one. If one record contains the text "completed", skip it');
```

### Workflow Style

Split complex logic into multiple steps to improve the stability of the automation code.

```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

> For more details about the workflow style, please refer to [Blog - Use JavaScript to Optimize the AI Automation Code](https://midscenejs.com/blog-programming-practice-using-structured-api.html)


## 👀 Comparing to other projects

There are so many UI automation tools out there, and each one seems to be all-powerful. What's special about Midscene.js?

* **Debugging Experience**: You will soon realize that debugging and maintaining automation scripts is the real challenge. No matter how magical the demo looks, ensuring stability over time requires careful debugging. Midscene.js offers a visualized report file, a built-in playground, and a Chrome Extension to simplify the debugging process. These are the tools most developers truly need, and we're continually working to improve the debugging experience.

* **Open Source, Free, Deploy as you want**: Midscene.js is an open-source project. It's decoupled from any cloud service and model provider, you can choose either public or private deployment. There is always a suitable plan for your business.

* **Integrate with Javascript**: You can always bet on Javascript 😎

## 📄 Resources 

* Home Page and Documentation: [https://midscenejs.com](https://midscenejs.com/)
* API Reference: [https://midscenejs.com/api.html](https://midscenejs.com/api.html)
* GitHub: [https://github.com/web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)

## 🤝 Community

* [Discord](https://discord.gg/2JyBHxszE4)
* [Follow us on X](https://x.com/midscene_ai)
* [Lark Group(飞书交流群)](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d)


## 📝 Credits

We would like to thank the following projects:

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) for the build tool.
- [UI-TARS](https://github.com/bytedance/ui-tars) for the open-source agent model UI-TARS.
- [Qwen2.5-VL](https://github.com/QwenLM/Qwen2.5-VL) for the open-source VL model Qwen2.5-VL.
- [scrcpy](https://github.com/Genymobile/scrcpy) and [yume-chan](https://github.com/yume-chan) allow us to control Android devices with browser.
- [appium-adb](https://github.com/appium/appium-adb) for the javascript bridge of adb.
- [YADB](https://github.com/ysbing/YADB) for the yadb tool which improves the performance of text input.
- [Puppeteer](https://github.com/puppeteer/puppeteer) for browser automation and control.
- [Playwright](https://github.com/microsoft/playwright) for browser automation and control and testing.

## 📝 Citation

If you use Midscene.js in your research or project, please cite:

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: Your AI Operator for Web, Android, Automation & Testing.},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/web-infra-dev/midscene}
}
```


## 📝 License

Midscene.js is [MIT licensed](https://github.com/web-infra-dev/midscene/blob/main/LICENSE).

---

<div align="center">
  If this project helps you or inspires you, please give us a ⭐️
</div>
