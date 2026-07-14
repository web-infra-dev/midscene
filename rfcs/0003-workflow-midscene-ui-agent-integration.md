# RFC 0003 · Workflow Setup Context 与 Midscene UI Agent 集成

状态：**已实现**

范围：定义 workflow 级 `setupWorkflow`、执行 context 和 `onTeardown()`，并使用这套通用
机制集成 Midscene UI Agent。本 RFC 同时定义 `aiAct`、`aiAssert` 和
`recordToReport` 节点。

本 RFC 建立在 RFC 0001 和 RFC 0002 之上。RFC 0001 继续负责节点输入、step
timeout 和错误包装。RFC 0002 继续负责 workflow collection、顺序执行和 Rstest
调度。

不覆盖：Pi Agent、`agent`／`soft` 节点、Skills、具名 output、报告 UI、旧 YAML
迁移和 workflow 级 timeout。

---

## 1. 结论

`WorkflowProjectDefinition` 不增加 `uiAgent` 等产品专属字段。它只增加通用的
`setupWorkflow`：

```ts
export interface WorkflowProjectDefinition<TContext = undefined> {
  nodes: readonly NodeDefinition<any, any, TContext>[];
  setupWorkflow?: WorkflowSetup<TContext>;
}
```

`setupWorkflow` 为每个 workflow attempt 创建 context。它直接返回 context，不增加
包装层：

```ts
export type WorkflowSetup<TContext> = (
  ctx: WorkflowSetupContext,
) => Awaitable<TContext>;
```

`setupWorkflow` 通过 `ctx.onTeardown()` 注册清理函数。engine 按注册顺序的逆序执行
全部清理函数。

每个 node 通过 `ctx.context` 读取当前 attempt 的共享对象。Midscene UI Agent、数据库
连接、browser context 和项目状态都使用同一个机制。

Midscene 只提供节点适配器。项目通过 `createMidsceneNodes()` 注册 `aiAct` 和
`aiAssert`，并告诉适配器如何从通用 context 中获取 Agent。

完整配置如下：

```js
const { agentFromAdbDevice } = require('@midscene/android');
const {
  defineWorkflowProject,
} = require('@midscene/test/config');
const {
  createMidsceneNodes,
} = require('@midscene/test/midscene');

const midsceneNodes = createMidsceneNodes({
  getAgent: ({ context }) => context.uiAgent,
});

module.exports = defineWorkflowProject({
  nodes: midsceneNodes,

  async setupWorkflow({ env, onTeardown }) {
    const uiAgent = await agentFromAdbDevice(env.ANDROID_DEVICE_ID, {
      androidAdbPath: env.ANDROID_ADB_PATH,
      aiActContext: 'The user is already signed in.',
      generateReport: true,
    });

    onTeardown(() => uiAgent.destroy());
    return { uiAgent };
  },
});
```

对应 YAML：

```yaml
workflows:
  - name: Create paid order
    steps:
      - aiAct: Sign in and create a paid order.
      - aiAssert: The order detail page shows payment success.
```

---

## 2. 背景

旧的 Phase 0 方案通过 `uiAgent` 配置创建 Agent，并通过 `ui` 节点调用
`agent.aiAct()`。该方向解决了 UI Agent 的来源问题，但 `uiAgent` 是 workflow 项目
定义中的特制字段。

如果沿用这种方式，后续还可能出现以下字段：

```ts
interface WorkflowProjectDefinition {
  uiAgent?: UIAgentFactory;
  database?: DatabaseFactory;
  browserContext?: BrowserContextFactory;
  temporaryDirectory?: TemporaryDirectoryFactory;
}
```

这些字段的生命周期完全相同：每次 attempt 创建、节点间共享、结束后释放。workflow
engine 应提供统一机制，不应逐个了解业务资源。

当前 `packages/workflow` 已经具备以下能力：

- 通过 `defineNode()` 定义节点；
- 通过 `WorkflowProjectDefinition.nodes` 注册静态节点；
- 在 collection 阶段解析全部节点；
- 在一个 workflow 内顺序执行 step；
- 通过 `ctx.workflow.completedSteps` 读取历史结果；
- 由 Rstest 管理 workflow 并发和 retry。

当前实现缺少 workflow attempt 级 setup、共享 context 和 teardown。RFC 0001 和
RFC 0002 都把这部分留给后续设计。本 RFC 补上该能力，并把 UI Agent 作为首个使用方。

### 2.1 定义位置与执行作用域

生命周期函数“定义在哪里”和“每次运行几次”是两个独立问题。project config 可以由
整个项目共享，但其中的函数仍然可以按 document 或 workflow attempt 调用。

| 作用域 | 执行时机 | 适合内容 |
|---|---|---|
| Project | Rstest worker 加载 config 时 | 注册静态 node，不创建测试运行资源 |
| Document | 一个 YAML 文件中的所有 workflow 前后各一次 | `beforeAll`／`afterAll`，共享 suite 资源 |
| Workflow attempt | 每个 `workflows[]`、每次 retry 各一次 | `beforeEach`／`afterEach`，隔离测试资源 |

RFC 0002 把每个 `workflows[]` 定义为独立 Rstest test。因此，同一文件不代表这些 test
应该共享 UI Agent、页面状态或其他可变资源。

### 2.2 本 RFC 的生命周期

本 RFC 当前只定义 workflow attempt 级 context 生命周期。`setupWorkflow` 每个 attempt
调用一次，本质上等价于 `beforeEach`。它返回当前 attempt 的 context，并在 attempt
结束时执行 teardown callbacks。

`setupWorkflow` 定义在 project config 中。YAML 暂不增加 `setup` node，也不增加
`workflows[].setup` 字段。定义放在公共 config 中，不代表资源实例会跨 workflow 共享。

`setupWorkflow` 同时表达生命周期动作和 workflow 作用域。未来如果增加 document 级
生命周期，使用 `setupDocument` 等显式名称，不复用无作用域的 `setup`。

Document 级 setup 如果后续需要，应作为独立能力设计。它的声明参数应位于 YAML 顶层，
并明确并发、retry、失败传播和 `afterAll` 语义，不应伪装成 step node。

---

## 3. 设计目标

1. **机制通用**：engine 不认识 UI Agent、database 或 browser 等业务概念。
2. **作用域明确**：context 属于单个 workflow attempt。
3. **节点共享**：同一 attempt 的所有节点读取同一个 context 对象。
4. **执行隔离**：并发 workflow 和 retry attempt 使用不同 context。
5. **统一清理**：成功、step 失败和 `continue-on-error` 都执行 teardown。
6. **节点静态可收集**：`setupWorkflow` 不注册节点，也不替换节点 handler。
7. **类型可表达**：节点作者可以声明自己需要的 context 类型。
8. **Midscene API 直接**：YAML 使用 `aiAct`、`aiAssert` 和 `recordToReport`，不保留
   旧别名。
9. **兼容现有项目**：没有 `setupWorkflow` 的项目继续使用原有节点能力。

---

## 4. 首期不做的能力

本 RFC 不包含以下能力：

- 不在 `WorkflowProjectDefinition` 中增加 `uiAgent` 字段；
- 不实现 context 依赖注入容器或 token registry；
- 不支持多级、嵌套或按 step 创建的 context；
- 不允许 `setupWorkflow` 动态注册节点或替换节点 handler；
- 不提供 context 序列化、克隆或跨进程传输；
- 不增加 workflow 级 timeout；
- 不注册 `ui`、`verify` 等兼容别名；
- 不实现 Pi Agent、`agent`、`soft` 或 `$name` skill；
- 不为所有 Midscene Agent 方法一次性设计 YAML schema；
- 不支持一个 context 跨 retry attempt 复用。

首期 context 是一个由项目定义的普通 TypeScript 值。engine 只保存引用，并在执行
node 时传入该值。

---

## 5. Workflow Setup API

### 5.1 核心类型

```ts
export type Awaitable<T> = T | Promise<T>;

export interface WorkflowAttemptInfo {
  /** 当前测试定义的唯一标识；retry 时保持不变。 */
  readonly testId: string;

  /** 当前 attempt 的唯一标识。 */
  readonly runId: string;

  readonly name: string;
  readonly sourcePath: string;
  readonly workflowIndex: number;

  /** 当前 workflow 的 normalized steps。 */
  readonly steps: readonly NormalizedStep[];

  /** Rstest worker 当前可见的环境变量。 */
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

export interface WorkflowTeardownContext extends WorkflowAttemptInfo {
  /** 已经完成的 step result。 */
  readonly completedSteps: readonly StepRunResult[];

  /** teardown 开始前的 workflow 状态。 */
  readonly status: 'success' | 'failed';

  /** setup 失败时保存规范化后的错误。 */
  readonly setupError?: WorkflowError;
}

export type WorkflowTeardown = (
  ctx: WorkflowTeardownContext,
) => Awaitable<void>;

export interface WorkflowSetupContext extends WorkflowAttemptInfo {
  /** 注册当前 attempt 结束时执行的清理函数。 */
  onTeardown(teardown: WorkflowTeardown): void;
}

export type WorkflowSetup<TContext> = (
  ctx: WorkflowSetupContext,
) => Awaitable<TContext>;
```

`setupWorkflow` 的返回值就是 node 收到的 context。项目不需要返回
`{ context, teardown }` 包装对象，也不需要修改 engine 预先创建的空对象。

每创建一个需要清理的资源，`setupWorkflow` 应立即调用 `onTeardown()`。如果后续
workflow setup 逻辑失败，engine 仍能释放此前创建成功的资源。

### 5.2 项目定义

```ts
export interface WorkflowProjectDefinition<TContext = undefined> {
  nodes: readonly NodeDefinition<any, any, TContext>[];
  setupWorkflow?: WorkflowSetup<TContext>;
}

export function defineWorkflowProject<TContext = undefined>(
  definition: WorkflowProjectDefinition<TContext>,
): WorkflowProjectDefinition<TContext>;
```

没有 `setupWorkflow` 时，engine 使用 `undefined` 作为 context。现有项目只需要继续
提供 `nodes`：

```js
module.exports = defineWorkflowProject({
  nodes: [customNode],
});
```

如果节点需要非空 context，项目必须提供 `setupWorkflow`。TypeScript 配置可以通过
`WorkflowProjectDefinition<TContext>` 和 node 的第三个泛型参数检查类型。
JavaScript 配置可以返回任意值；`setupWorkflow` 和 node 应按自身契约校验业务字段。

### 5.3 节点执行上下文

`NodeExecutionContext` 增加 `context` 泛型和字段：

```ts
export interface NodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> {
  input: TInput & CommonNodeInput;
  $: Readonly<NormalizedStepMeta>;
  signal: AbortSignal;
  workflow: NodeWorkflowContext;

  /** 当前 workflow attempt 的共享 context。 */
  context: TContext;
}
```

`defineNode()`、`DefineNodeOptions` 和 `NodeDefinition` 都增加位于末尾的
`TContext` 泛型：

```ts
export function defineNode<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
>(
  options: DefineNodeOptions<TInput, TData, TContext>,
): NodeDefinition<TInput, TData, TContext>;
```

新的泛型放在末尾，因此现有 `defineNode<TInput, TData>()` 调用不需要修改。

### 5.4 Context 语义

context 遵循以下规则：

1. `setupWorkflow` 为每个 attempt 返回一个 context；
2. engine 保存 context 的原始引用；
3. engine 不克隆、冻结或序列化 context；
4. 同一 attempt 的所有 node 收到同一个引用；
5. teardown callback 通过闭包引用自己创建的资源；
6. context 不进入 `WorkflowRunResult`；
7. context 不进入后续 Agent prompt；
8. retry 创建新的 context；
9. 并发 workflow 创建各自的 context。

context 适合保存连接、客户端、Agent、缓存和 attempt 级状态。需要进入报告或后续
Agent 上下文的数据，仍然通过 `NodeResult` 和 `completedSteps` 传递。

context 放在 `NodeExecutionContext.context`，不放进 `ctx.workflow`。
`ctx.workflow` 继续只保存可回溯到测试定义的 identity 和 step history；运行时对象不会
混入这组元数据。

engine 不要求 context 只读。当前 workflow 的 step 顺序执行，因此项目可以在 context
中维护可变状态。项目应自行定义并发访问规则，为未来的并行 step 做准备。

engine 不会先创建一个空 context 交给 `setupWorkflow` 填充。空对象在 workflow setup
完成前处于半初始化状态，也无法用 TypeScript 准确表达必需字段。`setupWorkflow`
返回完整 context，可以让 node 只看到初始化成功的对象。

### 5.5 Attempt 信息

setup 可以根据 workflow identity、steps 和环境变量创建不同资源：

```ts
async setupWorkflow({ runId, steps, env, onTeardown }) {
  const needsDatabase = steps.some((step) =>
    step.node.startsWith('database.'),
  );

  const database = needsDatabase
    ? await connectDatabase(env.TEST_DATABASE_URL)
    : undefined;

  if (database) {
    onTeardown(() => database.close());
  }

  return { runId, database };
}
```

`steps` 只用于决定 workflow setup 内容。`setupWorkflow` 不能修改 normalized step，
也不能改变本次已经完成的 collection 结果。

---

## 6. 生命周期

### 6.1 Collection 与执行顺序

node 注册和 `setupWorkflow` 分属两个阶段。node 先注册，`setupWorkflow` 后执行：

```text
配置加载与 collection：
  evaluate project config module
    createMidsceneNodes() -> static NodeDefinition[]
    defineWorkflowProject() -> project definition
  build NodeRegistry
  collect and normalize YAML
  resolve every step node from NodeRegistry
  register Rstest tests

每个 Rstest test attempt 的执行：
  create runId
  create WorkflowSetupContext
  run project setupWorkflow -> workflow context
  for each normalized step:
    execute the already-registered node with workflow context
    record StepRunResult
    decide continue or stop
  run registered teardown callbacks in reverse order
  finalize WorkflowRunResult
  call onResult
```

`createMidsceneNodes()` 只创建静态 node definition。它不会调用 `getAgent()`，也不会
创建 Agent。执行 Midscene step 时，对应 node 才调用 `getAgent()`，从 setup 已经返回的
context 中读取 Agent。

因此，配置文件中的书写顺序不是运行顺序。模块顶层代码在 collection 阶段执行；
`setupWorkflow` 函数体在某个 Rstest test attempt 真正开始时执行。

`setupWorkflow` 和 teardown callback 都属于一次 workflow attempt。Rstest retry 会重新
执行 `setupWorkflow`、steps 和 teardown callbacks，但不会重新注册 node。

### 6.2 Node 注册边界

节点定义遵循“定义静态、依赖动态”的边界：

- node name 和 `execute` handler 在 project config 加载时确定；
- collection 在任何 attempt 开始前完成全部 node name 解析；
- `setupWorkflow` 只创建当前 attempt 的 context，不接收 `NodeRegistry`、
  `registerNode()` 或其他修改节点表的入口；
- handler 可以在执行时读取 `ctx.context`，选择当前 attempt 的资源或实现。

例如，项目可以在 context 中提供运行时 handler，但 YAML 中可引用的 node name 仍然
是静态的：

```ts
interface ProjectContext {
  actions: {
    prepareOrder(input: PrepareOrderInput): Promise<PrepareOrderData>;
  };
}

const prepareOrderNode = defineNode<
  PrepareOrderInput,
  PrepareOrderData,
  ProjectContext
>({
  name: 'prepareOrder',
  execute: (ctx) => ctx.context.actions.prepareOrder(ctx.input),
});
```

Midscene 节点使用相同模式。`aiAct`、`aiAssert` 和 `recordToReport` 的定义是静态的，
handler 执行时才通过 `getAgent({ context })` 取得本次 attempt 的 Agent。

如果业务确实需要从 setup 结果中选择任意命令，应注册一个静态 dispatcher node，
把命令名作为 input，再从 context 中查找实现：

```yaml
steps:
  - runtime.call:
      handler: prepareOrder
      input:
        orderId: order-1
```

这种方式只能动态选择实现，不能新增 YAML node name。dispatcher 还应自行校验允许的
handler 名称和输入。

如果将来需要根据项目配置生成不同的 node 集合，应增加独立的 collection-time node
factory API。该 API 必须在 YAML collection 前运行，而且不能依赖 attempt 资源；它不应
复用 `setupWorkflow`。

禁止 attempt-time 注册有以下原因：

1. 未知 node 无法在 collection 阶段报错，只能延迟到执行时；
2. 并发 attempt 修改共享 registry 会产生竞态；为每个 attempt 复制 registry 又会增加
   一套解析和缓存语义；
3. retry 可能得到不同的 node 集合，使同一测试定义不稳定；
4. 报告中的 node 身份和 handler 来源难以保持一致；
5. handler 闭包容易误捕获某个 attempt 的资源，造成跨 workflow 串扰。

### 6.3 Workflow setup 失败

`setupWorkflow` 抛错时，engine 不执行任何 step。它会执行已经注册的 teardown
callbacks：

```ts
async setupWorkflow({ onTeardown }) {
  const browser = await createBrowser();
  onTeardown(() => browser.close());

  const database = await connectDatabase();
  onTeardown(() => database.close());

  return { browser, database };
}
```

如果 `connectDatabase()` 失败，browser callback 已经注册，engine 仍会关闭 browser。
项目不需要为每一段 workflow setup 编写嵌套的 `try/finally`。

engine 将 setup 错误包装为 `WorkflowSetupError`，并生成失败的
`WorkflowRunResult`。

### 6.4 Teardown 规则

engine 必须在 `finally` 路径执行已注册的 teardown callback。以下情况都不能跳过：

- 所有 step 成功；
- step 抛错；
- step timeout；
- `continue-on-error` 为 `true`；
- workflow 提前停止。

callback 按注册顺序的逆序执行。每个 callback 只执行一次。一个 callback 失败后，engine
继续执行剩余 callback，并保留全部错误。

`onTeardown()` 只能在 `setupWorkflow` 进行期间调用。`setupWorkflow` 已经 resolve 或
reject 后再次注册，engine 抛出 `WorkflowLifecycleError`。engine 不推断 context 内容，
也不主动调用 `destroy()` 或 `close()`。

### 6.5 生命周期错误

`WorkflowRunResult` 增加两个可选字段：

```ts
export interface WorkflowRunResult {
  // 现有字段保持不变
  status: 'success' | 'failed';
  steps: StepRunResult[];
  setupError?: WorkflowError;
  teardownErrors?: WorkflowError[];
}
```

状态遵循以下规则：

- setup 失败时，`status` 为 `failed`，`steps` 为空；
- 任一 teardown callback 失败时，`status` 为 `failed`；
- setup 与 teardown 可以同时失败，两类错误都保留；
- step 和 teardown 同时失败时，两类错误都保留；
- teardown 错误不能覆盖 setup 或 step error；
- `onResult()` 在全部 teardown callback 结束后调用；
- `endedAt` 和 `durationMs` 包含 setup 和 teardown 时间。

teardown 错误使用 `WorkflowTeardownError`。错误详情至少包含 `testId`、`runId` 和注册
顺序。

### 6.6 Timeout 边界

RFC 0001 的 `$.timeout` 只约束当前 step，不约束 setup 和 teardown。本 RFC 不增加
workflow 级 timeout。

`setupWorkflow` 和 teardown 必须自行避免无限等待。后续如果增加 workflow timeout，
应把统一的 attempt `AbortSignal` 传给 workflow setup、node 和 teardown，并单独定义
强制终止语义。

---

## 7. Engine 与 Runner 接线

### 7.1 RunWorkflowOptions

```ts
export interface RunWorkflowOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  setupWorkflow?: WorkflowSetup<TContext>;
  onResult?(result: WorkflowRunResult): Promise<void> | void;
  createRunId?(): string;
}
```

`runWorkflow()` 在解析完全部静态节点后调用 `setupWorkflow`。它返回的 context 传给
每次 `runStepForWorkflow()`。

### 7.2 项目加载

`loadWorkflowProjectSync()` 继续同步加载项目配置。它只保存 `setupWorkflow` 函数，
不执行该函数：

```ts
export interface LoadedWorkflowProject<TContext = undefined> {
  nodes: NodeRegistry;
  setupWorkflow?: WorkflowSetup<TContext>;
  resolveNode(name: string): NodeDefinition<any, any, TContext> | undefined;
}
```

配置加载阶段校验以下内容：

- `nodes` 必须是数组；
- `setupWorkflow` 如果存在，必须是函数；
- 节点名不能重复。

`setupWorkflow` 的返回值可以是任意 context。engine 不对业务字段做结构校验。

### 7.3 Rstest bridge

bridge 把项目 `setupWorkflow` 传给 engine：

```ts
const result = await runWorkflow(workflow, {
  resolveNode: project.nodes.require.bind(project.nodes),
  setupWorkflow: project.setupWorkflow,
  onResult: (value) => writeWorkflowRunResult(manifest.resultDir, value),
});
```

config module 和 NodeRegistry 仍然在 worker 内共享。workflow context 不保存在 project
对象上，而是在每次 `runWorkflow()` 内创建。

### 7.4 兼容 API

`WorkflowEngineOptions` 同样增加可选 `setupWorkflow`：

```ts
export interface WorkflowEngineOptions<TContext = undefined> {
  nodes?: readonly NodeDefinition<any, any, TContext>[];
  setupWorkflow?: WorkflowSetup<TContext>;
}
```

`WorkflowEngine.run()` 执行相同的 setup 和 teardown 生命周期。

独立的 `runStep()` 没有完整 workflow 生命周期。它默认传入 `undefined` context，不能
直接运行依赖 `setupWorkflow` 的节点。需要 context 的调用方应使用 `runWorkflow()`，
或在后续为 `runStep()` 单独设计显式 context 参数。

---

## 8. Midscene 节点适配器

### 8.1 独立入口

Midscene 集成从独立入口导出：

```ts
import {
  createMidsceneNodes,
  type MidsceneUIAgent,
} from '@midscene/test/midscene';
```

通用 engine、project config 和 setup API 不依赖该入口。这样可以保持核心类型中没有
Midscene UI Agent 专属字段。

### 8.2 Agent 结构类型

适配器使用最小结构类型，不要求用户返回某个具体平台的 Agent 类：

```ts
export interface MidsceneUIAgent {
  aiAct(
    prompt: string,
    options?: MidsceneAiActOptions,
  ): Promise<string | undefined>;

  aiAssert(
    prompt: string,
    message?: string,
    options?: MidsceneAiAssertOptions,
  ): Promise<unknown>;

  recordToReport(
    title?: string,
    options?: MidsceneRecordToReportOptions,
  ): Promise<unknown>;
}
```

Agent 的销毁不属于节点适配器。项目 `setupWorkflow` 创建资源，并通过 `onTeardown()`
注册清理。因此，`MidsceneUIAgent` 不要求 `destroy()`。实际使用的 Midscene Agent 通常
提供该方法。

`MidsceneAiActOptions` 和 `MidsceneAiAssertOptions` 是适配器导出的最小兼容类型。它们
只包含对应节点允许从 YAML 传入的字段。实现需要对这些字段做运行时校验。

### 8.3 节点工厂

```ts
export interface CreateMidsceneNodesOptions<TContext> {
  getAgent(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
}

export function createMidsceneNodes<TContext>(
  options: CreateMidsceneNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[];
```

`createMidsceneNodes()` 首期返回 `aiAct`、`aiAssert` 和 `recordToReport` 三个定义。它
不创建 Agent，也不管理 Agent 生命周期。`getAgent()` 只负责从当前 node context 中定位
Agent。

把 `NodeExecutionContext` 传给 `getAgent()`，而不是只传 `context`，可以支持以下高级
用法：

- 根据 `ctx.workflow` 选择 Agent；
- 使用 `ctx.signal` 获取惰性 Agent；
- 从复合 context 中按 node input 选择设备。

常规项目只需要返回 `ctx.context.uiAgent`。

### 8.4 配置多个资源

setup context 可以同时提供 UI Agent 和其他资源：

```js
const midsceneNodes = createMidsceneNodes({
  getAgent: ({ context }) => context.uiAgent,
});

module.exports = defineWorkflowProject({
  nodes: [
    ...midsceneNodes,
    prepareOrderNode,
    verifyDatabaseNode,
  ],

  async setupWorkflow({ env, onTeardown }) {
    const uiAgent = await createUiAgent(env);
    onTeardown(() => uiAgent.destroy());

    const database = await connectDatabase(env.TEST_DATABASE_URL);
    onTeardown(() => database.close());

    return { uiAgent, database };
  },
});
```

自定义节点通过相同字段读取 database：

```ts
export const verifyDatabaseNode = defineNode<
  VerifyDatabaseInput,
  VerifyDatabaseData,
  ProjectContext
>({
  name: 'verifyDatabase',

  async execute(ctx) {
    const row = await ctx.context.database.findOrder(ctx.input.orderId);
    return { data: row };
  },
});
```

---

## 9. Midscene 节点

### 9.1 节点集合

首期注册三个节点：

| 节点 | 调用 | 失败语义 |
|---|---|---|
| `aiAct` | `agent.aiAct()` | 方法抛错时 step 失败 |
| `aiAssert` | `agent.aiAssert()` | 断言不通过或方法抛错时 step 失败 |
| `recordToReport` | `agent.recordToReport()` | 方法抛错时 step 失败 |

节点名严格使用 Agent 的公开方法名。首期不增加 `ui` 和 `verify` 别名，也不增加
`midscene.aiAct` 前缀。

`aiTap`、`aiInput`、`aiWaitFor` 和 `aiQuery` 等方法可以后续加入。它们需要各自的业务
输入设计。特别是 `aiQuery` 需要描述返回类型，不能直接复用纯字符串输入。

### 9.2 `aiAct`

字符串简写：

```yaml
- aiAct: Sign in and create a paid order.
```

完整写法：

```yaml
- aiAct:
    prompt: Sign in and create a paid order.
    options:
      deepThink: true
    $:
      timeout: 120000
```

输入类型：

```ts
export interface AiActNodeInput {
  prompt?: string;
  options?: Omit<MidsceneAiActOptions, 'abortSignal'>;
}
```

执行逻辑：

```ts
const aiActNode = defineNode<AiActNodeInput, unknown, TContext>({
  name: 'aiAct',

  async execute(ctx) {
    const prompt = requirePrompt(ctx.input);
    const agent = await options.getAgent(ctx);
    const output = await agent.aiAct(prompt, {
      ...ctx.input.options,
      abortSignal: ctx.signal,
    });

    return output === undefined ? undefined : { summary: output };
  },
});
```

节点必须校验 `prompt` 为非空字符串，并校验 `options`。用户不能通过 YAML 传入
`abortSignal`。engine 的 `ctx.signal` 始终覆盖业务 input。

`aiAct()` 返回字符串时，节点把它保存为 `NodeResult.summary`。返回 `undefined` 表示
方法没有文本输出，不代表执行失败。

### 9.3 `aiAssert`

字符串简写：

```yaml
- aiAssert: The order detail page shows payment success.
```

完整写法：

```yaml
- aiAssert:
    prompt: The order detail page shows payment success.
    message: Paid order status is missing.
    options:
      domIncluded: false
      screenshotIncluded: true
    $:
      timeout: 60000
```

输入类型：

```ts
export interface AiAssertNodeInput {
  prompt?: string;
  message?: string;
  options?: Omit<
    MidsceneAiAssertOptions,
    'abortSignal' | 'keepRawResponse'
  >;
}
```

`keepRawResponse` 不对 YAML 开放。Midscene 的 `aiAssert()` 在该选项为 `true` 时可能返回
`{ pass: false }` 而不抛错，这会破坏节点的 gating 语义。

执行逻辑：

```ts
const aiAssertNode = defineNode<AiAssertNodeInput, unknown, TContext>({
  name: 'aiAssert',

  async execute(ctx) {
    const prompt = requirePrompt(ctx.input);
    const agent = await options.getAgent(ctx);

    await agent.aiAssert(prompt, ctx.input.message, {
      ...ctx.input.options,
      abortSignal: ctx.signal,
    });

    return { summary: `Assertion passed: ${prompt}` };
  },
});
```

断言不通过时，`agent.aiAssert()` 抛错。engine 按 RFC 0001 把它记录为失败 step。
`continue-on-error` 可以让后续 step 继续执行，但 workflow 最终状态仍然是 `failed`。

### 9.4 `recordToReport`

Midscene Agent 的正式方法名是 `recordToReport()`。新 workflow 不增加
`logToReport` 或旧 YAML 中的 `logScreenshot` 别名。

字符串简写把字符串作为报告标题：

```yaml
- recordToReport: Order created
```

完整写法支持报告内容和自定义截图：

```yaml
- recordToReport:
    title: Order created
    content: The paid order is ready for verification.
```

输入类型：

```ts
export interface RecordToReportNodeInput {
  prompt?: string;
  title?: string;
  content?: string;
  screenshotBase64?: string;
  screenshots?: MidsceneReportScreenshot[];
}
```

`prompt` 只承接 engine 的字符串简写。mapping 写法使用 `title`。两者不能同时出现。
`screenshotBase64` 与 `screenshots` 也不能同时出现。

该节点不调用模型。因此，CLI e2e 使用它验证以下完整链路：project config 注册
Midscene nodes、`setupWorkflow` 注入 Agent、YAML 调用 Agent，以及 attempt 结束后执行
teardown。

---

## 10. 并发与 Retry

### 10.1 单个 workflow

```text
runWorkflow(attempt A)
  setup -> context A; register teardown callbacks
  aiAct -> context A.uiAgent
  custom node -> context A.database
  aiAssert -> context A.uiAgent
  run teardown callbacks in reverse order
```

同一个 workflow 的 UI 状态和其他资源可以跨 step 延续。

### 10.2 并发 workflow

Rstest 的 `test.concurrent` 会并发调用多个 `runWorkflow()`。每次调用独立执行 setup：

```text
workflow A -> context A -> Agent A
workflow B -> context B -> Agent B
```

config module 和 NodeRegistry 可以共享，setup context 不能共享。用户必须保证 setup 能
为并发 workflow 提供互不冲突的设备、页面或 browser context。如果底层只有一个物理
设备，用户应使用串行模式。

### 10.3 Retry

Rstest retry 会重新调用 workflow test callback。新的 attempt 具有新 `runId`，并重新
执行 setup。上一次 attempt 的 teardown callbacks 必须已经执行完成。

setup 可以使用 `runId` 创建独立的 browser profile、临时目录或报告标识。

---

## 11. 错误模型

| 情况 | 结果 |
|---|---|
| project `setupWorkflow` 不是函数 | 配置加载失败 |
| `setupWorkflow` 抛错 | workflow 失败，不执行 step |
| `getAgent()` 找不到有效 Agent | 当前 UI step 失败 |
| `aiAct` 抛错 | 当前 step 失败 |
| `aiAssert` 判定不通过 | 当前 step 失败 |
| step timeout | 中止当前 Agent 调用，当前 step 失败 |
| teardown callback 抛错 | workflow 失败，写入 `teardownErrors` |
| 多个 callback 抛错 | 全部保留，并继续执行剩余 callback |
| setup／step 与 teardown 同时失败 | 同时保留两类错误 |

Midscene 节点在调用前校验 `getAgent()` 的返回值。缺少当前节点对应的方法时，节点抛出
明确的 `NodeExecutionError`，不能让用户只看到 `is not a function`。

---

## 12. 与旧 Phase 0 方案的关系

| 旧方案 | 本 RFC |
|---|---|
| `uiAgent` 项目字段 | 通用 `setupWorkflow()` 返回含 `uiAgent` 的 context |
| `RuntimeNodeContext.uiAgent` | `NodeExecutionContext.context` |
| `ui` 节点 | `aiAct` 节点 |
| `verify` 节点 | `aiAssert` 节点 |
| runtime 节点表 | 继续使用 `defineNode()` 和 `nodes` |
| 一个 case 共享 Agent | 一个 workflow attempt 共享 context |
| Agent 专属销毁逻辑 | `setupWorkflow` 调用通用 `onTeardown()` |
| 未明确 retry 隔离 | 每个 retry attempt 重新 setup |

旧方案中的 Pi Agent `verify` 与 Midscene `aiAssert` 不是同一种实现。本 RFC 直接暴露
现有 Midscene Agent 方法，因此不迁移 Pi verdict、`agent`、`soft` 和 Skills。

本 RFC 不提供 `ui` 和 `verify` 兼容层。旧报告文件和测试草案可以重新生成，新
workflow 不需要保留两套命名。

---

## 13. 备选方案

### 13.1 `WorkflowProjectDefinition.uiAgent`

不采用。该字段只能解决 Midscene Agent。database、browser context 和其他共享资源
仍然需要新字段或另一套生命周期。

### 13.2 Resource token registry

不在首期采用。token registry 可以实现惰性创建和按资源释放，但会引入 provider、
token、store、依赖顺序和循环依赖等概念。当前需求只需要 attempt 级共享对象，一个
普通 context 已经足够。

如果未来出现大量可组合 provider、惰性资源或第三方插件隔离需求，可以在 setup 内部
增加 resource container。该能力不需要改变 node 的 `ctx.context` 入口。

### 13.3 把 Agent 保存到节点闭包

不采用。NodeDefinition 在项目内共享，闭包 Agent 会在并发 workflow 之间串扰，也会
让 retry 继承上一次 attempt 的状态。

### 13.4 每个节点自行创建 Agent

不采用。后续 step 无法继承页面状态，连接设备和启动 browser 的成本也会重复发生。

### 13.5 给每个 NodeDefinition 增加 setup

不采用。多个节点需要共享同一个 Agent 或 database connection。节点级 setup 难以
定义共享资源的唯一所有者和释放顺序。

### 13.6 在 `setupWorkflow` 中注册 node

不采用。`setupWorkflow` 属于 attempt 执行阶段，node name 和 handler 属于 collection
阶段。允许 setup 修改 node registry，会让静态校验、并发隔离、retry 和报告身份都变得
不稳定。

运行时差异应通过静态 handler 读取 `ctx.context` 表达。配置期差异应通过 project config
中的静态 `nodes` 或未来独立的 collection-time node factory 表达。

### 13.7 `setupWorkflow` 返回 `{ context, teardown }`

不采用。该包装层增加了一次无业务含义的嵌套。更重要的是，`setupWorkflow` 在返回
包装对象之前失败时，engine 无法取得 teardown。`onTeardown()` 可以在每个资源创建
成功后立即注册清理函数。

### 13.8 `setupWorkflow` 修改 engine 创建的空 context

不采用。空 context 在 setup 完成前处于半初始化状态。TypeScript 也无法同时表达“setup
期间字段可缺失”和“node 执行时字段必需”。`setupWorkflow` 直接返回完整 context，node
只会看到初始化成功的对象。

---

## 14. API 变更汇总

本 RFC 对现有 API 做以下增量修改：

```ts
export interface WorkflowProjectDefinition<TContext = undefined> {
  nodes: readonly NodeDefinition<any, any, TContext>[];
  setupWorkflow?: WorkflowSetup<TContext>;
}

export interface NodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> {
  // 现有字段
  context: TContext;
}

export interface DefineNodeOptions<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> {
  // 现有字段
}

export interface RunWorkflowOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  setupWorkflow?: WorkflowSetup<TContext>;
  onResult?(result: WorkflowRunResult): Promise<void> | void;
  createRunId?(): string;
}

export interface WorkflowRunResult {
  // 现有字段
  setupError?: WorkflowError;
  teardownErrors?: WorkflowError[];
}
```

Midscene 能力通过新入口提供：

```ts
export {
  createMidsceneNodes,
  type CreateMidsceneNodesOptions,
  type MidsceneUIAgent,
} from '@midscene/test/midscene';
```

现有节点不读取 `ctx.context` 时，无需修改执行逻辑。现有项目不配置 `setupWorkflow`
时，context 为 `undefined`。

---

## 15. 实现顺序

### 15.1 Setup context

1. 增加 `setupWorkflow`、`onTeardown()` 和 teardown callback 类型。
2. 给 node API 增加末尾的 `TContext` 泛型。
3. 给 `NodeExecutionContext` 增加 `context`。
4. 在 `runWorkflow()` 中实现 workflow setup 和 teardown。
5. 增加 teardown stack 和生命周期错误类型。
6. 把 `setupWorkflow` 从 project loader 传到 Rstest bridge。
7. 让 `WorkflowEngine.run()` 使用相同生命周期。

### 15.2 Midscene 适配器

1. 增加 `@midscene/test/midscene` 构建入口。
2. 增加最小 `MidsceneUIAgent` 结构类型。
3. 实现 `createMidsceneNodes()`。
4. 实现 `aiAct`、`aiAssert` 和 `recordToReport` 输入校验。
5. 把 `ctx.signal` 映射为 Agent 的 `abortSignal`。
6. 增加 Agent 结构错误和节点冲突测试。

### 15.3 生命周期验证

1. 验证 `setupWorkflow` 在每个 workflow attempt 只执行一次。
2. 验证所有 step 收到同一个 context 引用。
3. 验证两个并发 workflow 使用不同 context。
4. 验证 retry 重新执行 `setupWorkflow`。
5. 验证 step 失败后仍执行 teardown callbacks。
6. 验证 `setupWorkflow` 失败后执行已经注册的 callbacks。
7. 验证 callbacks 逆序执行，且单个失败不会阻止剩余 callback。
8. 验证 setup、step 和 teardown 错误正确写入结果。
9. 验证 collection 在 `setupWorkflow` 执行前完成全部 node name 解析。
10. 验证并发 workflow 和 retry 不能修改共享 NodeRegistry。
11. 增加一个不依赖模型的 CLI e2e，通过 `recordToReport` 验证开发者使用链路。

---

## 16. 首期验收标准

满足以下条件后，可以认为本 RFC 首期完成：

- 用户能在 project config 中定义通用 `setupWorkflow`；
- `setupWorkflow` 返回的 context 对当前 attempt 的所有 node 可见；
- `setupWorkflow` 可以通过 `onTeardown()` 注册多个清理函数；
- teardown callbacks 在所有结束路径逆序执行；
- 不同 workflow 和 retry attempt 使用不同 context；
- node name 和 handler 在 collection 阶段确定，`setupWorkflow` 无法修改 NodeRegistry；
- setup 和 teardown 错误进入结构化 workflow result；
- `WorkflowProjectDefinition` 不包含 `uiAgent` 等业务字段；
- 用户能用 `createMidsceneNodes()` 注册 `aiAct`、`aiAssert` 和 `recordToReport`；
- 三个 Midscene 节点都从 `ctx.context` 获取同一个 Agent；
- 用户能在不配置模型的情况下通过 `recordToReport` 验证集成链路；
- `aiAssert` 失败会让 workflow 失败；
- `continue-on-error` 不会把失败断言改成成功；
- 现有只注册自定义节点的项目继续通过原有测试。

核心边界是：project `setupWorkflow` 创建 attempt context，engine 管理 context
生命周期，node 读取 context，Midscene 适配器只负责把 node input 映射到 Agent 方法。
