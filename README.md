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
  Open-source, vision-driven UI testing — write tests in natural language, automate any platform.
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

## 📣 Midscene Skills is here!

Use [Midscene Skills](https://github.com/web-infra-dev/midscene-skills) to control any platform with [OpenClaw](https://github.com/OpenClaw/OpenClaw) 

## Showcases

* [Web Automation - Automatically register the GitHub form in a web browser and pass all field validations](https://midscenejs.com/showcases#web)
* [iOS Automation - Meituan coffee order](https://midscenejs.com/showcases#ios)
* [iOS Automation - Auto-like the first @midscene_ai tweet](https://midscenejs.com/showcases#ios)
* [Android Automation - DCar: Xiaomi SU7 specs](https://midscenejs.com/showcases#android)
* [Android Automation - Booking a hotel for Christmas](https://midscenejs.com/showcases#android)
* [MCP Integration - Midscene MCP UI prepatch release](https://midscenejs.com/showcases#mcp)
* [robotic arm + vision + voice for in-vehicle testing](https://midscenejs.com/showcases#community-showcases)

## 💡 Why Midscene

Most UI automation — including AI tools that read the DOM or the accessibility tree — depends on page structure. That structure is fragile and incomplete: selectors break on every refactor, elements without semantic markup (icon-only buttons, custom controls, `<canvas>`) are invisible to it, native apps and cross-origin iframes are out of reach, and it cannot tell whether something actually looks right. Midscene works from the screenshot alone, and you describe each step in natural language:

- **Less maintenance** — no selectors to chase when the UI changes.
- **Reach every element and surface** — if a human can see it, Midscene can target it, even with no semantic annotations, on `<canvas>`, native apps, and cross-origin iframes.
- **Assert what users actually see** — verify colors, highlights, layout, and rendered state, not just whether a DOM node exists.
- **Two ways to test** — add Midscene to your [Playwright](https://midscenejs.com/integrate-with-playwright) / Vitest suite, or let an AI agent test autonomously via [Skills](https://midscenejs.com/skills) and [MCP](https://midscenejs.com/mcp).

Midscene is built for UI testing first, but the same vision-driven engine handles any UI automation task.

## 💡 What you can automate

Midscene works anywhere you can take a screenshot — web browsers, Android, iOS, HarmonyOS, desktop apps, and [any custom interface](https://midscenejs.com/integrate-with-any-interface) — all through one API. Write automation with the JavaScript SDK or in YAML, hand it to AI agents via [Skills](https://midscenejs.com/skills) and [MCP](https://midscenejs.com/mcp), and look up every method (`aiAct`, `aiQuery`, `aiAssert`, and more) in the [API reference](https://midscenejs.com/api).

## 🚀 Get started

- **Write your first script** in a few minutes — [Quick start](https://midscenejs.com/quick-start).
- **No code?** Try Midscene on any web page with the [Chrome extension](https://midscenejs.com/quick-experience).
- **Other platforms** — getting-started guides for [Android](https://midscenejs.com/android-getting-started), [iOS](https://midscenejs.com/ios-getting-started), [HarmonyOS](https://midscenejs.com/harmony-getting-started), and [desktop](https://midscenejs.com/computer-getting-started).

## ✨ Driven by Multimodal Models

Midscene is all-in on pure vision for UI actions: element localization is based on screenshots only. It runs on multimodal models with strong UI localization, such as `Qwen3.x`, `Doubao-Seed-2.0`, `GLM-4.6V`, `gemini-3.5-flash`, and `UI-TARS`, including open-source options you can self-host. For data extraction and page understanding, you can still opt in to include DOM when needed.

Read more about [Model Strategy](https://midscenejs.com/model-strategy).



## 📄 Resources

* Documentation: [https://midscenejs.com](https://midscenejs.com/)
* Sample projects: [midscene-example](https://github.com/web-infra-dev/midscene-example)
* API reference: [https://midscenejs.com/api](https://midscenejs.com/api)

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
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) for the open-source multimodal model Qwen-VL.
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
