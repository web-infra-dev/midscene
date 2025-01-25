<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

English | [简体中文](./README.zh.md)

</div>

<p align="center">
  Assign AI as your browser operator.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" />
  <a href="https://huggingface.co/bytedance-research/UI-TARS-7B-SFT"><img src="https://img.shields.io/badge/%F0%9F%A4%97-UI%20TARS%20Models-yellow" alt="huagging face model" /></a>
  <img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
  <a href="https://discord.gg/AFHJBdnn"><img src="https://img.shields.io/discord/1328277792730779648?style=flat-square&color=7289DA&label=Discord&logo=discord&logoColor=white" alt="discord" /></a>
  <a href="https://x.com/midscene_ai"><img src="https://img.shields.io/twitter/follow/midscene_ai?style=flat-square" alt="twitter" /></a>
</p>

Midscene.js lets AI be your browser operator 🤖.Just describe what you want to do in natural language, and it will help you operate web pages, validate content, and extract data. Whether you want a quick experience or deep development, you can get started easily.


## Showcases

The following recorded example video is based on the [UI-TARS 7B SFT](https://huggingface.co/bytedance-research/UI-TARS-7B-SFT) model, and the video has not been sped up at all~

| Instruction  | Video |
| :---:  | :---: |
| Post a Tweet      |    <video src="https://github.com/user-attachments/assets/bb3d695a-fbff-4af1-b6cc-5e967c07ccee" height="300" />    |
| Use JS code to drive task orchestration, collect information about Jay Chou's concert, and write it into Google Docs   | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" />        |


## 📢 New open-source model choice - UI-TARS 

From version v0.10.0, we support a new open-source model named [`UI-TARS`](https://github.com/bytedance/ui-tars). Read more about it in [Choose a model](https://midscenejs.com/choose-a-model).

## 💡 Features
- **Natural Language Interaction 👆**: Just describe your goals and steps, and Midscene will plan and operate the user interface for you.
- **Chrome Extension Experience 🖥️**: Start experiencing immediately through the Chrome extension, no coding required.
- **Puppeteer/Playwright Integration 🔧**: Supports Puppeteer and Playwright integration, allowing you to combine AI capabilities with these powerful automation tools for easy automation.
- **Support Private Deployment 🤖**: Supports private deployment of [`UI-TARS`](https://github.com/bytedance/ui-tars) model, which outperforms closed-source models like GPT-4o and Claude in UI automation scenarios while better protecting data security.
- **Support General Models 🌟**: Supports general large models like GPT-4o and Claude, adapting to various scenario needs.
- **Visual Reports for Debugging 🎞️**: Through our test reports and Playground, you can easily understand, replay and debug the entire process.
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
* [Quick Experience By Chrome Extension](https://midscenejs.com/quick-experience.html), this is where you should get started 
* Integration
  * [Automate with Scripts in YAML](https://midscenejs.com/automate-with-scripts-in-yaml.html), use this if you prefer to write YAML file instead of code
  * [Bridge Mode by Chrome Extension](https://midscenejs.com/bridge-mode-by-chrome-extension.html), use this to control the desktop Chrome by scripts
  * [Integrate with Puppeteer](https://midscenejs.com/integrate-with-puppeteer.html)
  * [Integrate with Playwright](https://midscenejs.com/integrate-with-playwright.html)
* [API Reference](https://midscenejs.com/api.html)
* [Choose a model](https://midscenejs.com/choose-a-model.html)
* [Config Model and Provider](https://midscenejs.com/model-provider.html)

## 🤝 Community

* [Discord](https://discord.gg/XEYR3tmZ)
* [Follow us on X](https://x.com/midscene_ai)
* [Lark Group](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d)


## Citation

If you use Midscene.js in your research or project, please cite:

```bibtex
@software{Midscene.js,
  author = {Zhou, Xiao and Yu, Tao},
  title = {Midscene.js: Assign AI as your web operator.},
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
