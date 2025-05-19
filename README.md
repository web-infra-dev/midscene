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
  <a href="https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B"><img src="https://img.shields.io/badge/%F0%9F%A4%97-UI%20TARS%20Models-yellow" alt="huagging face model" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/2JyBHxszE4"><img src="https://img.shields.io/discord/1328277792730779648?style=flat-square&color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai?style=flat-square" alt="twitter" /></a>
  <a href="https://deepwiki.com/web-infra-dev/midscene">
    <img alt="Ask DeepWiki.com" src="https://devin.ai/assets/deepwiki-badge.png" style="height: 18px; vertical-align: middle;">
  </a>
</p>

Midscene.js allows AI to serve as your web and Android operator 🤖. Simply describe what you want to achieve in natural language, and it will assist you in operating the interface, validating content, and extracting data. Whether you seek a quick experience or in-depth development, you'll find it easy to get started.

## Showcases

| Instruction  | Video |
| :---:  | :---: |
| Post a Tweet (By UI-TARS model)      |    <video src="https://github.com/user-attachments/assets/bb3d695a-fbff-4af1-b6cc-5e967c07ccee" height="300" />    |
| Use JS code to drive task orchestration, collect information about Jay Chou's concert, and write it into Google Docs (By UI-TARS model)   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |
| Control Maps App on Android (By Qwen-2.5-VL model)   | <video src="https://github.com/user-attachments/assets/1f5bab0e-4c28-44e1-b378-a38809b05a00" height="300" />        |
| Using midscene mcp to browse the page (https://www.saucedemo.com/), perform login, add products, place orders, and finally generate test cases based on mcp execution steps and playwright example | <video src="https://github.com/user-attachments/assets/5cab578d-feb3-4250-8c7e-6793fe38a5be" height="300" />        |

## 📢 2025 Feb: New open-source model choice - UI-TARS and Qwen2.5-VL

Besides the default model *GPT-4o*, we have added two new recommended open-source models to Midscene.js: *UI-TARS* and *Qwen2.5-VL*. (Yes, Open Source models !) They are dedicated models for image recognition and UI automation, which are known for performing well in UI automation scenarios. Read more about it in [Choose a model](https://midscenejs.com/choose-a-model).

## 💡 Features
- **Natural Language Interaction 👆**: Just describe your goals and steps, and Midscene will plan and operate the user interface for you.
- **UI Automation 🤖**
  - **Web Automation 🖥️**: Start in-browser experience immediately through [the Chrome extension](https://midscenejs.com/quick-experience.html), or integrate with [Puppeteer](https://midscenejs.com/integrate-with-puppeteer.html) and [Playwright](https://midscenejs.com/integrate-with-playwright.html).
  - **Android Automation 📱**: Use [the Android playground](https://midscenejs.com/quick-experience-with-android.html) to start experience immediately, or integrate javascript SDK with [adb](https://midscenejs.com/integrate-with-android.html).
- **MCP Integration 🔗**: Allows other MCP Clients to directly use Midscene's capabilities. For more details, please read [MCP Integration](https://midscenejs.com/zh/mcp.html).
- **Visual Reports for Debugging 🎞️**: Through our test reports and Playground, you can easily understand, replay and debug the entire process.
- **Support Caching 🔄**: The first time you execute a task through AI, it will be cached, and subsequent executions of the same task will significantly improve execution efficiency.
- **Completely Open Source 🔥**: Experience a whole new automation development experience, enjoy!
- **Understand UI, JSON Format Responses 🔍**: You can specify data format requirements and receive responses in JSON format.
- **Intuitive Assertions 🤔**: Express your assertions in natural language, and AI will understand and process them.

## ✨ Model Choices

You can use multimodal LLMs like `gpt-4o`, or visual-language models like `Qwen2.5-VL`, `gemini-2.5-pro` and `UI-TARS`. In which `UI-TARS` is an open-source model dedicated for UI automation.

Read more about [Choose a model](https://midscenejs.com/choose-a-model)

## 👀 Comparing to ...

There are so many UI automation tools out there, and each one seems to be all-powerful. What's special about Midscene.js?

* Debugging Experience: You will soon realize that debugging and maintaining automation scripts is the real challenge. No matter how magical the demo looks, ensuring stability over time requires careful debugging. Midscene.js offers a visualized report file, a built-in playground, and a Chrome Extension to simplify the debugging process. These are the tools most developers truly need, and we're continually working to improve the debugging experience.

* Open Source, Free, Deploy as you want: Midscene.js is an open-source project. It's decoupled from any cloud service and model provider, you can choose either public or private deployment. There is always a suitable plan for your business.

* Integrate with Javascript: You can always bet on Javascript 😎

## 📄 Resources 

* [Home Page: https://midscenejs.com](https://midscenejs.com/)
* Web Browser Automation
  * [Quick Experience By Chrome Extension](https://midscenejs.com/quick-experience.html)
  * [Automate with Scripts in YAML](https://midscenejs.com/automate-with-scripts-in-yaml.html)
  * [Bridge Mode by Chrome Extension](https://midscenejs.com/bridge-mode-by-chrome-extension.html)
  * [Integrate with Puppeteer](https://midscenejs.com/integrate-with-puppeteer.html)
  * [Integrate with Playwright](https://midscenejs.com/integrate-with-playwright.html)
* Android Automation
  * [Quick Experience by Android Playground](https://midscenejs.com/quick-experience-with-android.html)
  * [Integrate with Android(adb)](https://midscenejs.com/integrate-with-android.html)
* [API Reference](https://midscenejs.com/api.html)
* [Choose a model](https://midscenejs.com/choose-a-model.html)
* [Config Model and Provider](https://midscenejs.com/model-provider.html)

## 🤝 Community

* [Discord](https://discord.gg/2JyBHxszE4)
* [Follow us on X](https://x.com/midscene_ai)
* [Lark Group](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d)


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

## Citation

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
