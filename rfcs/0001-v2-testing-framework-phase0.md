# RFC 0001 · v2 Testing Framework — Phase 0 设计稿

状态：**草稿 / 待讨论**
范围：只覆盖 Phase 0 —— 节点模型、`midscene.config.ts`、`defineRuntime` / `$name` skill、verify 判定契约、output 契约与护栏、上下文装配。
不覆盖：Pi 内部实现、Rstest 接线细节、v1→v2 迁移工具。

> 本稿目标：把"动手前必须先定的接口"钉死成可评审的草案。每节末尾的 **🔶 待讨论** 是我留的开放决策点。

> **实现状态（Phase 0）**：本稿契约已落地为新包 `@midscene/testing-framework`（`packages/testing-framework`），含 `defineMidsceneConfig` / `defineRuntime`、v2 YAML 解析、节点引擎（`ui`/`verify`/`soft`/`agent`/自定义）、上下文装配、verify fail-closed 判定、默认 Pi 通用 agent（已解决 C′），以及一个轻量 runner 与 CLI（`midscene-tf`）。可 copy 演示的样例在仓库根 `example/`。唯一开放项 C′ 已落实（见 §4.1）。

---

## 0. 术语与分层回顾（已达成共识，作为前提）

- **新引擎，不改 `ScriptPlayer`**：v2 作为新包 `@midscene/testing-framework`，把 `@midscene/core` 的 `Agent` / Device / `ReportGenerator` 当库复用。
- **两类 Agent**：`ui` 节点 → Midscene **UI Agent**（`agent.aiAct` 等）；`verify` / `agent` 节点 → **可替换的通用 Agent 层**（当前 Pi）。
- **上下文契约**：执行任一 `verify` / `agent` 时，可见上下文 = `所有过往步骤(含意图) + 每步输出 + 当前 UI`，**没有别的**。
- **判定语义**：`verify` = 确定性闸门（gate CI）；`agent` = 探索性、非确定、**不参与 pass/fail**。

---

## 1. 用例文件（v2 YAML schema）

### 1.1 顶层

```yaml
name: Create Order          # 可选，人类可读名
flow:                       # 有序步骤列表
  - <step>
  - <step>
```

不再有 v1 的 `web:` / `android:` / `tasks:` 等顶层环境字段——**环境/target 全部移到 `midscene.config.ts`**。用例文件只描述"用户要完成什么"。

### 1.2 步骤（step）

每个 step 是一个单键 map，键 = 节点类型或自定义节点名，值 = 该节点的输入。

**内置节点（`ui` / `verify` / `agent`）的输入只有自然语言**，输出也用自然语言描述——**不引入 schema**。YAML 就是为简单而生，保持纯文本：

```yaml
flow:
  - ui: Search for "running shoes"
  - ui: |
      创建一笔测试订单。
      将这一步的输出命名为 createOrder，记录订单号 orderId 和页面状态 pageState。
  - verify: The product detail page shows a visible Add to cart button
  - agent: Freely inspect this page for anything that looks off
```

**自定义（runtime）节点的输入可以是 object**（指令不一定是文本）：

```yaml
flow:
  - prepareOrderFixture:
      scenario: paid-order
```

> 规则：内置节点的值是字符串；自定义节点的值可为字符串或 object，整个值作为 `input` 交给 runtime（见 §3）。

### 1.3 内置节点类型

| 节点 | 执行者 | 语义 | 能否 gate |
|---|---|---|---|
| `ui` | UI Agent | 自然语言 UI 操作 | 操作失败抛错 → case 失败 |
| `verify` | Pi Agent | 带判定的断言，必须给出 pass/fail | **是** |
| `soft` | Pi Agent | 软断言，同 `verify` 但失败只记 warning（§6.1） | **否** |
| `agent` | Pi Agent | 自由探索，产出诊断/建议 | **否**（advisory） |
| `<自定义名>` | runtime（TS） | 项目扩展节点（见 §3） | 抛错 → case 失败 |

**已定：`verify` / `agent` 只读 UI。** 它们只观察"当前截图"+ 调 skill，**不驱动页面**（不点击、不输入）；驱动页面只由 `ui` 和 runtime 负责。理由：gating 可控、避免 agent 中途把应用点到别处破坏后续步骤。"让 agent 自主驱动 UI 深查"作为后续扩展，Phase 0 不做。

---

## 2. `midscene.config.ts`

```ts
import { defineMidsceneConfig } from '@midscene/testing-framework';

export default defineMidsceneConfig({
  // —— 运行目标：单字段 uiAgent，容纳配置式与编程式（见 §2.1）——
  uiAgent:
    | { type: 'web' | 'android' | 'ios' | 'computer'; options: Record<string, unknown> }
    | ((ctx: UIAgentFactoryCtx) => Promise<{ agent: Agent }>);

  // —— 用例发现 ——
  testDir: string;
  include?: string[];                            // 默认 ['**/*.yaml']
  exclude?: string[];

  // —— 执行策略（对齐 Rstest 概念）——
  testRunner?: {
    maxConcurrency?: number;
    bail?: number;
    testTimeout?: number;
    retry?: number;
  };

  // —— 输出 ——
  output?: {
    summary?: string;
    reportDir?: string;
  };

  // —— 共享 UI Agent 参数 ——
  uiAgentOptions?: UIAgentOptions;               // aiActContext, generateReport, ...

  // —— 扩展点 ——
  runtime?: Record<string, RuntimeNode>;         // 自定义 YAML 节点（§3）
  generalAgent?: GeneralAgentAdapter;            // Pi 的替换点（§6）
});
```

**没有 `skills` 字段。** `$name` skill 不在 config 里注册——由 Pi 自行发现与加载，框架只负责"识别 `$name` 并交给 Pi"（见 §4）。

### 2.1 运行目标：单字段 `uiAgent`（已定）

**决定：用单个 `uiAgent` key 同时容纳配置式与编程式**（即上一轮的方案 b），且 key 名从 `target` 改为 `uiAgent`——和 `uiAgentOptions`、`RuntimeNodeContext.uiAgent` 统一命名，一眼看出这字段就是"UI Agent 怎么来"。

- 值是**对象** → 配置式：框架据 `type + options` 创建 UI Agent。
- 值是**函数** → 编程式：项目完全掌控构造。

两者唯一的 key，类型层就是 union，从根上消除"两套运行目标定义"的气味。`options`（平台连接参数，如 url / deviceId）与 `uiAgentOptions`（Agent 行为，如 aiActContext / generateReport）是两类不同的东西，都保留。

**配置式样例：**

```ts
import { defineMidsceneConfig } from '@midscene/testing-framework';

export default defineMidsceneConfig({
  uiAgent: {
    type: 'web',
    options: { url: 'https://shop.example.com' },   // 平台连接参数
  },

  testDir: './e2e',
  include: ['**/*.yaml'],

  testRunner: { maxConcurrency: 2, testTimeout: 120_000 },
  output: {
    summary: './midscene_run/output/summary.json',
    reportDir: './midscene_run/report',
  },

  uiAgentOptions: {                                  // Agent 行为参数
    aiActContext: 'The user is already signed in as a smoke-test account.',
    generateReport: true,
  },
});
```

**编程式样例（同一个 `uiAgent` key，填工厂函数）：**

```ts
import { agentFromAdbDevice } from '@midscene/android';
import { defineMidsceneConfig } from '@midscene/testing-framework';

export default defineMidsceneConfig({
  uiAgent: async ({ uiAgentOptions, env }) => ({
    agent: await agentFromAdbDevice(env.ANDROID_DEVICE_ID, {
      ...uiAgentOptions,
      androidAdbPath: env.ANDROID_ADB_PATH,
      autoDismissKeyboard: false,
    }),
  }),

  testDir: './e2e',
  uiAgentOptions: {
    aiActContext: 'The user is already signed in as a smoke-test account.',
    generateReport: true,
  },
});
```

### 2.2 配套的完整用例 YAML

用例文件里**没有任何环境/target**——那些都在 `midscene.config.ts`。`e2e/create-order.yaml` 就是纯 flow：

```yaml
name: Create Order

flow:
  - prepareOrderFixture:            # 自定义节点，input 为 object
      scenario: paid-order

  - ui: |                          # UI Agent，纯自然语言
      使用测试账号登录并创建一笔测试订单。
      将这一步的输出命名为 createOrder，记录订单号 orderId 与是否创建成功。

  - verify: |                      # Pi，$name skill 由 Pi 按需加载，强制 verdict
      使用 $database 验证名为 createOrder 的输出中的 orderId 真实存在，且状态为 paid。

  - verify: |
      使用 $logs 检查测试期间是否出现相关 ERROR。

  - verify: 订单详情页展示支付成功    # 纯 UI 截图判定

  - agent: 根据以上所有验证结果与当前截图，分析本次测试风险并给出后续建议  # advisory，不 gate

  - notifySlack                    # 自定义节点
```

目录结构：

```text
.
  midscene.config.ts
  e2e/
    create-order.yaml
    checkout.yaml
```

---

## 3. `defineRuntime` —— 自定义节点（更底层扩展）

```ts
type RuntimeNode = (ctx: RuntimeNodeContext) => Promise<RuntimeNodeResult>;

interface RuntimeNodeContext {
  input: unknown;                 // 该节点的 YAML 值（字符串或 object）
  uiAgent: Agent;                 // UI Agent，runtime 也可驱动页面
  outputs: OutputStore;           // 所有过往"面向上下文的输出"（只读）
  state: Record<string, unknown>; // ★ TS 侧状态，agent 看不到（见 §7）
  result: TestResultSoFar;        // 当前 case 已累积的结果
  env: NodeJS.ProcessEnv;
}

interface RuntimeNodeResult {
  conclusion: string;                       // ★ 面向上下文的输出，进 Pi 上下文
  output?: Record<string, unknown>;         // 可选结构化输出（同样进上下文）
}

function defineRuntime(node: RuntimeNode): RuntimeNode;
```

要点：
- `conclusion`（和可选 `output`）= **面向上下文信道**，进后续 `verify` / `agent`。
- `state` = **面向工程信道**，runtime 节点之间传结构化数据，**不进 agent 上下文**。
- runtime 抛错 → 该 case 失败。

---

## 4. `$name` skill —— 复用 Pi 自己的 Skills 机制

**已核对 Pi（earendil-works/pi）的实际能力**，结论：不用我们造轮子，直接复用 Pi 内建的 Skills。

Pi 的 Skills = Anthropic Agent-Skills 模型：每个 skill 是一个含 `SKILL.md`（YAML frontmatter：`name` + `description` + markdown 指令）的目录；**渐进式披露**——启动时只把各 skill 的 `name`/`description` 放进 system prompt，**完整指令按需加载**；模型在任务匹配时自行决定加载哪个。来源包括目录扫描、`package.json` 的 `skills/`、settings 的 `skills` 数组、CLI `--skill`。

Pi 的可嵌入 SDK（`@earendil-works/pi-coding-agent`）提供了我们需要的全部接线点：

```ts
import { createAgentSession, SessionManager, DefaultResourceLoader }
  from '@earendil-works/pi-coding-agent';

// 1) 把项目的 skills 提供给 Pi（让其 description 进上下文）
const loader = new DefaultResourceLoader({
  skillsOverride: (cur) => ({ skills: [...cur.skills, ...projectSkills], diagnostics: cur.diagnostics }),
});

// 2) 创建会话
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  resourceLoader: loader,
});

// 3) 跑一个 verify/agent 节点：当前截图直接作为 image 传入
await session.prompt(assembledContext, {
  images: [{ type: 'image', source: { type: 'base64', mediaType: 'image/png', data: screenshotBase64 } }],
});
```

**框架的全部职责，就这些：**
1. 把项目可用的 skills 通过 `resourceLoader` / `skillsOverride` 交给 Pi（描述进上下文）。
2. 组装上下文（§7）+ 当前截图（走 `prompt` 的 `images`）喂给 Pi。
3. 节点自然语言里的 `$database`、`$logs` 等 `$name` token 作为**引导**，让 Pi 自行按需加载对应 skill。

之后"加载哪个、怎么调、调几次"全由 Pi 决定，框架不介入。

**关于 `$name` 的激活方式（对应你的判断）**：Pi SDK **没有**"按名字强制激活 skill"的程序化入口——skill 是靠模型推理按需加载的。所以 `$name` 落地为**你说的那个方案：在 prompt 里引导 Pi 自行加载**。代价是多一步模型决策、略慢，但实现零特殊接口、最贴合 agentic。`$name` 这个显式 token 恰好是很强的加载信号，比纯靠 description 匹配更稳。

可选增强（非 Phase 0 必需）：框架可以静态提取 `$name` 集合，用来 ① 校验引用的 skill 是否存在（不存在直接报错，避免静默跑空）；② 把被引用的 skill 描述在 prompt 里置顶强调。但**激活本身仍是 Pi 按需加载**。

生命周期（已入用户文档）：**skill 结果只属于这一次执行**，不自动进后续上下文；要留就由当前节点写进自己的 output。

### 4.1 Pi 接线：已确认 vs 唯一缺口

已对照 Pi SDK 文档核实，下面这些**都已存在**，足够支撑 Phase 0：

| 需求 | Pi SDK | 状态 |
|---|---|---|
| 单节点跑完整 agent loop（多轮工具调用直到结束） | `session.prompt()` 跑完整 loop，turn 结束才 resolve | ✅ |
| 读 agent 最终结果 | `subscribe` 的 `turn_end` 事件，带 `message` + `toolResults` | ✅ |
| 注入当前截图 | `prompt(text, { images: [{ base64 png }] })` | ✅ |
| 自定义 tool（verify 的 verdict 工具） | `customTools: [defineTool(...)]` 或 extension `pi.registerTool` | ✅ |
| skills 注入 | `DefaultResourceLoader` + `skillsOverride` | ✅ |
| 选模型 / 鉴权 | `getModel(provider, model)`；`AuthStorage.setRuntimeApiKey` 或 env | ✅ |

✅ **C′ 已落实（不再是开放项）**：核对 Pi SDK 源码（`@earendil-works/pi-coding-agent` 0.78）确认 `ModelRegistry.registerProvider(name, config)` 接受 `baseUrl` + `apiKey` + 一组 `models`（可指定 `api: 'openai-completions'`、`input: ['text','image']`）。因此框架可以：

```ts
const authStorage = AuthStorage.inMemory();
const registry = ModelRegistry.inMemory(authStorage);
registry.registerProvider('midscene', {
  baseUrl: process.env.MIDSCENE_MODEL_BASE_URL,
  apiKey: process.env.MIDSCENE_MODEL_API_KEY,
  models: [{
    id: process.env.MIDSCENE_MODEL_NAME, name: process.env.MIDSCENE_MODEL_NAME,
    api: 'openai-completions', reasoning: false, input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000, maxTokens: 8_192,
  }],
});
const model = registry.find('midscene', process.env.MIDSCENE_MODEL_NAME);
const { session } = await createAgentSession({ model, modelRegistry: registry, authStorage, ... });
```

这样 `verify`/`agent`（Pi）与 `ui`（Midscene UI Agent）走**同一个 `MIDSCENE_MODEL_BASE_URL` 端点**，零 Pi 改动。实现见 `@midscene/testing-framework` 的 `PiGeneralAgent`（`src/general-agent/pi-general-agent.ts`），并有 `tests/smoke/pi-wiring.mjs` 验证（provider 注册 / apiKey 解析 / session 选模型 / `report_verdict` customTool 激活）均通过。

> 注：`MIDSCENE_MODEL_EXTRA_BODY_JSON`（如 `{"service_tier":"fast"}`）只对 `ui` 节点的 Midscene UI Agent 生效；Phase 0 未把它透传给 Pi 节点（属性能优化、非正确性，后续可经 stream `onPayload` 接入）。

---

## 5. output —— 纯自然语言，不做 schema

**决定：output 没有 schema。** YAML 就是为简单而生，schema 会让作者搞不清楚，违背初衷。每个步骤的输出就是一段自然语言——要命名、要记哪些字段，都在自然语言里说清楚：

```yaml
- ui: |
    创建一笔测试订单。
    将这一步的输出命名为 createOrder，记录订单号 orderId 和页面状态 pageState。
```

后续节点同样用自然语言引用"名为 createOrder 的输出中的 orderId"。命名是为了**无歧义指代**，不是为了校验。

**已知取舍（明确接受）**：output 是 LLM 生成的自然语言，缺字段不会硬失败——"静默丢字段"的风险在 Phase 0 **不做引擎级护栏**。

**后续迭代的兜底**：真要确定性校验时，单独做一个**校验代码节点**（一个 runtime 节点形态的 TS 校验，从 `outputs` 里取值、用代码断言、不通过就 fail），而**不是**往 YAML 里塞 schema。把"确定性证据"留在 TS 侧，YAML 侧保持纯自然语言。这条排进 Phase 0 之后。

---

## 6. verify 判定契约

`verify` 跑的是 Pi Agent（自由推理），但必须落到结构化判定。

**提案：verify 节点强制收尾一个结构化 verdict。**

```ts
interface Verdict {
  pass: boolean;
  reason: string;            // 人类可读判定依据
  evidence?: unknown;        // 可选：截图引用、skill 返回片段等
}
```

**落地方式（已据 Pi SDK 确认）**：Pi 没有原生"强制 JSON 输出"，但有 `customTools`——所以引擎给 `verify` 这次运行注册一个 `report_verdict` 工具，并在 prompt 里要求 agent 在收尾时调用它；verdict 从 `turn_end` 的 `toolResults` 里取：

```ts
const reportVerdict = defineTool({
  name: 'report_verdict',
  description: '在判定完成时调用，提交本次 verify 的结论',
  parameters: Type.Object({
    pass: Type.Boolean(),
    reason: Type.String(),
    evidence: Type.Optional(Type.Unknown()),
  }),
  execute: async (_id, v) => v,        // 引擎从 toolResults 读回
});
```

失败模型 **fail-closed**：
- `pass === false` → 该 case 失败；
- agent 没调 `report_verdict` / 无法解析 → **也判失败**（不确定一律按失败处理）；
- `reason` 始终写进报告。

`agent` 节点不收 verdict，其输出永远不改变 case 的 pass/fail。

### 6.1 `soft` —— 过渡期软断言（已定：做）

给一个"想看但还不想 gate"的档位：`soft` 和 `verify` 用法完全一样、同样产出 `Verdict` 进报告，**区别只在失败时不让 case 变红、不中断后续步骤**（只记录为 warning）。

```yaml
flow:
  - verify: 订单详情页展示支付成功        # 失败 → case 红
  - soft: 页面没有明显的布局错位      # 失败 → 仅记录 warning，不 gate
```

为什么做成**独立节点**而不是给 `verify` 加 `soft: true` 标志：§1.2 定了内置节点输入只有自然语言、不带 object/flag。新增一个 `soft` 节点类型，既保住"纯自然语言输入"，又把"软/硬"表达得一眼清楚。

命名：**`soft`**（已定）。在 flow 里紧挨 `verify` 出现，`- soft: ...` 自然读作"soft (verify)"，短、够清楚。

失败模型：`soft` `pass:false` → 记 warning，**不改变** case pass/fail；其余与 `verify` 一致（未产出 verdict 也按 warning 处理）。

---

## 7. 上下文装配（把文档契约形式化）

执行某个 `verify` / `agent` 时，引擎注入 Pi 的上下文**精确等于**：

```
对每个过往步骤（按顺序）：
  - 节点类型 + 指令（自然语言文本，或自定义节点的 object 输入）
  - 该步骤的输出（自然语言；runtime 节点为其 conclusion）
  - 若是 verify：其 pass/fail 与 reason
+ 当前 UI 截图（仅当前这一张）
+ 本节点预载入 Pi 的 skills（见 §4）
```

**显式排除**（"没有别的"）：执行过程 trace、历史截图、`context.state`、过往 skill 调用的中间结果。

**已定：Phase 0 不截断。** 长 flow 的上下文会随"所有过往输出"线性增长，但我们选择**预测性 > 紧凑性**（一截断"可推理"卖点就破）。截断/压缩策略后面要加也容易，先不做。

---

## 8. 失败模型汇总

| 情况 | 结果 |
|---|---|
| `ui` 操作失败抛错 | case 失败 |
| `verify` `pass:false` | case 失败 |
| `verify` 未产出 / 无法解析 verdict | case 失败（fail-closed） |
| `soft` `pass:false` 或未产出 | 记 warning，**不改变** case pass/fail |
| `agent` 内部出错 | 记录为诊断，**不改变** case pass/fail |
| runtime 节点抛错 | case 失败 |

---

## 9. 端到端示例

完整的 `midscene.config.ts` + 用例 YAML 配套样例见 **§2.1 / §2.2**（贯穿 `uiAgent`、自定义节点、`ui`、`verify`、`agent`、`$name` skill 的全链路）。`soft` 的用法见 **§6.1**。

---

## 10. 决策状态汇总

### 已定（本轮拍板）

| 决策 | 结论 |
|---|---|
| `ui`/`verify`/`agent` 输入 | 纯自然语言，无 schema |
| `verify` / `agent` 与 UI | 只读，不驱动页面（驱动留给后续扩展） |
| output | 纯自然语言，无 schema；确定性校验后续做成 TS 校验节点 |
| config `skills` 字段 | 不要；skill 由 Pi 自行发现/加载 |
| 框架对 skill 的职责 | 只识别 `$name` + 调 Pi 方法预载入，其余交给 Pi |
| `RuntimeNodeContext` 字段名 | `agent` → `uiAgent` |
| verify 判定契约 | 做：`report_verdict` customTool + `turn_end.toolResults`，fail-closed（§6） |
| 软断言（F） | 做：独立节点 **`soft`**，失败只记 warning（§6.1） |
| 运行目标（B） | 单字段 `uiAgent`，union 容纳配置式对象 / 编程式工厂（§2.1） |
| skill 机制（C） | 复用 Pi 内建 Skills；框架经 `resourceLoader` 提供、`$name` 在 prompt 里引导按需加载（§4） |
| Pi 接线（loop / 截图 / tool / 模型） | 已确认 SDK 支持（§4.1） |
| 节点指令形态 | 内置=文本；自定义=文本或 object |
| 长 flow 上下文 | 不截断（Phase 0） |

### 待对接

| # | 事项 | 状态 |
|---|---|---|
| C′ | Pi 能否指定自定义模型 **base URL**（对齐 `MIDSCENE_MODEL_BASE_URL`），让 verify/agent 与 ui 同端点 | ✅ **已落实**：经 `ModelRegistry.registerProvider({ baseUrl, apiKey, models })` 实现，见 §4.1 与 `PiGeneralAgent` |

（无剩余待对接项。）

---

## 附：Phase 0 之后（不在本稿讨论范围，仅备忘）

- Pi `GeneralAgentAdapter` 的最小接口（让 Codex Agent SDK 等可替换）。
- Rstest 接线：用例 → 虚拟测试模块 → 生命周期/fixture 映射。
- 报告：复用 core `ReportGenerator`，把 verify verdict / agent 诊断如何呈现。
- v1→v2 转译器（可选、外挂）。
