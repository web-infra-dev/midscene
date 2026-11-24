# Midscene Replay

Replay 为原生 Midscene Test 的 `ai*` 节点增加可选脚本实现。编码 Agent 可以探索页面或读取人工录制，自主拆分步骤、编写 YAML 与 `.mjs`、试错修复，再对完整三轮的真实结果做业务审阅。

交付物是 `case.yaml`、`steps/*.mjs` 和需要的 Test 配置。Test 负责初始化、Agent、hooks、取消、Case 重试、输出与原生 HTML 报告。Replay 提供录制、严格 XPath 操作、可选 guard/AI 定位、程序断言和 Jev 视觉检查。

## 安装与开始

使用包含本轮 YAML 接入的配套 `@midscene/test`、`@midscene/replay`、`@midscene/web` 构建。旧 Beta 包不支持新契约。

```sh
pnpm add @midscene/replay @midscene/test @midscene/web playwright
pnpm exec playwright install chromium
```

仓库开发执行 `pnpm exec nx build @midscene/replay` 和 `pnpm exec nx build @midscene/test`。

给编码 Agent 一句话：“请使用 `node_modules/@midscene/replay/skills/midscene-replay/SKILL.md`，在 <URL> 录制并优化我的流程。先展示编号业务步骤和验收计划，然后继续编写与验证。”仓库内 skill 路径为 `packages/replay/skills/midscene-replay/SKILL.md`。

参考[项目配置模板](skills/midscene-replay/templates/midscene.config.mjs)和 [YAML 模板](skills/midscene-replay/templates/case.yaml)，正式验收前补齐起点检查与业务复位。

```yaml
cases:
  - name: 审批 B 单
    steps:
      - aiAct:
          prompt: 审批 B 单并确认回执
          replay:
            script: ./steps/approve.mjs
            params: { orderId: B }
```

```js
import { defineStep } from '@midscene/replay';
export default defineStep({
  async ready(rp, ctx) { /* 检查业务入口。 */ },

  async run(rp, { input, params, signal }) {
    // 使用原节点输入/选项和 rp.* 执行真实 UI 操作。
    // 返回原生方法要求的原始结果。
  },

  async done(rp, ctx) { /* 核对业务结果。 */ },
});
```

## 执行、入口准备与验收

```sh
pnpm exec midscene-test case.yaml --replay=auto
pnpm exec midscene-replay prepare-step case.yaml --case "审批 B 单" --step 1
pnpm exec midscene-replay verify case.yaml --case "审批 B 单" --runs 3
```

| 模式 | 行为 |
| --- | --- |
| `auto`，默认 | 先执行脚本，失败后在当前页面使用原输入、原选项调用原生 ai* |
| `strict` | 脚本失败则节点失败，同时关闭已声明的定位退路 |
| `off` | 忽略脚本，执行原 ai*，包括其正常缓存行为 |

项目默认值写为 `test: { replay: 'auto' }`，CLI 可覆盖。SDK 使用 `@midscene/test/config` 的 `runTestProject({configPath, replay})`。脚本结果复用原节点转换：aiQuery 数据、标量输出与 aiAssert 失败语义保持原样。已返回的断言失败（`{ pass: false }`）和不符合契约的返回值直接使节点失败，即使在 `auto` 下也不交给 AI 重判。取消和原生不可继续的资源错误不回退。不会保证零重复动作：auto 或原生 Case 重试可能重复脚本已执行的操作。

`prepare-step` 执行初始化、hooks 和真实前缀，在目标节点前保留浏览器、变量和 Agent，打印准确 CDP 端点与 target ID。增加 `--record --out NEW_RECORDING` 可人工录制。按 Enter 结束交接后清理；目标节点和后缀不执行，原生报告记录主动停止，不宣称 Case 通过。

`verify` 冻结编写项目，以 strict、retry 0 调用原生 Test，保留 HTML/机器结果、Replay 诊断、`steps.md`、`review.png` 和需要时的 `heal.json`。输入修改或任一轮失败使整组失效。编码 Agent 仍需结合原始目标逐步审阅截图。详见[验收边界](skills/midscene-replay/references/review.md)。

请将配置、YAML、辅助代码和测试数据放在独立编写目录中。配置位于 workspace 根目录时，验收会在复制前报错，避免复制整个 monorepo；可传入 `--config ./replay-project/midscene.config.mjs`，依赖包仍可安装在上级 workspace。验收在复制前检查 YAML 的回放脚本入口以及 JS/TS 中的字面量本地导入，并在每轮前后核对原文件与快照的哈希。计算得到的导入路径、绝对文件导入和 `#` 别名不支持，请改用相对导入。这不会冻结任意文件读取、已安装依赖或外部服务，也不是安全沙箱。

## 录制与登录

```sh
pnpm exec midscene-replay record web --url https://example.com --out ./recording-new
pnpm exec midscene-replay prepare ./recording-new --out ./authoring-new
```

默认新开 Chrome 窗口，可用 `--browser msedge|chromium` 切换。需要登录时直接告诉 Agent：它会打开可保留登录态的专用 Chrome/Edge 窗口，请你完成登录，再通过 `--cdp` 录制。Test 配置中的可选 `webFileSetup` 支持全新、`cdp-state`、`cdp-tab`；已有 Playwright/Puppeteer 自定义宿主继续适用。详见[会话配置](skills/midscene-replay/references/session.md)。

录制和报告默认不打码，可能包含隐私数据；skill 会显眼提示且不打断日常流程，真实外部写入需在授权范围内执行。AI/Jev 可能向配置的服务发送截图。

## 范围与破坏性变更

严格定位目前支持 Web 主文档，不覆盖 iframe/Shadow DOM 严格定位、原生对话框、移动端或桌面端。Jev 可核验可见 Canvas 画面，不提供 Canvas 交互。专用浏览器启动器限 macOS。

本轮删除 `/experimental`、`defineReplay`、流程级重试/恢复/共享状态、`session.mjs` 和独立 `run/trial/report` 命令，不提供兼容层。`defineStep/runReplayStep/withReplay` 从包根导出。旧产物需要迁移到原生 Test YAML/配置并重新验收。
