# RFC 0006 · Workflow 术语与 `cases` 文档结构

状态：**已实现**

范围：统一 `packages/workflow` 的 Step、Case、Workflow Document 和 Workflow Project
术语，并把多任务 YAML 的顶层字段改为 `cases`。

本 RFC 建立在 RFC 0001～0005 之上。它取代这些 RFC 中与单个任务有关的 workflow
命名。旧 RFC 保留为设计历史，不再代表当前公开 API。

---

## 1. 结论

`workflow` 只表示包含生命周期和多个任务的编排边界。单个可执行任务统一称为 Case。

最终术语如下。

| 术语 | 含义 | 主要表示 |
|---|---|---|
| Node | 已注册的执行实现 | `NodeDefinition` |
| Step | YAML 中对一个 Node 的一次调用 | `NormalizedStep` |
| Case | 有名称、按顺序执行多个 Step 的任务 | `CaseDefinition`、`runCase()` |
| Workflow Document | 一个 YAML 文件，包含生命周期和多个 Case | `CollectedWorkflowDocument` |
| Workflow Project | 一组 Workflow Document 和项目配置 | `runWorkflowProject()` |

公开函数按职责使用不同动词。

```text
normalizeSteps()          规范化 Step 列表
collectWorkflowDocument() 解析并收集一个 YAML 文件
runCase()                 执行一个 Case
runWorkflowDocument()     执行一个文件的生命周期和全部 Case
runWorkflowProject()      发现、执行并汇总多个文件
```

多任务 YAML 使用 `cases:`，不再接受 `workflows:`。项目尚未发布，因此不提供旧字段、旧
类型或旧函数的兼容层。

---

## 2. 问题

旧实现把 workflow 同时用于以下概念：

1. 一组待规范化的 Step；
2. 一个带 `name` 和 `steps` 的任务；
3. 一个带生命周期的 YAML 文件；
4. 多个 YAML 文件组成的项目；
5. Node 执行时的任务上下文。

因此，`normalizeWorkflow()`、`runWorkflow()` 和
`collectWorkflowDocument()` 中的 workflow 不是同一层级。调用方必须先阅读实现，才能
判断一个名称指向 Step 列表、单个任务还是完整文件。

旧的 `workflows:` 也放大了这个问题。这个字段实际包含可独立执行的任务，而不是嵌套的
完整 workflow。任务具有名称和 Step，但不具有 `beforeAll`、`afterAll`、文件上下文或
项目配置。

本 RFC 让名称直接表达层级。Case 是最小的具名执行单元，Workflow Document 才是完整的
编排单元。

---

## 3. YAML 结构

Workflow Document 的完整结构如下。

```yaml
beforeAll:
  - database.prepare: Prepare fixtures

beforeEach:
  - browser.reset: Reset browser state

cases:
  - name: Create a paid order
    steps:
      - aiAct: Create a paid order.
      - aiAssert: The order detail page shows payment success.

  - name: Cancel an order
    steps:
      - aiAct: Cancel the latest order.
      - aiAssert: The order status is cancelled.

afterEach:
  - report.save: Save case report

afterAll:
  - database.cleanup: Remove fixtures
```

顶层只允许以下字段：

```text
beforeAll
beforeEach
cases
afterEach
afterAll
```

`cases` 必须是非空数组。每个 Case 必须包含非空的 `name` 和 `steps`。每个 `steps` 也必须
是非空数组。

以下旧结构直接报错。

```yaml
workflows:
  - name: Create an order
    steps:
      - aiAct: Create an order.
```

解析器不会自动把 `workflows` 转成 `cases`，也不会同时接受两个字段。

---

## 4. 规范化 API

### 4.1 Step 规范化

`normalizeStep()` 规范化一个 Step。`normalizeSteps()` 规范化一个 Step 数组。

```ts
export function normalizeStep(
  value: unknown,
  index?: number,
): NormalizedStep;

export function normalizeSteps(steps: unknown): NormalizedStep[];
```

示例：

```ts
const steps = normalizeSteps([
  { aiAct: 'Create an order.' },
  {
    aiAssert: {
      prompt: 'The order is visible.',
      $: { timeout: 30_000 },
    },
  },
]);
```

`normalizeSteps()` 不解析 YAML，不创建 Case，也不执行 Node。它只处理 Step 列表。

### 4.2 删除独立 YAML 解析入口

删除以下旧 API：

```text
parseWorkflow()
normalizeWorkflow()
WorkflowSource
WorkflowCasesDefinition
NormalizedWorkflow
```

Workflow YAML 只有一个入口：`collectWorkflowDocument()`。这避免同一份 YAML 出现两套
顶层 schema。

`WorkflowEngine.run()` 继续提供轻量调用方式，但只接收对象形式的 Case 输入。

```ts
export interface CaseInput {
  name?: string;
  steps: readonly StepInput[];
}

await engine.run({
  name: 'Create an order',
  steps: [{ aiAct: 'Create an order.' }],
});
```

---

## 5. 收集与执行 API

### 5.1 收集 Workflow Document

`collectWorkflowDocument()` 负责读取和验证一个 YAML 文件。它完成以下工作：

1. 解析 YAML；
2. 验证顶层字段和 Case 结构；
3. 规范化 lifecycle Step 和 Case Step；
4. 在对应 registry 中解析 Node；
5. 创建稳定的 document id 和 case id；
6. 返回 `CollectedWorkflowDocument`。

```ts
export function collectWorkflowDocument(
  source: WorkflowDocumentSource,
  options: CollectWorkflowDocumentOptions,
): CollectedWorkflowDocument;
```

这里保留 Workflow 一词，因为函数处理的是完整 Workflow Document。`collect` 表示收集和
静态验证，不表示执行。

### 5.2 执行 Case

`runCase()` 执行一个 `CollectedCase`。

```ts
export function runCase<TContext = undefined>(
  collectedCase: CollectedCase,
  options: RunCaseOptions<TContext>,
): Promise<CaseRunResult>;
```

执行顺序如下。

```text
beforeEach -> steps -> afterEach
```

`afterEach` 在主体失败后仍然执行。`CaseRunResult` 分别保存三个阶段的 Step 结果。

### 5.3 执行 Workflow Document

`runWorkflowDocument()` 执行一个完整文件。

```ts
export function runWorkflowDocument<TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: RunWorkflowDocumentOptions<TContext>,
): Promise<WorkflowDocumentExecutionResult>;
```

执行顺序如下。

```text
setupDocument
beforeAll
  case 1: beforeEach -> steps -> afterEach
  case 2: beforeEach -> steps -> afterEach
  ...
afterAll
document teardown
```

该函数共享 document context，并负责始终完成已启动文件的清理。`beforeAll` 或
`setupDocument` 失败时，文件内的 Case 标记为 `not-run`。

### 5.4 执行 Workflow Project

`runWorkflowProject()` 保留 Workflow 一词。它负责发现 YAML、加载项目配置、收集文件、
处理中断、汇总结果和设置 CLI 退出状态。

Project runner 不再直接实现 Case 和 document lifecycle 的执行细节。它调用
`runWorkflowDocument()`，再聚合每个文件的结果。

---

## 6. 类型重命名

单任务类型统一使用 Case。

| 旧名称 | 新名称 |
|---|---|
| `WorkflowStepInput` | `StepInput` |
| `WorkflowStepValue` | `StepValue` |
| `WorkflowDefinition` | `CaseDefinition` |
| `NormalizedWorkflowDefinition` | `NormalizedCaseDefinition` |
| `CollectedWorkflow` | `CollectedCase` |
| `WorkflowRunResult` | `CaseRunResult` |
| `WorkflowExecutionContext` | `CaseExecutionContext` |
| `NodeWorkflowContext` | `NodeCaseContext` |
| `WorkflowNodePhase` | `CaseNodePhase` |
| `RunWorkflowOptions` | `RunCaseOptions` |
| `WorkflowExecutionError` | `CaseExecutionError` |

Document 和 Project 类型继续使用 Workflow。

```text
WorkflowDocumentDefinition
WorkflowDocumentSource
CollectedWorkflowDocument
WorkflowDocumentRuntime
WorkflowDocumentRunResult
WorkflowProjectRunResult
```

生命周期集合从 `CollectedWorkflowLifecycle` 改为
`CollectedDocumentLifecycle`。这个名称明确说明生命周期属于文件，而不是某个 Case。

---

## 7. Node 上下文

Case Node 使用 `ctx.case`。

```ts
export interface NodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> {
  input: TInput & CommonNodeInput;
  $: NormalizedStepMeta;
  signal: AbortSignal;
  case: NodeCaseContext;
  context: TContext;
}
```

`NodeCaseContext` 提供以下信息：

```text
caseId
runId
name
sourcePath
caseIndex
phase
stepIndex
completedSteps
completedNodes
```

Document Node 继续使用 `ctx.document`。Document Node 不提供 `ctx.case`，Case Node 也不
提供 `ctx.document`。两类 Node 通过独立 registry 保持作用域清晰。

---

## 8. Identity 与结果

Case identity 使用 `caseId` 和 `caseIndex`，不再使用 `testId` 和 `workflowIndex`。

```ts
export interface CaseRunResult {
  caseId: string;
  runId: string;
  name: string;
  sourcePath: string;
  caseIndex: number;
  status: 'success' | 'failed';
  beforeEach: StepRunResult[];
  steps: StepRunResult[];
  afterEach: StepRunResult[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}
```

Project 结果中的 `workflows` 改为 `cases`。落盘的 `project.json` schema version 从 1
升级到 2。

```json
{
  "version": 2,
  "cases": [
    {
      "caseId": "...",
      "name": "Create an order",
      "caseIndex": 0,
      "status": "success",
      "resultFile": "runs/.../...json"
    }
  ]
}
```

报告结果是可重新生成的数据。根据仓库规则，本次 schema 修改不读取旧结果格式。

---

## 9. 错误语义

错误名称和错误码跟随实际作用域。

```text
CASE_EXECUTION_FAILED
WORKFLOW_DOCUMENT_SETUP_ERROR
WORKFLOW_DOCUMENT_TEARDOWN_ERROR
WORKFLOW_DOCUMENT_EXECUTION_FAILED
```

Case 执行错误包含 `caseId` 和 `runId`。Document 错误继续包含 `documentId` 和
`documentRunId`。

未知 Node、非法 Step、非法 lifecycle 和不支持的 `workflows` 字段继续抛出
`WorkflowParseError`。错误不会通过空值或空结果降级。

---

## 10. 不兼容修改

本 RFC 不提供兼容层。以下用法直接删除：

1. YAML 顶层 `workflows:`；
2. `normalizeWorkflow()` 和 `parseWorkflow()`；
3. `runWorkflow()`；
4. `ctx.workflow`；
5. `WorkflowRunResult` 等单任务 workflow 类型；
6. project result 中的 `workflows`、`testId` 和 `workflowIndex`；
7. 旧版 `project.json` schema。

以下名称保持不变：

```text
WorkflowEngine
collectWorkflowDocument()
runWorkflowDocument()
runWorkflowProject()
defineWorkflowProject()
midscene.workflow.config.cjs
midscene-workflow
```

这些名称都位于 document、project 或产品入口层级，没有指代单个 Case。

---

## 11. 实现范围

本次实现包括以下修改：

1. 把 Workflow Document 的 `workflows` 字段改为 `cases`；
2. 增加 `normalizeSteps()`，删除独立 workflow 规范化 API；
3. 把单任务收集、执行、上下文和结果类型改为 Case；
4. 把 `run-workflow.ts` 改为 `run-case.ts`；
5. 增加 `runWorkflowDocument()`，并让 Project runner 调用它；
6. 把 Node 上下文从 `ctx.workflow` 改为 `ctx.case`；
7. 把 CLI 聚合结果从 `workflows` 改为 `cases`；
8. 更新单元测试、CLI e2e fixture 和结果断言；
9. 将 `project.json` schema version 升级到 2。

---

## 12. 验收标准

实现必须满足以下条件：

1. `normalizeSteps()` 只接收和返回 Step 列表；
2. `WorkflowEngine.run()` 接收 `{ name?, steps }`；
3. `collectWorkflowDocument()` 只接受顶层 `cases`；
4. `runCase()` 正确执行 `beforeEach`、`steps` 和 `afterEach`；
5. `runWorkflowDocument()` 正确执行文件生命周期和全部 Case；
6. `ctx.case` 提供 Case identity、phase 和执行历史；
7. Project runner 在 Case 失败后继续执行后续 Case 和文件；
8. 中断后，已启动文件完成清理，其余 Case 标记为 `not-run`；
9. 结果文件只写入 `cases`、`caseId` 和 `caseIndex`；
10. 代码中不存在旧单任务 workflow API；
11. workflow package 的单元测试、e2e、lint 和 build 全部通过。

---

## 13. 非目标

本 RFC 不修改以下内容：

- Node 的 YAML 调用语法；
- `$` 元数据、timeout 和 `continue-on-error` 语义；
- lifecycle 的执行顺序；
- Workflow Project 配置文件名和 CLI 名称；
- YAML 文件发现顺序；
- 并行、retry 或 bail 调度策略；
- Midscene Agent 的创建和销毁方式。

---

## 14. 与旧 RFC 的关系

RFC 0001～0005 记录了 workflow package 的演进过程。本 RFC 只覆盖其中的术语和相关公开
结构，不修改已经确定的执行语义。

阅读旧 RFC 时，应按以下规则理解：

- 表示具名 `steps` 任务的 workflow，改读为 Case；
- 表示 YAML 文件及其生命周期的 workflow，改读为 Workflow Document；
- 表示多个 YAML 文件及配置的 workflow，改读为 Workflow Project；
- 旧代码示例中的 `workflows:`、`runWorkflow()` 和 `ctx.workflow` 已失效。

后续 RFC 必须直接使用本 RFC 的术语。
