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
        timeout: 60s
        continue-on-error: true
      foo: bar
```

约定：

- `$` 是 engine meta namespace。
- 首期 `$` 只支持 `timeout` 和 `continue-on-error`。
- `$` 外所有字段都是当前节点的业务 input。
- `prompt` 是通用业务 input，不是 engine meta。
- 字符串 step value 是 `{ prompt: value }` 的简写。

本 RFC 从这个 YAML 形态反推开发者侧节点定义 API。

---

## 2. 设计目标

1. **节点作者只声明业务参数**：节点 schema 不需要包含 `$`。
2. **`prompt` 是 common input**：所有节点默认可以接收 `prompt`，节点可声明它是 required / optional / ignored。
3. **engine 统一处理 `$`**：`timeout` 和 `continue-on-error` 由 engine 包装执行，不由节点重复实现。
4. **输出形态统一**：节点返回 `summary + data + artifacts`，engine 再包装成 step run result。
5. **错误模型简单**：节点失败时 throw；engine 根据 `continue-on-error` 决定是否继续。
6. **类型推导友好**：节点开发者写 schema 后，`ctx.input` 和 `return data` 尽量有静态类型。
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
        timeout: 20s
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

### 3.2 节点不负责实现 timeout / continue-on-error

节点执行函数只做业务逻辑：

- 成功：return `NodeResult`。
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
export type DurationInput = string | number;

export interface NormalizedStepMeta {
  timeoutMs?: number;
  continueOnError: boolean;
}
```

建议：

- YAML string 支持 `500ms`、`20s`、`2m` 等 duration。
- YAML number 如果允许，必须明确单位；建议内部统一为毫秒。
- 内部执行阶段只使用 `timeoutMs`。

### 4.2 Common node input

```ts
export interface CommonNodeInput {
  prompt?: string;
}
```

`prompt` 是 `$` 外字段，因此属于 node input。engine 可以把它作为 common input 自动合并到每个节点 schema。

### 4.3 Node result

```ts
export interface NodeResult<TData = unknown> {
  /** Human-readable summary for reports and later agent context. */
  summary: string;

  /** Structured data for later steps. */
  data?: TData;

  /** Screenshots, logs, traces, files, or report fragments. */
  artifacts?: ArtifactRef[];
}

export interface ArtifactRef {
  id: string;
  kind: string;
  uri: string;
  title?: string;
  metadata?: Record<string, unknown>;
}
```

节点不直接返回 step status。step status 由 engine 根据 return / throw / timeout 计算。

### 4.4 Node execution context

```ts
export interface NodeExecutionContext<TInput = unknown> {
  /** `$` 外的 node input，包含 common prompt。 */
  input: TInput & CommonNodeInput;

  /** 当前 step 的 normalized engine meta。 */
  meta: NormalizedStepMeta;

  /** 已完成步骤的输出。 */
  outputs: OutputStore;

  /** 节点之间共享的工程状态；默认不进入 agent 上下文。 */
  state: Record<string, unknown>;

  /** Engine logger. */
  logger: WorkflowLogger;

  /** Timeout / cancellation signal. */
  signal: AbortSignal;

  /** Environment access. */
  env: NodeJS.ProcessEnv;

  /** Runtime capabilities exposed by host application. */
  runtime: WorkflowRuntime;
}
```

首期 `runtime` 可以很薄，只承载宿主注入的能力；工具权限模型后续再单独 RFC。

### 4.5 Output store

```ts
export interface OutputStore {
  get<T = unknown>(stepIdOrName: string): StepRunResult<T> | undefined;
  all(): Record<string, StepRunResult>;
}
```

如果首期还没有 step id / output name，可先使用顺序索引或内部 step key；但 API 应预留命名输出能力。

### 4.6 Step run result

```ts
export interface StepRunResult<TData = unknown> {
  node: string;
  input: unknown;
  meta: NormalizedStepMeta;
  status: 'success' | 'failed' | 'skipped';
  continuedAfterError: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  output?: NodeResult<TData>;
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
export const slackNotifyNode = defineNode({
  name: 'slack.notify',

  input: z.object({
    channel: z.string(),
    template: z.string(),
    variables: z.record(z.unknown()).optional(),
  }),

  output: z.object({
    messageId: z.string(),
    channel: z.string(),
  }),

  async execute(ctx) {
    const messageId = await ctx.runtime.slack.sendTemplate({
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
        timeout: 10s
        continue-on-error: true
      channel: "#qa-smoke"
      template: workflow-summary
      variables:
        status: "{{ workflow.status }}"
```

### 5.2 TypeScript 签名草案

```ts
export interface DefineNodeOptions<TInput, TData = unknown> {
  name: string;
  title?: string;
  description?: string;

  /** Node-specific business input schema. `$` is never included here. */
  input?: Schema<TInput>;

  /** Schema for NodeResult.data. */
  output?: Schema<TData>;

  capabilities?: NodeCapabilities;

  execute(
    ctx: NodeExecutionContext<TInput & CommonNodeInput>,
  ): Promise<NodeResult<TData>> | NodeResult<TData>;
}

export interface NodeDefinition<TInput = unknown, TData = unknown> {
  name: string;
  title?: string;
  description?: string;
  input?: Schema<TInput>;
  output?: Schema<TData>;
  capabilities: Required<NodeCapabilities>;
  execute(
    ctx: NodeExecutionContext<TInput & CommonNodeInput>,
  ): Promise<NodeResult<TData>> | NodeResult<TData>;
}

export function defineNode<TInput, TData = unknown>(
  options: DefineNodeOptions<TInput, TData>,
): NodeDefinition<TInput & CommonNodeInput, TData>;
```

### 5.3 Node capabilities

```ts
export interface NodeCapabilities {
  /** Whether prompt is required, optional, or ignored by this node. */
  prompt?: 'required' | 'optional' | 'ignored';

  /** Side-effect classification for docs, auditing, and future scheduling. */
  sideEffect?: 'none' | 'read' | 'write' | 'external';

  /** Future-facing metadata; YAML `$` does not support retry in phase 1. */
  retryable?: boolean;
}
```

Default capabilities:

```ts
{
  prompt: 'optional',
  sideEffect: 'external',
  retryable: false,
}
```

If `capabilities.prompt === 'required'`, engine should validate `ctx.input.prompt` before calling `execute`.

---

## 6. Schema abstraction

首期可以选择 Zod、TypeBox、JSON Schema，或定义一个窄接口以避免绑定：

```ts
export interface Schema<T = unknown> {
  parse(value: unknown): T;
  jsonSchema?: unknown;
}
```

推荐要求：

- schema 能在 runtime 校验 YAML input。
- schema 能为 TypeScript 推导 `ctx.input`。
- schema 最好能导出 JSON Schema，便于后续生成文档和 IDE autocomplete。

如果选择 Zod-first：

```ts
import { z } from '@midscene/workflow';

input: z.object({
  channel: z.string(),
});
```

如果选择 TypeBox-first：

```ts
import { Type } from '@sinclair/typebox';

input: Type.Object({
  channel: Type.String(),
});
```

本 RFC 不强制具体 schema 库，只要求 `defineNode` 能从 schema 得到 runtime validation 与 TypeScript 类型。

---

## 7. 示例节点

### 7.1 HTTP request

```ts
export const httpRequestNode = defineNode({
  name: 'http.request',
  title: 'HTTP Request',
  description: 'Sends an HTTP request and returns status, headers, and body.',

  capabilities: {
    prompt: 'optional',
    sideEffect: 'external',
    retryable: false,
  },

  input: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string(),
    headers: z.record(z.string()).optional(),
    query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    body: z.unknown().optional(),
    responseType: z.enum(['json', 'text']).default('json'),
  }),

  output: z.object({
    status: z.number(),
    headers: z.record(z.string()),
    body: z.unknown(),
  }),

  async execute(ctx) {
    const response = await ctx.runtime.fetch(ctx.input.url, {
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
        timeout: 20s
      method: POST
      url: "{{ env.API_BASE_URL }}/internal/test/orders"
      headers:
        Authorization: "Bearer {{ secrets.INTERNAL_API_TOKEN }}"
      body:
        scenario: paid-order
```

### 7.2 Agent verify

```ts
export const agentVerifyNode = defineNode({
  name: 'agent.verify',
  title: 'Agent Verify',
  description: 'Runs an agentic verification and fails if the verdict is false.',

  capabilities: {
    prompt: 'required',
    sideEffect: 'read',
    retryable: false,
  },

  input: z.object({
    expectedStatus: z.string().optional(),
    evidence: z.record(z.unknown()).optional(),
  }),

  output: z.object({
    pass: z.boolean(),
    reason: z.string(),
    evidence: z.unknown().optional(),
  }),

  async execute(ctx) {
    const verdict = await ctx.runtime.agent.verify({
      prompt: ctx.input.prompt!,
      input: ctx.input,
      outputs: ctx.outputs,
      signal: ctx.signal,
    });

    if (!verdict.pass) {
      throw new WorkflowAssertionError(verdict.reason, {
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
        timeout: 60s
        continue-on-error: false
      expectedStatus: paid
```

### 7.3 Midscene UI

```ts
export const midsceneUiNode = defineNode({
  name: 'midscene.ui',
  title: 'Midscene UI Action',
  description: 'Runs a natural-language UI task with a Midscene UI Agent.',

  capabilities: {
    prompt: 'required',
    sideEffect: 'write',
    retryable: false,
  },

  input: z.object({
    startUrl: z.string().url().optional(),
    account: z
      .object({
        email: z.string(),
        password: z.string(),
      })
      .optional(),
    viewport: z
      .object({
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  }),

  output: z.object({
    text: z.string().optional(),
    fields: z.record(z.unknown()).optional(),
  }),

  async execute(ctx) {
    const agent = await ctx.runtime.get('midscene.uiAgent');

    if (ctx.input.startUrl) {
      await agent.goto(ctx.input.startUrl, { signal: ctx.signal });
    }

    if (ctx.input.viewport) {
      await agent.setViewport(ctx.input.viewport);
    }

    const result = await agent.aiAct(ctx.input.prompt!, {
      account: ctx.input.account,
      signal: ctx.signal,
    });

    return {
      summary: result.summary,
      data: {
        text: result.text,
        fields: result.fields,
      },
      artifacts: result.artifacts,
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
        timeout: 180s
      startUrl: https://shop.example.com
      viewport:
        width: 1440
        height: 900
```

---

## 8. Engine execution wrapper

Pseudo implementation:

```ts
async function runStep(step: NormalizedStep, node: NodeDefinition) {
  const abort = new AbortController();
  const timeout = step.meta.timeoutMs
    ? setTimeout(() => abort.abort(), step.meta.timeoutMs)
    : undefined;

  try {
    const input = validateNodeInput(node, step.input);
    validatePromptCapability(node, input);

    const output = await node.execute({
      input,
      meta: step.meta,
      outputs,
      state,
      logger,
      signal: abort.signal,
      env,
      runtime,
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

## 9. Error classes

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

export class WorkflowAssertionError extends WorkflowError {
  evidence?: unknown;
}
```

Guidance:

- Invalid YAML or invalid `$` -> parser / meta validation error.
- Invalid node business input -> `NodeInputValidationError`.
- Verification failed -> `WorkflowAssertionError`.
- Unexpected node failure -> `NodeExecutionError` wrapping original error.
- Timeout -> `StepTimeoutError`.

---

## 10. Open Questions

1. Which schema library should be first-class: Zod, TypeBox, JSON Schema, or a small `Schema<T>` abstraction?
2. Should every node automatically accept `prompt`, or should nodes opt into it through `capabilities.prompt`?
3. Should `ctx.meta` be exposed to nodes at all, or kept internal to discourage node-specific timeout / error behavior?
4. How should outputs be referenced before step ids / output names exist in the YAML contract?
5. Should `NodeResult.summary` be required for all nodes, or can engine synthesize a default summary from node name and status?
6. Should node definitions be pure data + execute function, or can they include setup / teardown hooks?

---

## 11. Initial Recommendation

首期推荐实现最小 API：

```ts
export const node = defineNode({
  name: 'some.node',

  input: z.object({
    foo: z.string(),
  }),

  output: z.object({
    result: z.string(),
  }),

  async execute(ctx) {
    return {
      summary: `Processed ${ctx.input.foo}.`,
      data: {
        result: 'ok',
      },
    };
  },
});
```

对应 YAML：

```yaml
workflow:
  - some.node:
      prompt: Process foo.
      $:
        timeout: 30s
        continue-on-error: false
      foo: hello
```

核心边界保持不变：

- `$` 由 engine 解析和执行。
- `$` 外字段由节点 schema 校验。
- `prompt` 是 common business input。
- 节点 return 表示成功，throw 表示失败。
- engine 根据 `continue-on-error` 处理失败后的 workflow 走向。
