<p align="center">
  <img alt="Midscene.js" width="180" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4"><br />
  <strong>GUI Agent for E2E Testing</strong><br />
  AI-powered vision. Cross-platform. Batteries included.
</p>

<p align="center">
  <a href="https://midscenejs.com/">Website</a> · English / <a href="./README.zh.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <a href="https://github.com/web-infra-dev/midscene/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" /></a>
  <a href="https://trendshift.io/repositories/12524"><img src="https://img.shields.io/badge/GitHub_Trending-featured-00a8f0?style=flat-square&logo=github" alt="Featured on GitHub Trending" /></a>
</p>

## See it in action

Midscene combines a vision-driven GUI Agent with a testing kit for writing, verifying, and debugging UI tests across web, mobile, and desktop apps through the same Agent APIs. The Playwright example below shows a web test; configure a model and open your app in an existing Playwright `page` to get started:

```typescript
import { PlaywrightAgent } from '@midscene/web/playwright';

const agent = new PlaywrightAgent(page);

// Let the Agent carry out a flow, then verify the result.
await agent.aiAct('Search for headphones, then filter the results to under $100');
await agent.aiWaitFor('The filtered search results are displayed');
await agent.aiAssert('Every product in the search results has a price below $100');
```

Open the generated HTML report to inspect screenshots, actions, and assertion results. Follow the [Playwright guide](https://midscenejs.com/integrate-with-playwright) for model setup, a complete example, and test runner integration.

## 👁️ GUI Agent

Midscene models both UI actions and assertions on how people use software: **look at the screen, act on what you see, and check the visible result**. Describe the task and expected outcome in natural language; Midscene uses screenshots to decide where to interact and whether the interface meets your expectations.

### Visual understanding and cross-platform actions

Like a person finding a control on screen, Midscene locates elements by their appearance and position, then clicks, types, or scrolls to carry out your instructions. You can target icon-only buttons, custom controls, `<canvas>`, and elements inside cross-origin iframes without writing selectors or adding semantic annotations.

The same Agent APIs work across [Web](https://midscenejs.com/integrate-with-playwright), [Android](https://midscenejs.com/platforms/android), [iOS](https://midscenejs.com/platforms/ios), [HarmonyOS](https://midscenejs.com/platforms/harmonyos), and [desktop apps](https://midscenejs.com/platforms/desktop). You can also connect a [custom interface](https://midscenejs.com/integrate-with-any-interface) by providing screenshot and action capabilities.

### Verify what users see

Assertions follow the same visual approach: Midscene inspects the screen as a human tester would to judge whether the expected result is visible. Describe the expected appearance in natural language to check colors, selection highlights, layout, and visual feedback — including content drawn on `<canvas>` or displayed in native apps.

```typescript
await agent.aiAssert('The selected plan has a blue border and a checkmark');
await agent.aiAssert('The error message is visible below the email field');
```

### Benchmark performance

| Benchmark | Pass@1 | Model used in the reported run |
| --- | --- | --- |
| [AndroidWorld](https://midscenejs.com/android-world-benchmark-report) | 93.1% | Gemini-3.5-Flash |
| [MobileWorld](https://midscenejs.com/mobile-world-benchmark-report) | 78.6% | Gemini-3.6-Flash |
| [AppControlBench](https://midscenejs.com/app-control-bench-report) | 96.7% | Doubao Seed 2.1 Turbo |

Each report includes the run configuration and task results; see AndroidWorld's report for its environment and validator adjustments.

### Cost and model choice

Screenshot-based UI actions avoid sending large DOM trees to the model. In the reported AppControlBench run, Midscene with Doubao Seed 2.1 Turbo completed the 60-task evaluation with **$0.59 in total model cost**, achieving 58 passes. The [report](https://midscenejs.com/app-control-bench-report) provides per-task costs and comparisons across models.

Midscene supports multimodal models such as `Qwen3.x`, `Doubao-Seed-2.1`, `GLM-4.6V`, `gemini-3.5-flash`, and `UI-TARS`, including open-source options you can self-host. Start with one model, or combine planning and vision models for your workload. For data extraction and page understanding, you can opt in to include DOM. See [Model Strategy](https://midscenejs.com/model-strategy).

### Showcases

* [Web Automation - Automatically register the GitHub form in a web browser and pass all field validations](https://midscenejs.com/showcases#web)
* [iOS Automation - Meituan coffee order](https://midscenejs.com/showcases#ios)
* [iOS Automation - Auto-like the first @midscene_ai tweet](https://midscenejs.com/showcases#ios)
* [Android Automation - DCar: Xiaomi SU7 specs](https://midscenejs.com/showcases#android)
* [Android Automation - Booking a hotel for Christmas](https://midscenejs.com/showcases#android)
* [robotic arm + vision + voice for in-vehicle testing](https://midscenejs.com/showcases#community-showcases)

## 🧰 Testing Kit

Batteries included: Midscene provides the observability, test framework, and integration APIs needed to turn GUI automation into a maintainable E2E test project.

### Built-in observability

Interactive HTML reports show screenshots, element locations, the AI decision process, and action and assertion results. In Midscene Test, AI steps and custom business operations share execution records with inputs, outputs, timing, and status. Reports and runtime logs give both developers and AI Agents the context to investigate failures. Use the [Playground](https://midscenejs.com/quick-start#chrome-extension) to try and refine instructions against your interface.

### Midscene Test: an E2E framework for the AI era

[Midscene Test](https://midscenejs.com/midscene-test/overview) (`@midscene/test`, Beta) separates **declarative test intent from programmable engineering**. Write UI flows and expectations in YAML, and wrap API calls, data preparation, and cleanup in reusable TypeScript Nodes. A refund test can prepare an order through an API, request a refund through the UI, and verify the result in one workflow.

The framework includes project scaffolding, platform presets, lifecycle hooks, retries, and execution-project isolation and concurrency. It also generates a Markdown reference from registered Nodes and their parameter schemas, so **people and AI Agents can discover the same capabilities and co-maintain test cases**. See [Create and extend a project](https://midscenejs.com/midscene-test/extend) and [Write and run tests](https://midscenejs.com/midscene-test/use).

### Rich APIs that fit your existing stack

Use `aiAct` for autonomous flows, `aiTap` and `aiInput` for individual actions, `aiAssert` for assertions, and `aiQuery` for structured data extraction. Combine these [Agent APIs](https://midscenejs.com/reference/#common) with your existing code, fixtures, and assertions through [Playwright](https://midscenejs.com/integrate-with-playwright), [Puppeteer](https://midscenejs.com/integrate-with-puppeteer), or the JavaScript SDK. You can adopt Midscene's visual capabilities within your current testing framework. AI coding agents can also operate interfaces through [Midscene Skills](https://midscenejs.com/skills).

## 🚀 Get started

- **Try an instruction in Chrome** — configure a model and install the Chrome extension with the [Quick start](https://midscenejs.com/quick-start).
- **Write tests with the SDK or YAML** — start with [Playwright](https://midscenejs.com/integrate-with-playwright), [Puppeteer](https://midscenejs.com/integrate-with-puppeteer), or the [Midscene Test](https://midscenejs.com/midscene-test/extend).
- **Let your AI agent operate the UI** — install [Midscene Skills](https://midscenejs.com/skills).
- **Test on another platform** — follow the guides for [Android](https://midscenejs.com/platforms/android), [iOS](https://midscenejs.com/platforms/ios), [HarmonyOS](https://midscenejs.com/platforms/harmonyos), or [desktop](https://midscenejs.com/platforms/desktop).

## 📄 Resources

* Documentation: [https://midscenejs.com](https://midscenejs.com/)
* Sample projects: [midscene-example](https://github.com/web-infra-dev/midscene-example)
* API reference: [https://midscenejs.com/reference/#common](https://midscenejs.com/reference/#common)

## 🤝 Community

* [Discord](https://discord.gg/2JyBHxszE4)
* [Follow us on X](https://x.com/midscene_ai)
* [Lark Group (飞书交流群)](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba)

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

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) and [Rslib](https://github.com/web-infra-dev/rslib) for the build tools.
- [UI-TARS](https://github.com/bytedance/ui-tars) for the open-source agent model UI-TARS.
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) for the open-source multimodal model Qwen-VL.
- [scrcpy](https://github.com/Genymobile/scrcpy) and [yume-chan](https://github.com/yume-chan) for browser-based Android device control.
- [appium-adb](https://github.com/appium/appium-adb) for its JavaScript bridge to ADB.
- [appium-webdriveragent](https://github.com/appium/WebDriverAgent) for controlling XCTest from JavaScript.
- [YADB](https://github.com/ysbing/YADB) for improving text input performance.
- [libnut-core](https://github.com/nut-tree/libnut-core) for cross-platform native keyboard and mouse control.
- [Puppeteer](https://github.com/puppeteer/puppeteer) for browser automation and control.
- [Playwright](https://github.com/microsoft/playwright) for browser automation, control, and testing.

## 📖 Citation

If you use Midscene.js in your research or project, please cite:

```bibtex
@software{Midscene.js,
  author = {Xiao Zhou, Tao Yu, YiBing Lin},
  title = {Midscene.js: GUI Agent for E2E Testing.},
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
