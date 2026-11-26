<p align="center">
  <img alt="Midscene.js" width="180" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4"><br />
  <strong>Use the UI like a user.</strong><br />
  Vision-driven E2E testing in natural language — a GUI Agent and a newly designed test framework for web, mobile, and desktop apps.
</p>

<p align="center">
  <a href="https://www.midscenejs.com/">Website</a> · English / <a href="./README.zh.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@midscene/web"><img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" /></a>
  <a href="https://npm-compare.com/@midscene/web/#timeRange=THREE_YEARS"><img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" /></a>
  <a href="https://github.com/web-infra-dev/midscene/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" /></a>
  <a href="https://www.midscenejs.com/"><img src="https://badge.midscenejs.com/by-midscene" alt="E2E by Midscene.js" /></a>
  <a href="https://trendshift.io/repositories/12524"><img src="https://img.shields.io/badge/GitHub_Trending-featured-00a8f0?style=flat-square&logo=github" alt="Featured on GitHub Trending" /></a>
</p>

## Back to the essence of E2E testing with vision

E2E testing should verify the interface, not its code structure. Tests tied to UI code structure are inherently fragile — and even more importantly, they cannot tell whether a user can actually understand and use the interface, or whether the UI conveys the right information.

In the AI-native era, vision models give us the ability to test closer to the essence of E2E — looking at the screen to act and judge like a user. With accuracy and cost now in balance, the next stage of E2E testing is already here.

## Write a test in natural language

Describe what a user wants to do and what they should see. You can organize tests in YAML with **Midscene Test**, or add the **GUI Agent** directly to your existing test suite.

### YAML test cases with Midscene Test

After [creating a Midscene Test project](https://www.midscenejs.com/midscene-test/use) and configuring a model and the Web runtime, write a case like this. Replace the example URL with your app's address:

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

### JavaScript in your existing tests

You can also use the Agent directly in your existing tests. Configure a model and open your app in a Playwright `page`, then describe the same steps in code:

```javascript
import { PlaywrightAgent } from '@midscene/web/playwright';

const agent = new PlaywrightAgent(page);

await agent.aiAct('Search for headphones and filter the results to prices under $100');
await agent.aiWaitFor('The filtered search results are visible');
await agent.aiAssert('There are products in the search results, and each costs less than $100');
```

For mobile and desktop apps, use the platform Agent with [Rstest](https://www.midscenejs.com/sdk/rstest) or [Vitest](https://www.midscenejs.com/sdk/vitest). Open the generated HTML report to inspect screenshots, element locations, the AI decision process, and action and assertion results.

## 👁️ Operate and verify by vision alone

Midscene reads screenshots rather than code, testing the interface the way a user uses it: **observe the screen, act on what is visible, and verify what the user actually sees**.

### Locate and act from screenshots

Midscene locates elements by their appearance and position, then clicks, types, or scrolls to carry out your instructions. You can target icon-only buttons, custom controls, `<canvas>`, and elements inside cross-origin iframes without maintaining selectors or adding semantic annotations.

### Verify what users see

Describe the expected appearance in natural language to check colors, selection highlights, layout, and visual feedback — including content drawn on `<canvas>` or displayed in native apps.

```javascript
await agent.aiAssert('The selected plan has a blue border and a checkmark');
await agent.aiAssert('The error message is visible below the email field');
```

## 🌐 One API, across platforms

Visual localization does not depend on the UI rendering stack or code structure, so the same Agent APIs work on every platform:

| Platform | Integration |
| --- | --- |
| Web | [Playwright](https://www.midscenejs.com/integrate-with-playwright), [Puppeteer](https://www.midscenejs.com/integrate-with-puppeteer), or [desktop Chrome](https://www.midscenejs.com/bridge-mode) |
| Android | [Devices and emulators through ADB](https://www.midscenejs.com/platforms/android) |
| iOS | [Devices and simulators through WebDriverAgent](https://www.midscenejs.com/platforms/ios) |
| HarmonyOS | [HarmonyOS NEXT through HDC](https://www.midscenejs.com/platforms/harmonyos) |
| Desktop | [macOS, Windows, and Linux, with remote RDP support](https://www.midscenejs.com/platforms/desktop) |
| Custom interfaces | [Provide screenshots and action capabilities](https://www.midscenejs.com/integrate-with-any-interface) |

## 📊 Reliability and cost in practice

Today's vision models strike a strong balance between accuracy and price, making pure vision testing practical for everyday E2E runs.

### Choose models for your needs and budget

Screenshot-based UI actions avoid sending large DOM trees to the model. In the reported AppControlBench run, Midscene with Doubao Seed 2.1 Turbo passed **58 of 60 tasks with $0.59 in total model cost**. The [report](https://www.midscenejs.com/app-control-bench-report) provides per-task costs and comparisons across models.

Midscene supports GPT, Qwen, Doubao Seed, DeepSeek, Gemini, Kimi, and more, including open-source options you can self-host. See [Model Selection Guide](https://www.midscenejs.com/model-selection) to choose a model and [Model Configuration](https://www.midscenejs.com/model-api-setup) to set it up.

### Benchmarks

| Benchmark | Pass@1 | Model used in the reported run |
| --- | --- | --- |
| [AndroidWorld](https://www.midscenejs.com/android-world-benchmark-report) | 93.1% | Gemini-3.5-Flash |
| [MobileWorld](https://www.midscenejs.com/mobile-world-benchmark-report) | 78.6% | Gemini-3.6-Flash |
| [AppControlBench](https://www.midscenejs.com/app-control-bench-report) | 96.7% | Doubao Seed 2.1 Turbo |

Each report includes the run configuration and task results; see AndroidWorld's report for its environment and validator adjustments. Explore [cross-platform showcases](https://www.midscenejs.com/showcases), from web form validation to mobile workflows and community-built in-vehicle testing.

## 🧩 Midscene Test: what an E2E framework looks like when tests are pure intent

Through extensive practice, we found that once vision models handle UI interaction and verification, what remains in a test case is pure intent. At that point, traditional test frameworks built around hand-coded locators and page objects become unnecessary overhead.

[Midscene Test](https://www.midscenejs.com/midscene-test/overview) (`@midscene/test`) starts from that premise to rethink what an AI-native E2E framework should optimize for: expressing test cases as pure intent, encapsulating deterministic business operations as reusable capabilities, and letting engineers and AI agents maintain the same test suite together.

### Separate intent from business logic, maintained by people and AI

- **Describe test cases in YAML.** Combine UI actions, assertions, and business operations to express the flow and expected results.
- **Reuse business capabilities through TypeScript Nodes.** Wrap data preparation, API calls, and cleanup in Nodes that different cases can share. A refund test can prepare an order through an API, request a refund through the UI, and verify the result in one workflow.
- **Generate a Node Spec for developers and AI agents.** Export registered Nodes and their inputs as Markdown, so both can write cases without reading TypeScript.

### Engineering foundation built for visual agents

- **Multi-project orchestration:** run web, Android, iOS, and desktop suites from one config with `--project` and tag filtering.
- **Concurrency and isolation:** `maxConcurrentFiles`, with `fileSetup` giving each file its own page, Agent, or device.
- **Lifecycle hooks and cleanup:** `setup`, `fileSetup`, `beforeAll`, and `beforeEach` with reverse-order cleanup that still runs after timeouts or Ctrl+C.
- **Retries and timeouts:** case retries after cleanup, step timeouts, `continue-on-error`, and `bail`.
- **Visual reports & CI integration:** interactive HTML replay for every `Plan`, `Locate`, and action, official `midscene-action` for GitHub Actions with `#runner-step=last-error` deep links, live badges, `model verify`, and `summary.json` / `result.md` for scripts and AI agents.

Start with [Create and use test projects](https://www.midscenejs.com/midscene-test/use), then learn how to [Develop custom Nodes](https://www.midscenejs.com/midscene-test/extend) and control [lifecycle and concurrency](https://www.midscenejs.com/midscene-test/execution).

Reports, Test results, caches and logs are saved in `midscene_run/`. See [artifact directories](https://www.midscenejs.com/midscene-test/running#unified-artifact-root-and-migration) for configuration and CI archiving.

## 🚀 Get started

- **Write YAML test cases** — [create a Midscene Test project](https://www.midscenejs.com/midscene-test/use).
- **Add visual capabilities to existing tests** — [Playwright](https://www.midscenejs.com/integrate-with-playwright) for web apps, [Rstest](https://www.midscenejs.com/sdk/rstest) or [Vitest](https://www.midscenejs.com/sdk/vitest) for mobile and desktop apps.
- **Try it before writing tests** — the [Chrome extension](https://www.midscenejs.com/get-started?scene=playground&platform=web) or a [Playground for mobile or desktop](https://www.midscenejs.com/platforms).
- **Run standalone automation scripts** — the [JavaScript SDK](https://www.midscenejs.com/sdk/standalone).
- **Let your AI agent operate the UI** — [Midscene Skills](https://www.midscenejs.com/skills).

## 📄 Resources

* Documentation: [https://www.midscenejs.com](https://www.midscenejs.com/)
* Sample projects: [midscene-example](https://github.com/web-infra-dev/midscene-example)
* API reference: [https://www.midscenejs.com/reference/#common](https://www.midscenejs.com/reference/#common)

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

## ⭐ Star Midscene

If Midscene is useful to you, please give it a star.

[![Star History Chart](https://api.star-history.com/svg?repos=web-infra-dev/midscene&type=Date)](https://www.star-history.com/#web-infra-dev/midscene&Date)

## 📝 License

Midscene.js code is [MIT licensed](https://github.com/web-infra-dev/midscene/blob/main/LICENSE). The separately published `@midscene/benchmark-grounding` test set documents the licenses declared by its direct sources. See the [test set license and attribution](./packages/benchmark-grounding/LICENSE).
