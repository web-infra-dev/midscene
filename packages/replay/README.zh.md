# @midscene/replay

为 Midscene Agent 和 Native Test YAML 提供确定性的 Web 步骤。Test 负责初始化、取消、Case 重试和统一 HTML 报告；Replay 提供严格定位、可选定位回退、程序断言和 Jev 视觉检查。

## 安装

```sh
pnpm add @midscene/replay @midscene/test @midscene/web playwright
pnpm exec playwright install chromium
```

请使用版本匹配的 Midscene 包。在 Native Test 中沿用已有的 Playwright/Puppeteer Agent 初始化，并使用 `@midscene/test/midscene` 的 `createMidsceneNodes`。Replay 复用该 Agent，不负责启动和管理浏览器。

## 给 YAML 节点附加脚本

```yaml
cases:
  - name: 保存草稿
    steps:
      - aiAct:
          prompt: 保存草稿并检查回执
          replay:
            script: ./steps/save.mjs
            params: { label: Saved }
```

`steps/save.mjs`：

```js
import { defineStep } from '@midscene/replay';

export default defineStep({
  async ready(rp) {
    await rp.expect({ xpath: '//button[@id="save"]' }, { visible: true });
  },
  async run(rp) {
    await rp.tap('保存', { candidates: [{ xpath: '//button[@id="save"]' }] });
  },
  async done(rp, { params }) {
    await rp.expect({ xpath: '//output' }, { text: params.label });
  },
});
```

```sh
pnpm exec midscene-test case.yaml --replay=strict
```

| 模式 | 行为 |
| --- | --- |
| `auto`，默认 | 先执行脚本；脚本失败后在当前页面使用原输入、原选项调用原生 ai* |
| `strict` | 脚本失败使节点失败，同时关闭已声明的定位回退 |
| `off` | 忽略脚本，执行原生 ai*，包括其正常缓存行为 |

使用 `test: { replay: 'strict' }` 设置项目默认值，CLI 可以覆盖。SDK 用户可以向 `@midscene/test/config` 的 `runTestProject` 传入 `replay`。

脚本收到 `input`、`params`、`signal` 和宿主 `agent`，应返回原生方法要求的原始结果，例如 aiQuery 数据或 aiAssert 的 `{ pass, thought }`。返回断言失败或无效结果会直接使节点失败，即使在 auto 模式也不会交给 AI 重判。取消和不可继续的资源错误也不会回退。auto 回退和原生 Case 重试可能重复脚本已经执行的操作。

## 运行时 API 与边界

直接调用 SDK 时使用 `withReplay(agent)`；通过 `runReplayStep(agent, step, options)` 执行 ready/run/done。操作包括 `tap`、`input`、`keyPress`、`select` 和 `scroll`；检查包括 `expect`、`waitFor` 和 `verify`。`read` 执行只读页面表达式，不增加动作证据。通过 `onEvent` 收集执行事件。

严格定位必须找到唯一可见目标。身份 guard 或 AI 定位回退需要显式声明，strict 模式会禁用二者。弹窗跟随限定在触发操作的源页面，并检查目标地址。

`verify` 使用宿主 Agent insight 配置中的 Jev，或复用默认 OpenRouter 凭证调用专用 Jev 模型。它区分通过、失败、等待和无法判断，不替换成通用模型。实际送入模型的预处理截图和错误会保留在原生报告中。截图可能发送给配置的模型服务，报告默认不打码。

严格操作目前支持 Web 主文档，不覆盖 iframe/Shadow DOM 目标、原生对话框、移动端或桌面端。Jev 可以检查可见 Canvas 画面，但不提供 Canvas 交互。
