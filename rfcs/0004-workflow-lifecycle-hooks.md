# RFC 0004 · Workflow Document Lifecycle Hooks

状态：**已实现**

范围：在 workflow YAML 顶层增加 `beforeAll`、`afterAll`、`beforeEach` 和
`afterEach`。四个字段都使用与 `steps` 相同的 node 列表格式。本 RFC 同时定义
文件级 setup context、失败传播、并发、retry 和结果结构。

本 RFC 建立在 RFC 0001～0003 之上：

- RFC 0001 定义 node input、`$`、timeout 和 `continue-on-error`；
- RFC 0002 定义一个 YAML 文件包含多个 workflow，并由 Rstest 调度；
- RFC 0003 定义 `setupWorkflow` 和 teardown，但把它实现成了 attempt 级生命周期。
  这与“一个 YAML 文件共享一次 setup”的原始意图不符。本 RFC 修正其作用域，并将
  `setupWorkflow` 更名为 `setupDocument`。

本 RFC 一旦通过，将取代 RFC 0003 中关于 setup 执行作用域、context 生命周期和
teardown 执行位置的定义。

---

## 1. 结论

推荐在 YAML 顶层增加四个可选字段：

```yaml
beforeAll:
  - database.seed: Create the shared test data.

beforeEach:
  - browser.open: Open the application home page.

workflows:
  - name: Create paid order
    steps:
      - aiAct: Create a paid order.
      - aiAssert: The order detail page shows payment success.

  - name: Cancel order
    steps:
      - aiAct: Cancel the existing order.
      - aiAssert: The order detail page shows cancellation success.

afterEach:
  - recordToReport: Workflow finished

afterAll:
  - database.cleanup: Remove the shared test data.
```

四个字段都是有序 node 列表。每一项沿用 `steps` 的字符串简写、mapping 写法和 `$`
配置。

它们分成两个执行作用域：

| 字段 | 作用域 | 执行次数 | Context |
|---|---|---|---|
| `beforeAll` | YAML document | 当前 runner 中，每个文件一次 | setup context |
| `afterAll` | YAML document | 当前 runner 中，每个文件一次 | setup context |
| `beforeEach` | workflow attempt | 每个 workflow、每次 retry 一次 | setup context |
| `afterEach` | workflow attempt | 每个 workflow、每次 retry 一次 | setup context |

固定顺序如下：

```text
setupDocument
beforeAll

  beforeEach
  workflow steps
  afterEach

  ...其他 workflow attempt...

afterAll
document teardown
```

`beforeEach` 和 `afterEach` 由 workflow engine 执行，不直接映射为 Rstest 的同名
hook。`beforeAll` 和 `afterAll` 由 Rstest bridge 在当前文件的 `describe()` 中调度。

### 1.1 需要重点评审的决策

本文给出三个需要优先确认的决策：

1. 四个 lifecycle 字段都位于 YAML 顶层，不放进单个 `workflows[]`；
2. `setupDocument()` 创建的 context 由当前文件的 hooks 和 workflows 共享；
3. 任一 before hook node 失败都会阻止主体执行，即使该 node 配置了
   `continue-on-error: true`。

第三项中的 `continue-on-error` 只控制同一个 before 列表是否继续。它不表示准备阶段
已经成功。

资源创建和资源释放仍由 config setup API 负责：

- `setupDocument()` 创建文件级资源和共享 context；
- `onTeardown()` 负责必须执行的资源释放；
- YAML lifecycle hook 负责可观察、可报告、可能影响测试状态的业务动作。

---

## 2. 为什么需要两种作用域

`beforeEach` 和 `afterEach` 与 workflow `steps` 使用同一个文件级 context，并且每次
retry 都重新执行。

`beforeAll` 和 `afterAll` 不属于任何一个 `workflows[]`。如果 setup 在
`runWorkflow()` 内执行，会产生以下问题：

1. setup 会被错误地绑定到某一个 workflow；
2. 无法让 `beforeAll` 和 `afterAll` 共享同一个资源；
3. 并发 workflow 可能重复创建本应共享的文件级资源；
4. retry 会错误地重复执行 `beforeAll`；
5. document hook 的错误无法单独记录。

因此，setup 必须位于整个 document lifecycle 的最外层，不能放在
`runWorkflow()` 中，也不能伪装成一个隐藏 workflow。

### 2.1 Setup 命名修正

RFC 0003 的 `setupWorkflow` 被实现为每个 workflow attempt 执行一次，但原始意图是
“每个 YAML 文件只 setup 一次”。这里同时修正 API 名称和执行位置。

本 RFC 推荐使用以下名称：

| 名称 | 作用域 | 位置 |
|---|---|---|
| `setupDocument` | 每个 YAML document execution 一次 | `beforeAll` 外层 |

文件在类型系统中已经命名为 `WorkflowDocument`。因此，`setupDocument` 比
`setupWorkflowFile` 更短，也不依赖数据必须来自磁盘文件。`setupSuite` 会把 API 绑定到
Rstest 术语，所以不采用。

RFC 0003 的公开 API 和当前实现需要按以下方式迁移：

```text
setupWorkflow -> setupDocument
WorkflowSetup -> WorkflowDocumentSetup
WorkflowSetupContext -> WorkflowDocumentSetupContext
```

迁移不只是改名：调用位置从 `runWorkflow()` 移到 document runtime，执行次数从“每个
attempt 一次”改为“每个文件一次”，teardown 也移到 `afterAll` 之后。首期代码尚未发布
稳定版，不保留旧名称别名。

### 2.2 “All”的准确含义

`beforeAll` 中的 “All” 指当前 runner 实例中，某个 YAML 文件里被选中的全部 workflow。
它不是整个项目的全局 hook。

如果未来通过多个进程运行同一个 YAML 文件的不同分片，每个进程都会执行自己的
`beforeAll` 和 `afterAll`。跨进程只执行一次的全局 hook 不在本 RFC 范围内。

### 2.3 与 RFC 0003 的关系

`setupDocument()` 创建文件级资源并返回共享 context；YAML `beforeAll` 使用资源；每个
workflow attempt 的 `beforeEach`、steps 和 `afterEach` 继续使用同一个 context；YAML
`afterAll` 完成业务收尾；document teardown 最后释放资源。

本 RFC 不再提供第二个 attempt setup API。确实需要 attempt 级准备动作时，使用
`beforeEach` node。若未来还需要“创建 attempt 私有 context 并注册强制 teardown”的
能力，应单独设计，不能继续复用 `setupWorkflow` 这个名字。

---

## 3. 设计目标

1. **格式统一**：四个 lifecycle 字段复用 `steps` 的 node 语法。
2. **作用域明确**：整个 YAML 文件共享一个 setup context。
3. **retry 正确**：只重复 `beforeEach`、steps 和 `afterEach`。
4. **并发安全可见**：document context 的共享语义必须显式暴露。
5. **失败可追踪**：hook node 生成完整的 `StepRunResult`。
6. **资源必定释放**：setup teardown 不依赖 YAML hook 是否成功。
7. **静态 collection**：所有 lifecycle node 都在执行前完成解析。
8. **保持兼容**：没有 lifecycle 字段和 `setupDocument` 的项目行为不变。
9. **报告分层**：workflow result 与 document result 分别保存。

---

## 4. 首期不做的能力

本 RFC 不包含以下能力：

- 不支持 project 级、跨 YAML 文件的 `beforeAll`；
- 不保证跨进程或跨 shard 只执行一次；
- 不支持在单个 `workflows[]` 内覆盖顶层 lifecycle；
- 不支持 lifecycle node 动态注册其他 node；
- 不支持 lifecycle 列表中的分支、循环或并行执行；
- 不支持 lifecycle 专属 timeout；
- 不把 `afterAll` 或 `afterEach` 当作资源释放的唯一保证；
- 不让 document hook 使用伪造的 workflow identity；
- 不允许 workflow node 自动进入 document node registry。

---

## 5. YAML Schema

### 5.1 顶层结构

```ts
export interface WorkflowDocumentDefinition<
  TStep = WorkflowStepInput,
> {
  beforeAll?: readonly TStep[];
  beforeEach?: readonly TStep[];
  workflows: readonly WorkflowDefinition<TStep>[];
  afterEach?: readonly TStep[];
  afterAll?: readonly TStep[];
}
```

字段的书写顺序不影响执行顺序。以下 YAML 仍然先执行 `beforeAll`：

```yaml
workflows:
  - name: Example
    steps:
      - test.run: Run the test.

beforeAll:
  - test.prepare: Prepare the document.
```

推荐按照实际执行顺序书写，便于阅读。

### 5.2 Hook item

Hook item 与 workflow step 使用同一个格式：

```yaml
beforeEach:
  - session.reset: Reset the application state.

  - database.prepare:
      tenant: test-tenant
      $:
        timeout: 20000
        continue-on-error: false
```

字符串简写仍然展开为 `{ prompt: value }`。`$` 继续只包含 engine meta。

### 5.3 校验规则

collector 增加以下规则：

- lifecycle 字段可省略；
- lifecycle 字段存在时，必须是 sequence；
- 每一项都通过 `normalizeStep()` 处理；
- `beforeAll` 和 `afterAll` 从 document node registry 解析；
- `beforeEach`、`afterEach` 和 workflow `steps` 从 workflow node registry 解析；
- 任一 hook 引用未知 node 时，整个 YAML 文件 collection 失败；
- 顶层继续拒绝未知字段；
- lifecycle 不能定义在 `workflows[]` 内。

显式空数组与省略字段的行为相同。collector 将它规范化为空列表，runner 直接跳过。

### 5.4 Collection 类型

```ts
export interface CollectedWorkflowLifecycle {
  beforeAll: readonly NormalizedStep[];
  beforeEach: readonly NormalizedStep[];
  afterEach: readonly NormalizedStep[];
  afterAll: readonly NormalizedStep[];
}

export interface CollectedWorkflowDocument {
  documentId: string;
  projectId: string;
  sourcePath: string;
  lifecycle: CollectedWorkflowLifecycle;
  workflows: readonly CollectedWorkflow[];
}
```

省略的字段规范化为空数组。`documentId` 使用以下稳定输入生成：

```text
documentId = hash(serialize([projectId, sourcePath]))
```

修改 hook 内容不改变 `documentId`。移动文件会改变它。

---

## 6. Project Config API

### 6.1 项目定义

`WorkflowProjectDefinition` 增加 document nodes，并把 RFC 0003 的 setup 改成
`setupDocument`。只保留一个共享 context 泛型：

```ts
export interface WorkflowProjectDefinition<
  TContext = undefined,
> {
  /** beforeEach、steps 和 afterEach 使用。 */
  nodes: readonly NodeDefinition<
    any,
    any,
    TContext
  >[];

  /** beforeAll 和 afterAll 使用。 */
  documentNodes?: readonly DocumentNodeDefinition<
    any,
    any,
    TContext
  >[];

  setupDocument?: WorkflowDocumentSetup<TContext>;
}
```

不使用 `beforeAll`／`afterAll` 的项目不需要 `documentNodes`。但只要项目需要创建共享
context，就仍然使用 `setupDocument`。

### 6.2 为什么使用两个 registry

document node 和 workflow node 收到同一个 setup context，但 identity 和 history 不同。
使用一个 registry 会迫使 `ctx.workflow` 和 `ctx.document` 变成可选字段。节点作者只能
在运行时猜测当前 scope。

本 RFC 推荐两个 registry：

- `nodes` 保存 workflow-scope definitions；
- `documentNodes` 保存 document-scope definitions；
- 两个 registry 可以存在相同 node name；
- 同一个 registry 内继续禁止重名；
- collector 根据字段所在位置选择 registry。

例如，项目可以同时定义 workflow 版和 document 版 `database.reset`。两个版本可以共享
底层实现和 context，但获得不同的执行 identity。

### 6.3 Document node API

新增 `defineDocumentNode()`：

```ts
export interface DocumentNodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> {
  input: TInput & CommonNodeInput;
  $: Readonly<NormalizedStepMeta>;
  signal: AbortSignal;
  context: TContext;
  document: NodeDocumentContext;
}

export interface DocumentNodeDefinition<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> {
  name: string;
  title?: string;
  description?: string;
  execute(
    ctx: DocumentNodeExecutionContext<TInput, TContext>,
  ): NodeExecutionReturn<TData>;
}

export function defineDocumentNode<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
>(
  options: DocumentNodeDefinition<TInput, TData, TContext>,
): DocumentNodeDefinition<TInput, TData, TContext>;
```

`defineDocumentNode()` 与 `defineNode()` 复用相同的输入、输出、timeout 和错误包装逻辑。
区别只在执行 identity 和 context。

### 6.4 Workflow node context

workflow node 继续通过 `ctx.context` 读取 setup context。字段名不变，但其生命周期从
“当前 attempt”改为“当前 YAML document execution”。同一文件中的 `beforeEach`、steps
和 `afterEach` 都收到 `setupDocument()` 返回的同一个对象。

不增加 `ctx.documentContext`。同时暴露 `context` 和 `documentContext` 会给同一个对象
制造两个入口，也会继续暗示还存在另一套 attempt context。

---

## 7. Document Setup API

### 7.1 核心类型

```ts
export interface WorkflowDocumentInfo {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly sourcePath: string;
  readonly workflows: readonly NormalizedWorkflowDefinition[];
  readonly lifecycle: CollectedWorkflowLifecycle;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

export interface WorkflowDocumentSetupContext
  extends WorkflowDocumentInfo {
  onTeardown(teardown: WorkflowDocumentTeardown): void;
}

export type WorkflowDocumentSetup<TContext> = (
  ctx: WorkflowDocumentSetupContext,
) => Awaitable<TContext>;
```

`setupDocument()` 直接返回 document context。它不返回 `{ context, teardown }` 包装对象。
清理函数继续通过 `onTeardown()` 注册。

### 7.2 执行次数

如果项目提供了 `setupDocument()`，每个完成 collection 且至少包含一个待执行 workflow
的 YAML 文件调用一次。没有 `setupDocument()` 时，document context 为 `undefined`，
document hooks 仍然可以使用不依赖 context 的 document nodes。

以下操作不会重新调用它：

- 某个 workflow retry；
- 同一文件内开始下一个 workflow；
- 同一文件内并发执行多个 workflow。

重新启动 CLI、watch rerun 或另一个 shard 会创建新的 document context。

### 7.3 Context 共享边界

`setupDocument()` 的返回值直接作为当前文件的 context。它依次传给：

- `beforeAll` 和 `afterAll` 的 document nodes；
- 每个 attempt 的 `beforeEach`、steps 和 `afterEach` workflow nodes。

没有 `setupDocument()` 时，context 为 `undefined`。engine 不为每个 attempt 复制或包装
context。项目若允许同一文件内的 workflows 并发，必须保证共享 context 可以安全并发
使用。

### 7.4 Document teardown

document teardown 遵循 RFC 0003 的规则：

- 按注册顺序的逆序执行；
- 一个 callback 失败后继续执行其他 callback；
- `setupDocument()` 部分失败时也执行已经注册的 callback；
- 在 `afterAll` 结束后执行；
- `afterAll` 失败不能阻止 teardown；
- teardown 错误进入 document result。

`onTeardown()` 只能在 `setupDocument()` 进行期间调用。

---

## 8. Node 执行上下文

### 8.1 Workflow phase

`NodeWorkflowContext` 增加 phase 和完整执行历史：

```ts
export type WorkflowNodePhase =
  | 'beforeEach'
  | 'steps'
  | 'afterEach';

export interface NodeWorkflowContext
  extends WorkflowExecutionContext {
  readonly phase: WorkflowNodePhase;

  /** 当前 phase 内的零基下标。 */
  readonly stepIndex: number;

  /** 只包含 workflow 主体中已经完成的 steps。 */
  readonly completedSteps: readonly StepRunResult[];

  /** 包含当前 attempt 所有 phase 中已经完成的 node。 */
  readonly completedNodes: readonly StepRunResult[];
}
```

保留 `completedSteps` 可以维持 RFC 0002 的语义。需要读取 `beforeEach` 输出的节点使用
`completedNodes`。

### 8.2 Document identity

```ts
export type DocumentNodePhase = 'beforeAll' | 'afterAll';

export interface NodeDocumentContext {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly sourcePath: string;
  readonly phase: DocumentNodePhase;
  readonly stepIndex: number;
  readonly completedNodes: readonly StepRunResult[];
}
```

document node 不提供 `ctx.workflow`。它不能读取某个 workflow 的 `testId`、`runId` 或
`completedSteps`。

### 8.3 Step result phase

`StepRunResult` 增加 phase 和 phase 内下标：

```ts
export type NodeExecutionPhase =
  | DocumentNodePhase
  | WorkflowNodePhase;

export interface StepRunResult<TOutputData = unknown> {
  phase: NodeExecutionPhase;
  stepIndex: number;
  // 现有字段保持不变
}
```

报告不能只根据数组位置推断 phase。明确保存 phase 可以支持独立展示 hook 结果。

---

## 9. 固定执行顺序

### 9.1 Document

```text
create documentRunId
run setupDocument -> context
run beforeAll with context

if beforeAll succeeded:
  allow Rstest workflow tests to execute

after all workflow tests settle:
  run afterAll with context

run document teardown callbacks
finalize WorkflowDocumentRunResult
```

如果 `setupDocument()` 失败，engine 跳过 `beforeAll`、全部 workflow 和 `afterAll`，然后
执行已经注册的 document teardown。

如果 `beforeAll` 失败，全部 workflow 都不执行，但 `afterAll` 仍然执行。这样，已经完成
的 document 级业务动作有机会收尾。

### 9.2 Workflow attempt

```text
create runId
run beforeEach with document context
if beforeEach succeeded:
  run workflow steps with document context

run afterEach with document context
finalize WorkflowRunResult
```

如果 `beforeEach` 失败，engine 跳过 workflow steps，但仍然执行 `afterEach`。

workflow step 失败不能阻止 `afterEach` 开始。

### 9.3 为什么不直接使用 Rstest beforeEach

YAML `beforeEach` 和 `afterEach` 必须位于 `runWorkflow()` 内部，原因如下：

- 它们必须收到 document runtime 保存的共享 context；
- 它们需要写入同一个 `WorkflowRunResult`；
- `afterEach` 必须在 step 失败后继续执行；
- 每次 Rstest retry 都会重新调用 `runWorkflow()`；
- 并发 test 不需要在 bridge 中维护 hook state Map。

Rstest bridge 只使用 `beforeAll` 和 `afterAll` 来管理 document 边界。

---

## 10. 失败传播

### 10.1 通用列表规则

每个 lifecycle 列表沿用 RFC 0001 的顺序执行规则：

- node 正常完成时记录成功；
- node 抛错或 timeout 时记录失败；
- `continue-on-error: false` 停止当前列表；
- `continue-on-error: true` 继续当前列表；
- 任一 node 失败都会让所属 document 或 workflow 最终失败；
- `continue-on-error` 不会把失败改成成功。

`continue-on-error` 只影响当前列表，不会跨越 phase。例如，`beforeEach` 失败后，即使它
配置了 `continue-on-error: true`，workflow 主体仍然不执行。

### 10.2 before hook

| 情况 | 后续行为 |
|---|---|
| `setupDocument` 失败 | 跳过所有 hook 和 workflow，执行 document teardown |
| `beforeAll` 任一 node 失败 | 跳过所有 workflow，仍执行 `afterAll` 和 document teardown |
| `beforeEach` 任一 node 失败 | 跳过 steps，执行 `afterEach` |

before hook 的 `continue-on-error` 只允许列表中的后续准备 node 执行。它不代表环境已经
准备成功。

### 10.3 after hook

`afterEach` 或 `afterAll` 失败会把对应 scope 标记为失败。关键资源清理不应只放在 YAML
after hook 中。

如果 after hook 有多个相互独立的清理 node，用户应显式配置：

```yaml
afterEach:
  - test.cleanup-a:
      $:
        continue-on-error: true

  - test.cleanup-b:
      $:
        continue-on-error: true
```

即使 after hook 提前停止，config 中注册的 teardown callbacks 仍然全部执行。

### 10.4 多重错误

结果必须同时保留以下错误：

- setup error；
- before hook step errors；
- workflow step errors；
- after hook step errors；
- document teardown errors。

后发生的错误不能覆盖先发生的错误。

---

## 11. Retry、并发和调度

### 11.1 Retry

Rstest retry 只重新执行 test callback。因此，每次 retry 都执行：

```text
beforeEach
steps
afterEach
```

以下内容不会因为单个 workflow retry 而重新执行：

```text
setupDocument
beforeAll
afterAll
document teardown
```

新的 attempt 继续获得新的 `runId`，并读取同一个 document context。

### 11.2 并发 workflow

并行模式下，同一文件的多个 workflow 会共享 document context：

```text
document context D
  ├─ workflow attempt A
  └─ workflow attempt B
```

document context 可以保存线程安全的 client、只读 fixture 或连接池。它不适合直接保存
单个页面、单个设备会话或其他不可并发使用的可变对象。

如果 document context 包含单个 Midscene UI Agent，项目应使用串行模式。如何创建
attempt 私有 Agent 不在本 RFC 范围内。

### 11.3 多个 YAML 文件

每个文件有独立 document context。并行模式可以让不同文件的 document lifecycle
重叠执行。

首期不承诺多个文件的 `beforeAll` 和 `afterAll` 顺序。需要项目级串行资源时，用户应
关闭并行，或者在外部系统中实现锁。

### 11.4 Bail 和过滤

- `afterEach` 对已经开始的 attempt 必须执行；
- `afterAll` 对已经进入 document runtime 且取得可用 context 的文件必须执行；没有
  `setupDocument()` 时，`undefined` 也是可用 context；
- bail 后从未开始的文件不执行 document setup 和 hook；
- 名称过滤后，一个文件没有待执行 workflow 时，不执行它的 document lifecycle。

---

## 12. 结果模型

### 12.1 Workflow result

`WorkflowRunResult.steps` 继续只保存 workflow 主体。新增两个 lifecycle 数组：

```ts
export interface WorkflowRunResult {
  // RFC 0002 的现有字段保持不变
  beforeEach: StepRunResult[];
  steps: StepRunResult[];
  afterEach: StepRunResult[];
}
```

没有配置 hook 时，对应数组为空。单个 workflow result 的状态由三个 phase 共同决定；
文件级 setup 和 teardown 错误记录在 document result 中。

RFC 0003 放在 `WorkflowRunResult` 上的 attempt `setupError` 和 `teardownErrors` 随作用域
修正一并移除。对应信息只保存在 `WorkflowDocumentRunResult`，不能复制到文件内的每个
workflow result。

### 12.2 Document result

新增独立结果：

```ts
export interface WorkflowDocumentRunResult {
  documentId: string;
  documentRunId: string;
  projectId: string;
  sourcePath: string;
  status: 'success' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  beforeAll: StepRunResult[];
  afterAll: StepRunResult[];
  setupError?: WorkflowError;
  teardownErrors?: WorkflowError[];
}
```

document result 不复制各个 `WorkflowRunResult`。聚合器通过 `documentId` 和
`sourcePath` 建立关系。

### 12.3 Rstest 状态映射

- `beforeAll` 失败时，Rstest 把当前 `describe` 的 workflows 标记为未执行或 setup
  失败；
- workflow hook 失败时，当前 test callback 抛出 `WorkflowExecutionError`；
- `afterAll` 或 document teardown 失败时，当前 test file 和总体运行失败；
- 已成功完成的 workflow result 不因后续 `afterAll` 失败而改写；
- 总体 CLI exit code 只要任一 document 或 workflow 失败就是非零。

result store 新增 document 目录：

```text
.midscene/workflow-results/<run>/
  documents/<documentId>/<documentRunId>.json
  runs/<testId>/<runId>.json
```

---

## 13. Rstest Bridge

bridge 在每个文件的 `describe(sourcePath)` 中注册 document hooks：

```ts
describe(source.sourcePath, () => {
  const runtime = createDocumentRuntime(document, project);

  beforeAll(async () => {
    const result = await runtime.start();
    if (result.status === 'failed') {
      throw new WorkflowDocumentExecutionError(result);
    }
  });

  for (const workflow of document.workflows) {
    defineWorkflowTest(async () => {
      const result = await runWorkflow(workflow, {
        beforeEach: document.lifecycle.beforeEach,
        afterEach: document.lifecycle.afterEach,
        context: runtime.context,
        resolveNode: project.nodes.require.bind(project.nodes),
      });

      if (result.status === 'failed') {
        throw new WorkflowExecutionError(result);
      }
    });
  }

  afterAll(async () => {
    const result = await runtime.finish();
    writeWorkflowDocumentRunResult(result);
    if (result.status === 'failed') {
      throw new WorkflowDocumentExecutionError(result);
    }
  });
});
```

`runtime.start()` 的顺序是 `setupDocument -> beforeAll`。`runtime.finish()` 的顺序是
`afterAll -> document teardown`。

实现必须增加 Rstest 集成测试，确认 `beforeAll` 失败后仍会调用 `afterAll`。如果当前
Rstest 版本不保证该行为，bridge 必须增加自己的 finally 路径，不能依赖未验证的 runner
行为。

---

## 14. Midscene 节点

RFC 0003 的 `createMidsceneNodes()` 继续生成 workflow-scope nodes。它们可以直接用于
`beforeEach`、workflow `steps` 和 `afterEach`。

```yaml
beforeEach:
  - recordToReport: Workflow attempt started

afterEach:
  - recordToReport: Workflow attempt finished
```

如果需要在 `beforeAll` 或 `afterAll` 使用 Midscene Agent，应增加显式的 document
adapter：

```ts
const documentMidsceneNodes = createMidsceneDocumentNodes({
  getAgent: ({ context }) => context.uiAgent,
});

module.exports = defineWorkflowProject({
  documentNodes: documentMidsceneNodes,
  nodes: createMidsceneNodes({
    getAgent: ({ context }) => context.uiAgent,
  }),

  async setupDocument({ onTeardown }) {
    const uiAgent = await createUiAgent();
    onTeardown(() => uiAgent.destroy());
    return { uiAgent };
  },
});
```

该例会让全部 workflow 共享同一个 Agent，只适合串行模式。并行项目需要使用可并发的
context；attempt 私有 Agent 留待后续 RFC 设计。

`createMidsceneDocumentNodes()` 可以复用 RFC 0003 的输入校验和方法映射，但返回
`DocumentNodeDefinition[]`。不应通过类型断言把 workflow nodes 塞进 document
registry。

---

## 15. 完整示例

### 15.1 Project config

```js
const {
  defineDocumentNode,
  defineNode,
} = require('@midscene/test');
const {
  defineWorkflowProject,
} = require('@midscene/test/config');

const seedDatabase = defineDocumentNode({
  name: 'database.seed',
  async execute({ context }) {
    await context.database.seed();
  },
});

const cleanupDatabase = defineDocumentNode({
  name: 'database.cleanup',
  async execute({ context }) {
    await context.database.removeFixtures();
  },
});

const resetSession = defineNode({
  name: 'session.reset',
  async execute({ context }) {
    await context.session.reset();
  },
});

const createOrder = defineNode({
  name: 'order.create',
  async execute({ context }) {
    await context.session.createOrder();
  },
});

const cancelOrder = defineNode({
  name: 'order.cancel',
  async execute({ context }) {
    await context.session.cancelOrder();
  },
});

module.exports = defineWorkflowProject({
  documentNodes: [seedDatabase, cleanupDatabase],
  nodes: [resetSession, createOrder, cancelOrder],

  async setupDocument({ env, onTeardown }) {
    const database = await connectDatabase(env.TEST_DATABASE_URL);
    onTeardown(() => database.close());
    const session = await createSession(database);
    onTeardown(() => session.close());
    return { database, session };
  },
});
```

### 15.2 Workflow YAML

```yaml
beforeAll:
  - database.seed: Create the shared fixtures.

beforeEach:
  - session.reset: Reset the attempt session.

workflows:
  - name: Create order
    steps:
      - order.create: Create an order.

  - name: Cancel order
    steps:
      - order.cancel: Cancel an order.

afterEach:
  - session.reset:
      prompt: Clear the attempt state.
      $:
        continue-on-error: true

afterAll:
  - database.cleanup: Remove the shared fixtures.
```

---

## 16. 备选方案

### 16.1 把 hook 定义在每个 workflow 内

不作为首期方案。用户当前需要的是整个 YAML 文件共享 lifecycle。把四个字段放进每个
`workflows[]` 会重复定义，也会让 `beforeAll` 的 “All” 失去明确范围。

未来可以增加 workflow 级 override，但必须定义与顶层 hook 的合并顺序。

### 16.2 把 lifecycle 定义为 config 回调

不采用。config 已经有 setup API。lifecycle node 需要出现在 YAML、报告和测试结果中，
并使用 node registry。JavaScript 回调无法满足这些目标。

### 16.3 使用一个 node registry

不采用。document node 与 workflow node 共享 setup context，但执行 identity 不同。单
registry 会让 `ctx.workflow` 变成可选字段，也会允许依赖 workflow identity 的节点被
误用到 `beforeAll`。

### 16.4 为 document hook 创建隐藏 workflow

不采用。隐藏 workflow 会产生伪造的 `testId`、`workflowIndex` 和 retry 语义，也无法让
`beforeAll` 与 `afterAll` 自然共享 document resource。

### 16.5 直接映射全部 Rstest hooks

不采用。Rstest `beforeEach` 和 `afterEach` 不方便与 workflow steps 写入同一个
`WorkflowRunResult`，也不利于精确控制 before 失败和 after 始终执行的语义。

只使用 Rstest `beforeAll` 和 `afterAll` 管理 document 边界。attempt hook 由
`runWorkflow()` 管理。

### 16.6 after hook 永远执行全部 node

不采用。这样会让同一份 step 语法在不同位置具有不同的 `continue-on-error` 语义。

after hook 继续遵守 RFC 0001。必须执行的资源清理由 teardown callbacks 保证。多个相互
独立的 after node 应显式设置 `continue-on-error: true`。

---

## 17. 实现顺序

### 17.1 Collection 和 result

1. 扩展 YAML 顶层 schema。
2. 规范化四个 lifecycle 列表。
3. 增加 document registry 和 `defineDocumentNode()`。
4. 增加 phase、document identity 和 result 类型。

### 17.2 Workflow attempt hooks

1. 让 `runWorkflow()` 接收 `beforeEach` 和 `afterEach`。
2. 让 `runWorkflow()` 接收 document runtime 创建的共享 context，并增加 phase。
3. 实现 before 失败跳过 steps、after 始终进入的控制流。
4. 验证 retry 每次重新执行 attempt hooks。

### 17.3 Document hooks

1. 将 RFC 0003 的 `setupWorkflow()` 迁移为文件级 `setupDocument()` 和 document
   teardown stack。
2. 实现 document hook node runner。
3. 在 Rstest `describe()` 中接入 `beforeAll` 和 `afterAll`。
4. 写入 `WorkflowDocumentRunResult`。
5. 验证并发、失败、bail 和 teardown 顺序。

### 17.4 Midscene adapter

1. 现有 `createMidsceneNodes()` 支持 attempt hooks。
2. 如需 document 级 Agent，增加 `createMidsceneDocumentNodes()`。
3. 增加 model-free `recordToReport` e2e。

---

## 18. 测试要求

### 18.1 Unit test

- 四个字段完成 parse、normalize 和静态 node resolution；
- 显式空数组通过校验，执行时直接跳过；
- hook 顺序与 YAML 字段书写顺序无关；
- `beforeAll`、`beforeEach`、steps、`afterEach` 和 `afterAll` 收到同一个 setup
  context；
- `beforeEach` 失败后跳过 steps，但执行 `afterEach`；
- workflow step 失败后执行 `afterEach`；
- setup 失败时执行 teardown，并跳过对应 scope 的 hooks；
- `beforeAll` 失败后跳过 workflows，但执行 `afterAll`；
- after hook 失败后仍执行 teardown；
- 多个 teardown callback 逆序执行并聚合错误；
- document 和 workflow results 保留所有 phase errors；
- 两个 registry 可以存在相同 node name；
- hook 不能引用错误 scope 的 node。

### 18.2 E2E test

增加一个不依赖模型的 CLI fixture。它应记录以下顺序：

```text
setupDocument
beforeAll
beforeEach:attempt-1
steps:attempt-1
afterEach:attempt-1
beforeEach:attempt-2
steps:attempt-2
afterEach:attempt-2
afterAll
documentTeardown
```

另一个 retry 用例应确认：

- `setupDocument`、`beforeAll`、`afterAll` 和 document teardown 各执行一次；
- `beforeEach`、steps 和 `afterEach` 每个 attempt 都执行；
- retry attempt 使用不同 `runId`；
- retry attempt 读取同一个 context。

---

## 19. 验收标准

- YAML 顶层可以声明四个 lifecycle node 列表；
- 四个列表复用 workflow step 语法和 `$` meta；
- document context 创建成功后，`beforeAll`／`afterAll` 每个 document execution 各执行
  一次；
- `beforeEach`／`afterEach` 每个 workflow attempt 各执行一次；
- retry 不重复 document lifecycle；
- workflow 并发时共享同一个 setup context；
- before hook 失败会阻止对应主体执行；
- after hook 在主体失败后仍然执行；
- setup teardown 在 hook 失败后仍然执行；
- document hook 和 workflow hook 使用独立、静态的 node registry；
- workflow result 和 document result 都保存结构化 phase 结果；
- 没有 lifecycle 配置的现有项目行为保持不变。

核心边界是：`setupDocument()` 位于文件生命周期最外层并管理共享资源；YAML lifecycle
表达可观察的测试动作。`beforeEach` 和 `afterEach` 是 attempt 级动作，但不因此产生第二
套 setup context。
