# RFC 0001 · Workflow Engine Node Definition API

状态：**草稿 / 待评审**

范围：定义 workflow engine 中“开发者如何编写节点”的首期 TypeScript API，包括节点业务参数、通用 `prompt`、engine `$` meta、执行上下文、输出、错误与校验边界。

不覆盖：完整工具权限模型、远程节点协议、DAG/并行调度、报告 UI、具体 Midscene/Pi/database/Slack 预置节点实现。

---

## 1. 背景

Workflow YAML 的首期 step 契约采用如下形态：

```yaml
workflow:
  - some.node:
      prompt: Do something.
      $:
        timeout: 60000
        continue-on-error: true
      foo: bar
```

约定：

- `$` 是 engine meta namespace。
- 首期 `$` 只支持 `timeout` 和 `continue-on-error`。
- `$` 外所有字段都是当前节点的业务 input。
- `prompt` 是通用业务 input，不是 engine meta。
- 节点值为字符串时，engine 将它展开为 `{ prompt: value }`。这是只传入
  `prompt` 时的简写模式。

例如，下面两种写法完全等价：

```yaml
workflow:
  - some.node: 'string-content'
```

```yaml
workflow:
  - some.node:
      prompt: 'string-content'
```

本 RFC 从这个 YAML 形态反推开发者侧节点定义 API。

---

## 2. 设计目标

1. **节点作者只处理业务参数**：节点收到的 input 不包含 `$`。
2. **`prompt` 是 common input**：所有节点都可以接收 `prompt`。需要 `prompt`
   的节点自行校验。
3. **engine 统一处理 `$`**：`timeout` 和 `continue-on-error` 由 engine 包装执行，不由节点重复实现。
4. **输出形态统一**：节点可以不返回结果；返回 `NodeResult` 时，`summary` 和
   `data` 均为可选字段。engine 负责包装 step run result。
5. **错误模型简单**：节点失败时 throw；engine 根据 `continue-on-error` 决定是否继续。
6. **类型定义简单**：节点开发者可以通过 TypeScript 泛型定义 `ctx.input` 和
   `return data` 的类型。
7. **为后续工具、报告、registry 留扩展点**：首期 API 小，但不堵住未来能力。

---

## 3. 分层原则

### 3.1 Engine meta 与 node input 分离

YAML：

```yaml
workflow:
  - http.request:
      prompt: Create a paid order through internal test API.
      $:
        timeout: 20000
        continue-on-error: false
      method: POST
      url: /internal/test/orders
      body:
        scenario: paid-order
```

normalize 后：

```ts
{
  node: 'http.request',
  meta: {
    timeoutMs: 20_000,
    continueOnError: false,
  },
  input: {
    prompt: 'Create a paid order through internal test API.',
    method: 'POST',
    url: '/internal/test/orders',
    body: { scenario: 'paid-order' },
  },
}
```

开发者定义 `http.request` 时，只声明 `method`、`url`、`body` 等业务字段；不声明 `$`。

### 3.2 字符串节点值的简写模式

当节点值是 YAML 字符串时，engine 必须先将它展开为只包含 `prompt` 的
input，再执行节点查找和 common input 校验。

```yaml
workflow:
  - agent.verify: The order detail page shows payment success.
```

等价于：

```yaml
workflow:
  - agent.verify:
      prompt: The order detail page shows payment success.
```

normalize 后：

```ts
{
  node: 'agent.verify',
  meta: {
    continueOnError: false,
  },
  input: {
    prompt: 'The order detail page shows payment success.',
  },
}
```

简写模式遵循以下规则：

- 单行字符串和 YAML block scalar 都可以作为 `prompt`。
- 简写模式只能传入 `prompt`。需要传入 `$` 或其他业务字段时，必须使用
  mapping 形式。
- `null`、number、boolean、sequence 等非字符串值不能作为简写，engine
  应报告 step 解析错误。
- 简写模式和 mapping 形式使用相同的节点校验逻辑。节点需要 `prompt` 时，
  必须自行校验。

### 3.3 节点不负责实现 timeout / continue-on-error

节点执行函数只做业务逻辑：

- 成功：正常完成执行，可以返回 `NodeResult`，也可以不返回结果。
- 失败：throw error。
- 取消或超时：尊重 `ctx.signal`。

engine 负责：

- 解析 `$`。
- 启动 timeout。
- 触发 `AbortSignal`。
- 捕获异常。
- 根据 `continue-on-error` 决定继续或终止 workflow。

---

## 4. 首期核心类型

### 4.1 Duration

```ts
export type DurationInput = number;

export interface NormalizedStepMeta {
  timeoutMs?: number;
  continueOnError: boolean;
}
```

建议：

- YAML `timeout` 只接受 number，单位固定为毫秒。
- `500ms`、`20s`、`2m` 等字符串不是合法的 duration input。
- YAML 解析和内部执行阶段都使用毫秒，不进行单位换算。

### 4.2 Common node input

```ts
export interface CommonNodeInput {
  prompt?: string;
}
```

`prompt` 是 `$` 外字段，因此属于 node input。engine 自动把它合并到每个节点
的 input 类型。

简写模式只影响 YAML 的解析和 normalize，不改变 `CommonNodeInput`。节点执行
时，`ctx.input.prompt` 始终使用展开后的字符串值。

### 4.3 Node result

```ts
export interface NodeResult<TData = unknown> {
  /** Human-readable summary for reports and later agent context. */
  summary?: string;

  /** Structured data for later steps. */
  data?: TData;
}
```

`NodeResult` 整体也是可选的。节点可以返回完整结果、只返回 `summary`、只返回
`data`，或不返回任何结果。

节点不直接返回 step status。执行函数正常完成时，engine 将 step 标记为
success，无论节点是否返回 `NodeResult`。执行函数 throw 或超时时，engine 将
step 标记为 failed。

### 4.4 Node execution context

```ts
export interface NodeExecutionContext<TInput = unknown> {
  /** `$` 外的 node input，包含 common prompt。 */
  input: TInput & CommonNodeInput;

  /** 当前 step 的 `$` 配置，使用 normalized value。 */
  $: Readonly<NormalizedStepMeta>;

  /** Timeout / cancellation signal. */
  signal: AbortSignal;
}
```

`ctx.$` 是节点开发者可以正常使用的执行配置，不属于需要隐藏的 engine 内部
状态。节点读取的是规范化后的 `timeoutMs` 和 `continueOnError`。

节点实现直接导入业务依赖，或通过工厂函数注入依赖。engine 不通过执行上下文
注入通用运行时依赖。

### 4.5 Step run result

```ts
export interface StepRunResult<TOutputData = unknown> {
  node: string;
  input: unknown;
  meta: NormalizedStepMeta;
  status: 'success' | 'failed';
  continuedAfterError: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  output?: NodeResult<TOutputData>;
  error?: WorkflowError;
}
```

`continue-on-error: true` 的失败节点应表现为：

```ts
{
  status: 'failed',
  continuedAfterError: true,
  error: ...,
}
```

而不是伪装成 success。

---

## 5. defineNode API

### 5.1 推荐调用方式

```ts
export const slackNotifyNode = defineNode<
  SlackNotifyInput,
  SlackNotifyData
>({
  name: 'slack.notify',

  async execute(ctx) {
    const messageId = await sendSlackTemplate({
      channel: ctx.input.channel,
      template: ctx.input.template,
      variables: ctx.input.variables,
      signal: ctx.signal,
    });

    return {
      summary: `Sent Slack message to ${ctx.input.channel}.`,
      data: {
        messageId,
        channel: ctx.input.channel,
      },
    };
  },
});
```

对应 YAML：

```yaml
workflow:
  - slack.notify:
      prompt: Send workflow summary to the QA smoke channel.
      $:
        timeout: 10000
        continue-on-error: true
      channel: "#qa-smoke"
      template: workflow-summary
      variables:
        status: "{{ workflow.status }}"
```

### 5.2 TypeScript 签名草案

```ts
export interface DefineNodeOptions<TInput = unknown, TData = unknown> {
  name: string;
  title?: string;
  description?: string;

  execute(
    ctx: NodeExecutionContext<TInput>,
  ): Promise<NodeResult<TData> | void> | NodeResult<TData> | void;
}

export interface NodeDefinition<TInput = unknown, TData = unknown> {
  name: string;
  title?: string;
  description?: string;
  execute(
    ctx: NodeExecutionContext<TInput>,
  ): Promise<NodeResult<TData> | void> | NodeResult<TData> | void;
}

export function defineNode<TInput = unknown, TData = unknown>(
  options: DefineNodeOptions<TInput, TData>,
): NodeDefinition<TInput, TData>;
```

`defineNode` 没有 `input` 或 `output` 配置项。节点需要静态类型时，通过
`defineNode<TInput, TData>` 传入 TypeScript 类型。engine 把 `$` 外字段作为
`ctx.input` 传给节点；节点负责校验专属业务字段。校验失败时，节点应 throw
`NodeInputValidationError`。

### 5.3 资源生命周期

首期 node definition 只提供 `execute`，不提供 `setup` 或 `teardown` hook。
节点需要创建和释放资源时，应在 `execute` 内使用 `try/finally`：

```ts
export const databaseNode = defineNode<QueryInput, QueryOutput>({
  name: 'database.query',

  async execute(ctx) {
    const connection = await database.connect();

    try {
      const rows = await connection.query(ctx.input.sql);
      return { data: { rows } };
    } finally {
      await connection.close();
    }
  },
});
```

如果后续需要在多个 step 之间共享资源，再单独设计 workflow 级生命周期。

---

## 6. 示例节点

### 6.1 HTTP request

```ts
export const httpRequestNode = defineNode<
  HttpRequestInput,
  HttpRequestData
>({
  name: 'http.request',
  title: 'HTTP Request',
  description: 'Sends an HTTP request and returns status, headers, and body.',

  async execute(ctx) {
    const response = await fetch(ctx.input.url, {
      method: ctx.input.method,
      headers: ctx.input.headers,
      body:
        ctx.input.body === undefined
          ? undefined
          : JSON.stringify(ctx.input.body),
      signal: ctx.signal,
    });

    const body =
      ctx.input.responseType === 'text'
        ? await response.text()
        : await response.json();

    return {
      summary: `${ctx.input.method} ${ctx.input.url} returned ${response.status}.`,
      data: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      },
    };
  },
});
```

YAML：

```yaml
workflow:
  - http.request:
      prompt: Create a paid order through internal test API.
      $:
        timeout: 20000
      method: POST
      url: "{{ env.API_BASE_URL }}/internal/test/orders"
      headers:
        Authorization: "Bearer {{ secrets.INTERNAL_API_TOKEN }}"
      body:
        scenario: paid-order
```

### 6.2 Agent verify

```ts
export const agentVerifyNode = defineNode<
  AgentVerifyInput,
  AgentVerifyData
>({
  name: 'agent.verify',
  title: 'Agent Verify',
  description: 'Runs an agentic verification and fails if the verdict is false.',

  async execute(ctx) {
    const prompt = ctx.input.prompt;
    if (!prompt) {
      throw new NodeInputValidationError('prompt is required');
    }

    const verdict = await verifyWithAgent({
      prompt,
      input: ctx.input,
      signal: ctx.signal,
    });

    if (!verdict.pass) {
      throw new AgentVerificationError(verdict.reason, {
        evidence: verdict.evidence,
      });
    }

    return {
      summary: verdict.reason,
      data: verdict,
    };
  },
});
```

YAML：

```yaml
workflow:
  - agent.verify:
      prompt: The order detail page shows payment success.
      $:
        timeout: 60000
        continue-on-error: false
      expectedStatus: paid
```

### 6.3 Midscene UI

```ts
export const midsceneUiNode = defineNode<
  MidsceneUiInput,
  MidsceneUiData
>({
  name: 'midscene.ui',
  title: 'Midscene UI Action',
  description: 'Runs a natural-language UI task with a Midscene UI Agent.',

  async execute(ctx) {
    const prompt = ctx.input.prompt;
    if (!prompt) {
      throw new NodeInputValidationError('prompt is required');
    }

    const agent = await createMidsceneUiAgent();

    if (ctx.input.startUrl) {
      await agent.goto(ctx.input.startUrl, { signal: ctx.signal });
    }

    if (ctx.input.viewport) {
      await agent.setViewport(ctx.input.viewport);
    }

    const result = await agent.aiAct(prompt, {
      account: ctx.input.account,
      signal: ctx.signal,
    });

    return {
      summary: result.summary,
      data: {
        text: result.text,
        fields: result.fields,
      },
    };
  },
});
```

YAML：

```yaml
workflow:
  - midscene.ui:
      prompt: |
        Open the storefront, sign in as the smoke-test user,
        create a paid order, and record the order id and page state.
      $:
        timeout: 180000
      startUrl: https://shop.example.com
      viewport:
        width: 1440
        height: 900
```

---

## 7. Engine execution wrapper

Pseudo implementation:

```ts
async function runStep(step: NormalizedStep, node: NodeDefinition) {
  const abort = new AbortController();
  const timeout = step.meta.timeoutMs
    ? setTimeout(() => abort.abort(), step.meta.timeoutMs)
    : undefined;

  try {
    const input = step.input;

    const output = await node.execute({
      input,
      $: step.meta,
      signal: abort.signal,
    });

    return markStepSuccess(output);
  } catch (error) {
    const normalized = normalizeWorkflowError(error);

    if (step.meta.continueOnError) {
      return markStepFailedAndContinue(normalized);
    }

    throw normalized;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
```

Notes:

- Timeout should abort through `AbortSignal`.
- If an underlying API does not support `AbortSignal`, the node should still check `ctx.signal.aborted` at safe boundaries.
- `continue-on-error` never converts failure into success.

---

## 8. Error classes

```ts
export class WorkflowError extends Error {
  code: string;
  details?: unknown;
}

export class NodeInputValidationError extends WorkflowError {}

export class StepTimeoutError extends WorkflowError {
  timeoutMs: number;
}

export class NodeExecutionError extends WorkflowError {
  node: string;
}

```

节点的业务错误由节点开发者自行定义。例如，`AgentVerificationError` 属于
`agent.verify` 节点，不由 workflow engine 提供。

Guidance:

- Invalid YAML, invalid step shorthand, or invalid `$` -> parser / meta validation error.
- Invalid node business input -> node throws `NodeInputValidationError`.
- Node-specific business failure -> error defined and thrown by the node.
- Unexpected node failure -> `NodeExecutionError` wrapping original error.
- Timeout -> `StepTimeoutError`.

---

## 9. Initial Recommendation

首期推荐实现最小 API：

```ts
export const node = defineNode({
  name: 'some.node',

  async execute(ctx) {
    const prompt = ctx.input.prompt;
    if (!prompt) {
      throw new NodeInputValidationError('prompt is required');
    }

    await runTask(prompt, { signal: ctx.signal });
  },
});
```

对应 YAML：

```yaml
workflow:
  - some.node:
      prompt: Process foo.
      $:
        timeout: 30000
        continue-on-error: false
```

核心边界保持不变：

- `$` 由 engine 解析和执行。
- 节点可以通过 `ctx.$` 读取规范化后的 `$` 配置。
- `$` 外的节点专属业务字段由节点自行校验。
- `prompt` 是 common business input。
- 节点正常完成表示成功，无论是否返回 `NodeResult`；throw 表示失败。
- engine 根据 `continue-on-error` 处理失败后的 workflow 走向。
