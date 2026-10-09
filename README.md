<p align="center">
  <img alt="Midscene.js" width="180" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4"><br />
  <strong>See interfaces like a human. E2E testing in natural language.</strong><br />
  A vision-based GUI Agent and an extensible testing framework for web, mobile, and desktop apps.
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

## Write a test in natural language

Midscene.js helps developers bring AI to E2E testing. Describe UI steps and expected results in natural language, then use the visual GUI Agent to carry them out and verify what users see. Organize tests with Midscene Test, or integrate the Agent APIs into your existing testing framework.

### YAML test cases with Midscene Test

After [creating a Midscene Test project](https://midscenejs.com/midscene-test/extend) and configuring a model and the Web runtime, write a case like this. Replace the example URL with your app's address:

```yaml
beforeEach:
  - gotoUrl: https://your-shop.example

cases:
  - name: Find headphones under $100
    steps:
      - aiAct: Search for headphones and filter the results to prices under $100
      - aiWaitFor: The filtered search results are visible
      - aiAssert: There are products in the search results, and each costs less than $100
```

### JavaScript with Playwright

You can also use the Agent directly in your existing tests. Configure a model and open your app in a Playwright `page`, then describe the same steps in code:

```javascript
import { PlaywrightAgent } from '@midscene/web/playwright';

const agent = new PlaywrightAgent(page);

await agent.aiAct('Search for headphones and filter the results to prices under $100');
await agent.aiWaitFor('The filtered search results are visible');
await agent.aiAssert('There are products in the search results, and each costs less than $100');
```

Open the generated HTML report to inspect screenshots, actions, and assertion results. Follow the guides for [Midscene Test](https://midscenejs.com/midscene-test/use) or [Playwright](https://midscenejs.com/integrate-with-playwright) for setup and complete examples.

## 👁️ Vision-driven, low-cost testing

Midscene models UI actions and assertions on how people use software: **look at the screen, act on what you see, and check the visible result**.

### Locate and act from screenshots

Midscene locates elements by their appearance and position, then clicks, types, or scrolls to carry out your instructions. You can target icon-only buttons, custom controls, `<canvas>`, and elements inside cross-origin iframes without maintaining selectors or adding semantic annotations.

### Verify what users see

Describe the expected appearance in natural language to check colors, selection highlights, layout, and visual feedback — including content drawn on `<canvas>` or displayed in native apps.

```javascript
await agent.aiAssert('The selected plan has a blue border and a checkmark');
await agent.aiAssert('The error message is visible below the email field');
```

### Choose models for your needs and budget

Screenshot-based UI actions avoid sending large DOM trees to the model. In the reported AppControlBench run, Midscene with Doubao Seed 2.1 Turbo passed **58 of 60 tasks with $0.59 in total model cost**. The [report](https://midscenejs.com/app-control-bench-report) provides per-task costs and comparisons across models.

Midscene supports `Qwen3.x`, `Doubao-Seed-2.1`, `DeepSeek V4 Flash`, `GLM-4.6V`, `gemini-3.5-flash`, and `UI-TARS`, including open-source options you can self-host. See [Model Strategy](https://midscenejs.com/model-strategy) to choose a model and [Model Configuration](https://midscenejs.com/model-common-config) to set it up.

## 🌐 One API, across platforms

Use the same Agent APIs to describe actions and assertions across platforms:

| Platform | Integration |
| --- | --- |
| Web | [Playwright](https://midscenejs.com/integrate-with-playwright), [Puppeteer](https://midscenejs.com/integrate-with-puppeteer), or [desktop Chrome](https://midscenejs.com/bridge-mode) |
| Android | [Devices and emulators through ADB](https://midscenejs.com/platforms/android) |
| iOS | [Devices and simulators through WebDriverAgent](https://midscenejs.com/platforms/ios) |
| HarmonyOS | [HarmonyOS NEXT through HDC](https://midscenejs.com/platforms/harmonyos) |
| Desktop | [macOS, Windows, and Linux, with remote RDP support](https://midscenejs.com/platforms/desktop) |
| Custom interfaces | [Provide screenshots and action capabilities](https://midscenejs.com/integrate-with-any-interface) |

## 🧩 Midscene Test: YAML for cases, TypeScript for extensions

[Midscene Test](https://midscenejs.com/midscene-test/overview) (`@midscene/test`, Beta) turns GUI automation into a maintainable E2E test project:

- **Describe test cases in YAML.** Combine UI actions, assertions, and business operations to express the flow and expected results.
- **Reuse business capabilities through TypeScript Nodes.** Wrap data preparation, API calls, and cleanup in nodes that different cases can share. A refund test can prepare an order through an API, request a refund through the UI, and verify the result in one workflow.
- **Generate a Node Spec for developers and AI Agents.** Export registered nodes and their parameter schemas as Markdown, so both can discover project capabilities and co-maintain test cases.

Start with [Create and extend a project](https://midscenejs.com/midscene-test/extend), then [Write and run tests](https://midscenejs.com/midscene-test/use).

## 🧰 Tools for writing and debugging tests

### APIs that fit your existing stack

Use `aiAct` for autonomous flows, `aiTap` and `aiInput` for individual actions, `aiAssert` for assertions, and `aiQuery` for structured data extraction. Combine these [Agent APIs](https://midscenejs.com/reference/#common) with your existing code, fixtures, and assertions through Playwright, Puppeteer, or the JavaScript SDK.

### Replay execution and refine instructions

Interactive HTML reports show screenshots, element locations, the AI decision process, and action and assertion results. Midscene Test also records the inputs, outputs, duration, and status of custom business operations, giving developers and AI Agents context to investigate failures. Use the [Playground](https://midscenejs.com/quick-start) to try and refine instructions against your interface.

### Let AI coding agents operate the UI

[Midscene Skills](https://midscenejs.com/skills) lets AI coding agents operate applications, verify interfaces, and inspect execution results.

## 📊 Benchmarks and showcases

| Benchmark | Pass@1 | Model used in the reported run |
| --- | --- | --- |
| [AndroidWorld](https://midscenejs.com/android-world-benchmark-report) | 93.1% | Gemini-3.5-Flash |
| [MobileWorld](https://midscenejs.com/mobile-world-benchmark-report) | 78.6% | Gemini-3.6-Flash |
| [AppControlBench](https://midscenejs.com/app-control-bench-report) | 96.7% | Doubao Seed 2.1 Turbo |

Each report includes the run configuration and task results; see AndroidWorld's report for its environment and validator adjustments.

Explore [cross-platform showcases](https://midscenejs.com/showcases), from web form validation to mobile workflows and community-built in-vehicle testing.

## 🚀 Get started

- **Write YAML test cases** — [create a Midscene Test project](https://midscenejs.com/midscene-test/extend).
- **Add visual capabilities to existing tests** — integrate with [Playwright](https://midscenejs.com/integrate-with-playwright) or [Puppeteer](https://midscenejs.com/integrate-with-puppeteer).
- **Try it before writing tests** — use the [Chrome extension](https://midscenejs.com/quick-start), or launch a [Playground for mobile or desktop](https://midscenejs.com/quick-start#use-midscene-on-other-platforms).
- **Let your AI agent operate the UI** — install [Midscene Skills](https://midscenejs.com/skills).

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
