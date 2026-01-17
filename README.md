<p align="center">
  <img alt="Midscene.js"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Midscene.js</h1>
<div align="center">

English | [简体中文](./README.zh.md)

<strong>Official Website</strong>: <a href="https://midscenejs.com/">https://midscenejs.com/</a>

<a href="https://trendshift.io/repositories/12524" target="_blank"><img src="https://trendshift.io/api/badge/repositories/12524" alt="web-infra-dev%2Fmidscene | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

</div>

<p align="center">
  Driving all platforms UI automation with vision-based model
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

## 📣 v1.0 Release Notice

> **We have released v1.0.** It is currently published on npm.  
> The v1.0 docs and code are on [https://midscenejs.com/](https://midscenejs.com/) and the `main` branch.  
> The v0.x docs and code are on [https://v0.midscenejs.com/](https://v0.midscenejs.com/) and the `v0` branch.  
> The v1.0 changelog: [https://midscenejs.com/changelog](https://midscenejs.com/changelog)

## Showcases

autonomously register the GitHub form in a web browser and pass all field validations.

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/1.0-showcases/github2.mp4" height="300" controls></video>

Plus these real-world showcases:
* [iOS Automation - Meituan coffee order](https://midscenejs.com/showcases#ios)
* [iOS Automation - Auto-like the first @midscene_ai tweet](https://midscenejs.com/showcases#ios)
* [Android Automation - DCar: Xiaomi SU7 specs](https://midscenejs.com/showcases#android)
* [Android Automation - Booking a hotel for Christmas](https://midscenejs.com/showcases#android)
* [MCP Integration - Midscene MCP UI prepatch release](https://midscenejs.com/showcases#mcp)

See more real-world showcases — click to explore: [showcases](https://midscenejs.com/showcases)
Community showcase: [robotic arm + vision + voice for in-vehicle testing](https://midscenejs.com/showcases#community-showcases)

## 💡 Features

### Write Automation with Natural Language
- Describe your goals and steps, and Midscene will plan and operate the user interface for you.
- Use Javascript SDK or YAML to write your automation script.

### Web & Mobile App & Any Interface
- **Web Automation**: Either integrate with [Puppeteer](https://midscenejs.com/integrate-with-puppeteer), [Playwright](https://midscenejs.com/integrate-with-playwright) or use [Bridge Mode](https://midscenejs.com/bridge-mode) to control your desktop browser.
- **Android Automation**: Use [Javascript SDK](https://midscenejs.com/android-getting-started) with adb to control your local Android device.
- **iOS Automation**: Use [Javascript SDK](https://midscenejs.com/ios-getting-started) with WebDriverAgent to control your local iOS devices and simulators.
- **Any Interface Automation**: Use [Javascript SDK](https://midscenejs.com/integrate-with-any-interface) to control your own interface.

### For Developers
- **Three kinds of APIs**:
  - [Interaction API](https://midscenejs.com/api#interaction-methods): interact with the user interface.
  - [Data Extraction API](https://midscenejs.com/api#data-extraction): extract data from the user interface and dom.
  - [Utility API](https://midscenejs.com/api#more-apis): utility functions like `aiAssert()`, `aiLocate()`, `aiWaitFor()`.
- **MCP**: Midscene provides MCP services that expose atomic Midscene Agent actions as MCP tools so upper-layer agents can inspect and operate UIs with natural language. [Docs](https://midscenejs.com/mcp)
- [**Caching for Efficiency**](https://midscenejs.com/caching): Replay your script with cache and get the result faster.
- **Debugging Experience**: Midscene.js offers a visualized replay back report file, a built-in playground, and a Chrome Extension to simplify the debugging process. These are the tools most developers truly need.


## 👉 Zero-code Quick Experience

- **[Chrome Extension](https://midscenejs.com/quick-experience)**: Start in-browser experience immediately through [the Chrome Extension](https://midscenejs.com/quick-experience), without writing any code.
- **[Android Playground](https://midscenejs.com/android-getting-started)**: There is also a built-in Android playground to control your local Android device.
- **[iOS Playground](https://midscenejs.com/ios-getting-started)**: There is also a built-in iOS playground to control your local iOS device.

## ✨ Driven by Visual Language Model

Midscene.js is all-in on the pure-vision route for UI actions: element localization and interactions are based on screenshots only. It supports visual-language models like `Qwen3-VL`, `Doubao-1.6-vision`, `gemini-3-pro`, and `UI-TARS`. For data extraction and page understanding, you can still opt in to include DOM when needed.

* Pure-vision localization for UI actions; the DOM extraction mode is removed.
* Works across web, mobile, desktop, and even `<canvas>` surfaces.
* Far fewer tokens by skipping DOM for actions, which cuts cost and speeds up runs.
* DOM can still be included for data extraction and page understanding when needed.
* Strong open-source options for self-hosting.

Read more about [Model Strategy](https://midscenejs.com/model-strategy)



## 📄 Resources 

* Official Website: [https://midscenejs.com](https://midscenejs.com/)
* Documentation: [https://midscenejs.com](https://midscenejs.com/)
* Sample Projects: [https://github.com/web-infra-dev/midscene-example](https://github.com/web-infra-dev/midscene-example)
* API Reference: [https://midscenejs.com/api](https://midscenejs.com/api)
* GitHub: [https://github.com/web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)

## 🤝 Community

* [Discord](https://discord.gg/2JyBHxszE4)
* [Follow us on X](https://x.com/midscene_ai)
* [Lark Group(飞书交流群)](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba)

## 🌟 Awesome Midscene

Community projects that extend Midscene.js capabilities:

* [midscene-ios](https://github.com/lhuanyu/midscene-ios) - iOS Mirror automation support for Midscene
* [midscene-pc](https://github.com/Mofangbao/midscene-pc) - PC operation device for Windows, macOS, and Linux
* [midscene-pc-docker](https://github.com/Mofangbao/midscene-pc-docker) - Docker image with Midscene-PC server pre-installed
* [Midscene-Python](https://github.com/Python51888/Midscene-Python) - Python SDK for Midscene automation
* [midscene-java](https://github.com/Master-Frank/midscene-java) by @Master-Frank - Java SDK for Midscene automation
* [midscene-java](https://github.com/alstafeev/midscene-java) by @alstafeev - Java SDK for Midscene automation


## 📝 Credits

We would like to thank the following projects:

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) and [Rslib](https://github.com/web-infra-dev/rslib) for the build tool.
- [UI-TARS](https://github.com/bytedance/ui-tars) for the open-source agent model UI-TARS.
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) for the open-source VL model Qwen-VL.
- [scrcpy](https://github.com/Genymobile/scrcpy) and [yume-chan](https://github.com/yume-chan) allow us to control Android devices with browser.
- [appium-adb](https://github.com/appium/appium-adb) for the javascript bridge of adb.
- [appium-webdriveragent](https://github.com/appium/WebDriverAgent) for the javascript operate XCTest。
- [YADB](https://github.com/ysbing/YADB) for the yadb tool which improves the performance of text input.
- [libnut-core](https://github.com/nut-tree/libnut-core) for the cross-platform native keyboard and mouse control.
- [Puppeteer](https://github.com/puppeteer/puppeteer) for browser automation and control.
- [Playwright](https://github.com/microsoft/playwright) for browser automation and control and testing.

## 📖 Citation

If you use Midscene.js in your research or project, please cite:

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: Your AI Operator for Web, Android, iOS, Automation & Testing.},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/web-infra-dev/midscene}
}
```

## ✨ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=web-infra-dev/midscene&type=Date)](https://www.star-history.com/#web-infra-dev/midscene&Date)


## 📝 License

Midscene.js is [MIT licensed](https://github.com/web-infra-dev/midscene/blob/main/LICENSE).

---

<div align="center">
  If this project helps you or inspires you, please give us a star
</div>
