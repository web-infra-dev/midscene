<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

English | [简体中文](./README.zh.md)

</div>

<p align="center">
  Your AI Operator for Web, Android, Automation & Testing.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B"><img src="https://img.shields.io/badge/%F0%9F%A4%97-UI%20TARS%20Models-yellow" alt="huagging face model" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/2JyBHxszE4"><img src="https://img.shields.io/discord/1328277792730779648?style=flat-square&color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai?style=flat-square" alt="twitter" /></a>
</p>

Midscene.js allows AI to serve as your web and Android operator 🤖. Simply describe what you want to achieve in natural language, and it will assist you in operating the interface, validating content, and extracting data. Whether you seek a quick experience or in-depth development, you'll find it easy to get started.

## Showcases

The following recorded example video is based on the [UI-TARS-1.5-7B](https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B) model, and the video has not been sped up at all~

| Instruction  | Video |
| :---:  | :---: |
| Post a Tweet      |    <video src="https://github.com/user-attachments/assets/bb3d695a-fbff-4af1-b6cc-5e967c07ccee" height="300" />    |
| Use JS code to drive task orchestration, collect information about Jay Chou's concert, and write it into Google Docs   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |

## 📢 2025 Feb: New open-source model choice - UI-TARS and Qwen2.5-VL

Besides the default model *GPT-4o*, we have added two new recommended open-source models to Midscene.js: *UI-TARS* and *Qwen2.5-VL*. (Yes, Open Source models !) They are dedicated models for image recognition and UI automation, which are known for performing well in UI automation scenarios. Read more about it in [Choose a model](https://midscenejs.com/choose-a-model).


## 💡 Features
- **Natural Language Interaction 👆**: Just describe your goals and steps, and Midscene will plan and operate the user interface for you.
- **Chrome Extension Experience 🖥️**: Start in-browser experience immediately through the Chrome extension, no coding required.
- **Puppeteer/Playwright Integration 🔧**: Supports Puppeteer and Playwright integration, allowing you to combine AI capabilities with these powerful automation tools for easy automation.
- **Support Open-Source Models 🤖**: Supports private deployment of [`UI-TARS`](https://github.com/bytedance/ui-tars) and [`Qwen2.5-VL`](https://github.com/QwenLM/Qwen2.5-VL), which outperforms closed-source models like GPT-4o and Claude in UI automation scenarios while better protecting data security.
- **Support General Models 🌟**: Supports general large models like GPT-4o and Claude, adapting to various scenario needs.
- **Visual Reports for Debugging 🎞️**: Through our test reports and Playground, you can easily understand, replay and debug the entire process.
- **Support Caching 🔄**: The first time you execute a task through AI, it will be cached, and subsequent executions of the same task will significantly improve execution efficiency.
- **Completely Open Source 🔥**: Experience a whole new automation development experience, enjoy!
- **Understand UI, JSON Format Responses 🔍**: You can specify data format requirements and receive responses in JSON format.
- **Intuitive Assertions 🤔**: Express your assertions in natural language, and AI will understand and process them.

## ✨ Model Choices

- You can use general-purpose LLMs like `gpt-4o`, it works well for most cases. And also, `gemini-1.5-pro`, `qwen-vl-max-latest` are supported.
- You can also use [`UI-TARS`](https://github.com/bytedance/ui-tars) model, which is an **open-source model** dedicated for UI automation. You can deploy it on your own server, and it will dramatically improve the performance and data privacy. 
- Read more about [Choose a model](https://midscenejs.com/choose-a-model)

## 👀 Comparing to ...

There are so many UI automation tools out there, and each one seems to be all-powerful. What's special about Midscene.js?

* Debugging Experience: You will soon find that debugging and maintaining automation scripts is the real challenge point. No matter how magic the demo is, you still need to debug the process to make it stable over time. Midscene.js offers a visualized report file, a built-in playground, and a Chrome Extension to debug the entire process. This is what most developers really need. And we're continuing to work on improving the debugging experience.

* Open Source, Free, Deploy as you want: Midscene.js is an open-source project. It's decoupled from any cloud service and model provider, you can choose either public or private deployment. There is always a suitable plan for your business.

* Integrate with Javascript: You can always bet on Javascript 😎

## 📄 Resources 

* [Home Page: https://midscenejs.com](https://midscenejs.com/)
* Web Browser Automation
  * [Quick Experience By Chrome Extension](https://midscenejs.com/quick-experience.html), this is where you should get started 
  * [Automate with Scripts in YAML](https://midscenejs.com/automate-with-scripts-in-yaml.html), use this if you prefer to write YAML file instead of code
  * [Bridge Mode by Chrome Extension](https://midscenejs.com/bridge-mode-by-chrome-extension.html), use this to control the desktop Chrome by scripts
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

## Citation

If you use Midscene.js in your research or project, please cite:

```bibtex
@software{Midscene.js,
  author = {Zhou, Xiao and Yu, Tao},
  title = {Midscene.js: Let AI be your browser operator.},
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
