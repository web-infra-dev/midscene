# Midscene Replay

[English](./README.md)

录制 Web 流程，由当前编码 Agent 和随包提供的 [Skill](./skills/midscene-replay/SKILL.md) 生成、审阅一个供已有 Midscene Agent 调用的 `replay/` 目录：`index.mjs` 声明流程，每个业务步骤是一个独立的 `defineStep` 模块。步骤是回放、重试、续跑、测试和审阅的基本单位。日常回放依赖兼容的 SDK 和 Replay 运行时，无需编码 Agent、录制附件或工作台。

## 录制与准备

在已安装工作区依赖的仓库根目录执行，使用新目录：

```sh
pnpm exec nx build @midscene/replay
node packages/replay/scripts/cli.mjs record web --url https://cn.bing.com/ --out midscene_run/replay/my-recording
# 在 Chrome 完成操作后，回终端按 Enter 结束。
node packages/replay/scripts/cli.mjs prepare midscene_run/replay/my-recording --out midscene_run/replay/my-authoring
```

`prepare` 生成来源清单和索引，把现有宿主/工具依赖链接到新的工作目录并验证导入，输出 Skill 路径。它不会启动另一个编码 Agent，也不安装或修改宿主依赖。`--goal TEXT` 可选。命令读取调用目录的 `.env`，也可用 `--env-file FILE`；凭据保留在宿主。`--version` 显示 Midscene SDK 包版本。

录制默认打开一个使用独立配置的 Chrome 新窗口。可用 `--browser msedge` 或 `--browser chromium` 换一个浏览器开新窗口。macOS 上可用 `node packages/replay/scripts/cli.mjs browser msedge`（或 `browser chrome`）打开保留登录态的专用浏览器。首次手动登录，之后给 `record web`、`run` 或 `trial` 加上 `--cdp http://127.0.0.1:9222`。专用窗口长期保存登录资料。CDP 试跑每轮把适用于起点 URL 的 Cookie 和同源 `localStorage` 带入新上下文。跨域认证、其他登录状态或服务端数据复位用自定义会话。[会话配置](./skills/midscene-replay/references/session.md)

Agent 阅读原始证据，在对话中展示从 1 编号的业务流程与验收表，并保存到 `acceptance.md`。默认记录为已展示并继续；用户明确确认或更正的范围记录为已确认。如果用户要求先确认，则等待实际答复。表中每一行对应一个步骤，包含稳定的 id、入口检查（`ready`）、动作（`run`）、出口检查（`done`）和重试策略。只服务于同一个业务结果的动作合并，有独立可验证结果或恢复边界时再拆步。仅对重要歧义或范围变化询问。原始证据不变，不能为失败脚本降低要求。

## 执行与审阅

```sh
node packages/replay/scripts/cli.mjs trial midscene_run/replay/my-authoring/replay
```

回放流程提供 `meta.startUrl` 后，可直接使用默认的无界面 Chromium 宿主，加 `--headed` 可观察执行。登录、测试数据复位或特殊环境通过 `--session FILE` 提供。不传 `--out` 时，试跑结果按 `trials/01`、`trials/02` 依次写入准备好的工作目录；诊断文件放在其中的 `scratch/` 目录。用 `trial replay --step <id>` 修单个步骤：之前的步骤正常执行，跑完该步骤即停止，只作诊断。Trial 为每次运行新建会话、复位并核对起点，执行脚本及配置的检查，保存原生报告、起止截图、代码快照和耗时。默认三次，失败即停止。最终验收要求同一版本至少连续完整通过三次，并完成业务证据审阅；`--runs 1` 仅用于诊断。修改后重跑完整组。默认发现回放目录旁的 `source.json`，也支持 `--source MANIFEST`，用于保护原始证据。没有底层事件逐项比对或自动证书。

试跑从 `steps.md` 开始审阅。它链接到 `result.json` 的输入摘要、冻结脚本、业务验收、每轮报告与图片，以及有记录时的定位修复建议。程序读每轮 `report.json` 的 `evidence.entries` 获取截图索引。原生 `agent.json`、去重图片和 `review.png` 均可查阅。编码 Agent 对照原始要求、三轮实际图片、检查点状态和执行脚本，在 `acceptance.md` 追加结论。程序通过不等于业务验收通过；证据不足保持未验证。

关键中间状态和终态使用普通 JS 断言，可用 `session.checks` 独立读取最终结果。通过 `rp.checkpoint` 记录关键状态和截图。需要 Jev 判断的视觉要求用 `rp.verify`，由脚本声明检查点。

## 交付与调用

```sh
node packages/replay/scripts/cli.mjs run midscene_run/replay/my-authoring/replay
```

`run` 执行一次并输出结构化结果与原生 HTML 报告路径。如果本地缺报告模板，按仓库贡献指南构建 `@midscene/report`。Replay 是私有实验包，独立宿主使用兼容的工作区依赖或本地构建。

只跑一个步骤时，用 `run REPLAY --session STEP_SESSION --from STEP --until STEP`，由自定义会话准备该步骤需要的页面和数据。跳过的步骤不会产生结果或共享状态。依赖前序数据时，用 `trial REPLAY --step STEP` 重放前序步骤。每次尝试的 `ready`、`run`、`done` 耗时可在 JSON 结果和试跑的 `steps.md` 中查看。[诊断命令和证据](./skills/midscene-replay/references/review.md#run)

```js
import replay from './replay/index.mjs';
const outcome = await replay.run(existingAgent, { params });
```

宿主负责启动和清理。每个步骤按 `ready → run → done` 执行。只有本次尝试未派发且未访问原生 Agent（默认 `before-dispatch`），或步骤声明为 `idempotent` 时才重试；`run` 失败时，若有该阶段的派发迹象且 `done` 能验证整步结果，可以恢复为通过；`optional` 步骤失败不中断流程。必需步骤失败时抛出带逐步结果的 `ReplayStepError`。宿主准备好入口状态后，可用 `run(agent, {from, until})` 限定执行范围。步骤拿到的 `rp` 提供严格 XPath 动作、状态读取、条件等待及 Jev。默认就绪等待最多 5 秒，满足即返回；明确发现慢点后才增加局部预算。目标歧义立即失败，已派发动作不静默重试。普通批量输入和坐标比例缓存减少不必要开销。

原生单选下拉用 `rp.select("按价格升序", { candidates, option: { value: "price-asc" } })`，传入下拉控件的 XPath，并在 `done` 校验结果列表的顺序。指针和键盘动作走现有 ActionSpace。[运行时 API](./skills/midscene-replay/references/runtime-api.md)

支持退路的动作可以按需开启定位退路，让脚本在页面变化后继续运行：`fallback: 'guard'` 不调用模型，按身份 guard 在范围内重新找到唯一元素；`fallback: 'locate'` 再加一次有预算的 AI 定位，结果受范围和 guard 约束，并由必填的后置条件证明。退路只发生在派发之前。正式试跑关闭退路并给出修复提示；日常运行允许退路并报告每次恢复。宿主可用 `MIDSCENE_REPLAY_FALLBACK=off` 关闭。程序动作无需模型配置；真正调用 AI/Jev 时仍需配置。录制中的新页面用 Playwright 或 Puppeteer BrowserAgent 和 `rp.tap(description, {candidates, opensPage: {url: 'https://example.com/'}})`：先监听再点击，关联来源页面、切换活动页，核对准确 URL 与 DOM 就绪。超时不重点击，也不默认等待 load/networkidle。日常调用只执行一次并保留脚本必要检查。记录实际耗时，不设速度或截图次数门槛。

Playwright 的 Web 录制和回放已有本地闭环验证。Puppeteer 自定义会话已在公开 TodoMVC 页面和本地弹窗用例通过验证。录制和默认 Replay 宿主使用 Playwright。[Puppeteer 会话配置](./skills/midscene-replay/references/session.md#puppeteer-replay-host)

历史案例的报告只对应当时的脚本、运行时和会话。流程会向外部系统写入时，执行前确认环境、账号、目标、涉及步骤和所有轮次的预计写入次数。严格 iframe/Shadow DOM 定位和原生文件对话框仍不支持，移动端需要后续适配与验证。来源证据和业务检查支持 Agent 审阅，但不证明检查完备，也不隔离恶意脚本。详见[运行时 API](./skills/midscene-replay/references/runtime-api.md)与[定位退路](./skills/midscene-replay/references/fallback.md)。

## 开发

```sh
pnpm exec nx build @midscene/replay
pnpm exec nx test @midscene/replay
pnpm --filter @midscene/replay lint
```

实验包随附 CLI、Skill，以及 `@midscene/replay/experimental` / `@midscene/replay/tooling`。测试覆盖录制、原生动作、业务检查失败、证据保留和 Jev 结果。真实站点验收单独审阅，模型调用需要宿主凭据。

`replay-v1.0.0` 是 Replay 的基准 tag，早期 V6/V7 等名称对应开发快照。`source.json` 的 `6` 和录制 `trace.json` 的 `1` 分别是文件格式版本。CLI 的 `--version` 显示 Midscene SDK 包版本。
