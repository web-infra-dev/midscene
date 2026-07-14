# RFC 0006 · Rename Standalone Workflow Keyword to `cases`

状态：**已实现**

范围：把 `WorkflowEngine` 单用例输入中的顶层 `workflow:` 改为 `cases:`。本 RFC 同时
定义对象输入、公开类型、错误提示、迁移策略和测试范围。

本 RFC 建立在 RFC 0001～0005 之上：

- RFC 0001 定义单个 workflow 的 node 列表，并首次使用顶层 `workflow:`；
- RFC 0002 定义多用例文档 `workflows[].steps`；
- RFC 0003 和 RFC 0004 定义 context 与 lifecycle；
- RFC 0005 定义主进程 runner。

本 RFC 只取代 RFC 0001 中的顶层 `workflow:` 写法。RFC 0002～0005 的
`workflows[].steps`、运行时 workflow 术语和结果结构保持不变。

---

## 1. 结论

`WorkflowEngine` 接收的单用例 YAML 从以下写法：

```yaml
workflow:
  - aiAct: Create a paid order.
  - aiAssert: The order detail page shows payment success.
```

改为：

```yaml
cases:
  - aiAct: Create a paid order.
  - aiAssert: The order detail page shows payment success.
```

对象输入同步修改：

```ts
await engine.run({
  cases: [
    { aiAct: 'Create a paid order.' },
    { aiAssert: 'The order detail page shows payment success.' },
  ],
});
```

本次修改遵循以下原则：

1. `cases` 是单用例输入唯一合法的顶层列表字段；
2. 不继续接受 `workflow`，也不增加兼容别名；
3. YAML 字符串和 TypeScript 对象使用同一套结构；
4. `normalizeWorkflow()` 的返回值同步从 `.workflow` 改为 `.cases`；
5. 多用例文档继续使用 `workflows[].steps`；
6. `WorkflowEngine`、`runWorkflow()` 和 `ctx.workflow` 等运行时名称不变。

这是一项输入 schema 的破坏性修改。实现与测试必须在同一个变更中完成。

---

## 2. 当前实现

`packages/workflow` 目前存在两套 YAML 入口。两者服务于不同场景。

| 入口 | 当前结构 | 调用方 |
|---|---|---|
| 单用例输入 | `workflow: Node[]` | `WorkflowEngine.run()`、`normalizeWorkflow()` |
| 多用例文档 | `workflows[].steps` | CLI、`collectWorkflowDocument()` |

单用例入口位于以下链路：

```text
WorkflowEngine.run(source)
  -> normalizeWorkflow(source)
    -> parseWorkflow(yaml string)
    -> normalizeStep(...)
  -> runWorkflow(...)
```

对应实现主要位于：

- `packages/workflow/src/parser/types.ts`；
- `packages/workflow/src/parser/normalize.ts`；
- `packages/workflow/src/engine/workflow-engine.ts`；
- `packages/workflow/tests/normalize.test.ts`；
- `packages/workflow/tests/runner.test.ts`。

多用例文档由 `collectWorkflowDocument()` 独立解析。它只接受以下顶层字段：

```text
beforeAll
beforeEach
workflows
afterEach
afterAll
```

因此，本次修改不能把多用例文档中的 `workflows` 或 `steps` 一并替换。否则会同时改变
RFC 0002、RFC 0004、CLI collection、结果 identity 和全部 e2e fixture。

---

## 3. 修改原因

`workflow` 同时表示产品、执行单元和 YAML 列表字段。单用例写法因此容易产生歧义：

```yaml
workflow:
  - node.one: first
  - node.two: second
```

这段 YAML 中，`workflow` 的值实际是一组 step，而不是一个完整的 workflow document。
调用方也无法从字段名判断它描述的是一个独立用例，还是多个 workflow 的容器。

改为 `cases` 后，单用例入口具有独立的字段名：

- `cases` 表示当前要执行的单用例内容；
- `cases` 的值是按顺序执行的 node 列表；
- `workflows` 继续表示一个文档中的多个具名 workflow；
- `workflow` 继续作为运行时领域术语。

本次修改不试图统一所有名词。它只解决单用例输入字段与 workflow 领域对象重名的问题。

---

## 4. 设计目标

1. **唯一写法**：单用例输入只接受 `cases`。
2. **输入一致**：YAML 字符串和对象输入使用相同字段。
3. **错误明确**：旧字段和拼写错误必须在执行 node 前失败。
4. **改动收敛**：不影响 CLI 多用例文档、lifecycle 和 result model。
5. **类型清晰**：公开类型不再把单用例输入称为 legacy workflow。
6. **执行语义不变**：step 顺序、简写、`$`、timeout 和错误处理保持现状。
7. **迁移简单**：现有单用例只需替换顶层字段和对应对象属性。

---

## 5. 不在本次范围内的能力

本 RFC 不包含以下修改：

- 不把 `workflows` 改为 `cases`；
- 不把 `workflows[].steps` 改为 `workflows[].cases`；
- 不修改 `beforeAll`、`beforeEach`、`afterEach` 或 `afterAll`；
- 不修改 node item、字符串简写和 `$` meta；
- 不重命名 `WorkflowEngine`、`runWorkflow()` 或 `WorkflowRunResult`；
- 不重命名 `NodeExecutionContext.workflow`；
- 不重命名 `workflowIndex`、project result 中的 `workflows` 或 CLI 文案；
- 不修改 `midscene.workflow.config.*` 文件名；
- 不修改 `@midscene/workflow` 包名和命令名；
- 不修改 `WorkflowEngine` 当前生成的固定 result identity；
- 不增加 YAML 自动迁移工具。

`cases` 是输入 schema 的字段。它不是对整个 workflow 运行时领域模型的改名。

---

## 6. 输入 Schema

### 6.1 YAML 字符串

新的单用例结构如下：

```yaml
cases:
  - http.request:
      prompt: Create a paid order.
      method: POST
      url: /orders
      $:
        timeout: 20000

  - aiAssert: The order detail page shows payment success.
```

`cases` 的值必须是数组。数组中的每一项继续由 `normalizeStep()` 处理。

以下语义保持不变：

- node 字符串值展开为 `{ prompt: value }`；
- node mapping 中的 `$` 与业务 input 分离；
- `$.timeout` 使用毫秒；
- `$.continue-on-error` 只控制失败后是否继续；
- node item 必须且只能包含一个 node name；
- `cases: []` 继续表示没有 step 的空用例。

### 6.2 对象输入

`WorkflowEngine.run()` 的对象输入必须与 YAML 结构一致：

```ts
await engine.run({
  cases: [
    {
      'http.request': {
        prompt: 'Create a paid order.',
        method: 'POST',
        url: '/orders',
      },
    },
  ],
});
```

不保留以下对象写法：

```ts
await engine.run({
  workflow: [],
});
```

只修改 YAML 字符串而保留对象属性会产生两套 schema。解析器、类型和测试也会长期分叉。
因此，两种输入必须在同一次修改中切换。

### 6.3 顶层字段校验

单用例输入的顶层值必须是 mapping，并且只允许 `cases` 字段。

以下输入都必须失败：

```yaml
workflow: []
```

```yaml
cases: []
workflow: []
```

```yaml
cases: []
case: []
```

旧字段应返回直接的迁移提示：

```text
Workflow definition no longer supports "workflow". Use "cases" instead.
```

其他未知字段沿用 schema error：

```text
Workflow definition has unsupported field "case".
```

`cases` 缺失或值不是数组时，应返回：

```text
Workflow definition must contain a cases array.
```

校验必须发生在 node resolution 和 node 执行之前。解析失败时不能返回空用例，也不能忽略
未知字段。

### 6.4 多用例文档

CLI YAML 保持原状：

```yaml
beforeEach:
  - session.reset: Reset the session.

workflows:
  - name: Create order
    steps:
      - order.create: Create an order.

  - name: Cancel order
    steps:
      - order.cancel: Cancel the order.
```

在多用例文档顶层使用 `cases` 仍然是错误：

```yaml
cases:
  - order.create: Create an order.
```

`collectWorkflowDocument()` 应继续报告 unsupported field。它不能把 `cases` 隐式包装成
`workflows[0]`，因为单用例输入没有 `name`、document lifecycle 和稳定的
`workflowIndex` 语义。

---

## 7. TypeScript API

### 7.1 输入类型

当前类型使用了 `LegacyWorkflowDefinition`：

```ts
export interface LegacyWorkflowDefinition {
  workflow: WorkflowStepInput[];
}
```

修改后使用：

```ts
export interface WorkflowCasesDefinition {
  cases: WorkflowStepInput[];
}

export type WorkflowSource = string | WorkflowCasesDefinition;
```

`WorkflowCasesDefinition` 与现有 `WorkflowDefinition` 含义不同：

- `WorkflowCasesDefinition` 是 `WorkflowEngine.run()` 的单用例输入；
- `WorkflowDefinition` 是多用例文档中带 `name` 和 `steps` 的一项。

两者不能合并。合并后会让 `name`、`steps` 和 `cases` 变成相互依赖的可选字段。

删除 `LegacyWorkflowDefinition`。不保留类型别名，否则 TypeScript 用户仍然可以继续构造
旧字段。

### 7.2 解析与规范化结果

函数名继续使用 workflow 领域术语：

```ts
export function parseWorkflow(
  source: string,
): WorkflowCasesDefinition;

export function normalizeWorkflow(
  source: WorkflowSource,
): NormalizedWorkflow;
```

`NormalizedWorkflow` 同步修改：

```ts
export interface NormalizedWorkflow {
  cases: NormalizedStep[];
}
```

规范化示例：

```ts
normalizeWorkflow(`
cases:
  - aiAct: Create an order.
`);
```

返回：

```ts
{
  cases: [
    {
      node: 'aiAct',
      input: { prompt: 'Create an order.' },
      meta: { continueOnError: false },
    },
  ],
}
```

`parseWorkflow()` 和 `normalizeWorkflow()` 不改名。它们仍然负责解析并规范化一个
workflow 的输入。只把其中的 YAML 字段改为 `cases`。

### 7.3 Engine 接线

`WorkflowEngine.run()` 只需要修改规范化结果的读取位置：

```ts
const normalized = normalizeWorkflow(source);

const workflow: CollectedWorkflow = {
  // 现有 synthetic identity 保持不变。
  definition: {
    name: 'workflow',
    steps: normalized.cases,
  },
};
```

从这一层开始，engine 继续使用 `CollectedWorkflow.definition.steps`。因此，以下实现不需要
修改：

- `runWorkflow()`；
- `runStepForWorkflow()`；
- `NodeWorkflowContext`；
- `WorkflowRunResult`；
- document runtime；
- CLI runner 和 result store。

保留这条边界可以防止一个 YAML 字段改名扩散为运行时模型改名。

---

## 8. 兼容与迁移

### 8.1 不提供双字段兼容

实现不接受 `workflow` 和 `cases` 两种写法，也不做以下自动转换：

```ts
if (definition.cases === undefined && definition.workflow !== undefined) {
  definition.cases = definition.workflow;
}
```

不采用兼容层的原因如下：

1. 两种写法会长期共存，无法确定文档中的规范示例；
2. 同时出现两个字段时，需要新增优先级和合并规则；
3. TypeScript 类型与 YAML runtime 行为容易不一致；
4. 当前单用例入口影响面集中，迁移只需要替换一个字段；
5. 明确报错比静默接受旧格式更容易发现遗漏。

旧 YAML 文件可以直接修改：

```diff
-workflow:
+cases:
   - aiAct: Create an order.
```

旧对象输入可以直接修改：

```diff
 await engine.run({
-  workflow: steps,
+  cases: steps,
 });
```

### 8.2 迁移边界

搜索替换时，只处理以下内容：

- 单用例 YAML 的顶层 `workflow:`；
- `WorkflowEngine.run({ workflow: ... })`；
- 直接构造 `LegacyWorkflowDefinition` 的代码；
- 读取 `normalizeWorkflow(...).workflow` 的代码。

以下内容不能替换：

- `workflows:`；
- `workflows[].steps`；
- `ctx.workflow`；
- `workflowIndex`；
- `runWorkflow()`；
- `WorkflowRunResult`；
- `midscene.workflow.config.*`。

### 8.3 RFC 关系

RFC 0001 中所有顶层 `workflow:` 示例由本 RFC 取代。RFC 0001 定义的 step 结构和 node
API 继续有效。

RFC 0002～0005 没有使用单用例 YAML 入口。它们的 `workflows`、`steps`、lifecycle、
runner 和 result 设计保持有效。

---

## 9. 代码修改范围

### 9.1 必须修改

| 文件 | 修改内容 |
|---|---|
| `src/parser/types.ts` | 增加 `WorkflowCasesDefinition`，删除 `LegacyWorkflowDefinition`，修改 `NormalizedWorkflow` |
| `src/parser/normalize.ts` | 读取并校验 `cases`，拒绝 `workflow` 和未知字段，返回 `.cases` |
| `src/engine/workflow-engine.ts` | 使用 `normalized.cases` 构造 `definition.steps` |
| `tests/normalize.test.ts` | 把 fixture 和断言改为 `cases`，增加旧字段与未知字段测试 |
| `tests/runner.test.ts` | 把 `WorkflowEngine.run()` 的对象输入改为 `{ cases: ... }` |

路径均相对于 `packages/workflow`。

### 9.2 不应修改

以下文件不属于本次功能修改：

- `src/parser/collect.ts`；
- `src/engine/run-workflow.ts`；
- `src/engine/run-step.ts`；
- `src/engine/document-runtime.ts`；
- `src/cli/workflow-runner.ts`；
- `src/cli/result-store.ts`；
- CLI e2e fixtures 中的 `workflows[].steps`。

可以增加一条 collection 回归测试，确认多用例文档拒绝顶层 `cases`。这项测试不需要修改
collector 实现。

---

## 10. 实现顺序

1. 在 parser types 中增加 `WorkflowCasesDefinition`。
2. 删除 `LegacyWorkflowDefinition`，并更新 `WorkflowSource`。
3. 把 `NormalizedWorkflow.workflow` 改为 `NormalizedWorkflow.cases`。
4. 修改 `normalizeWorkflow()` 的字段校验和错误提示。
5. 修改 `WorkflowEngine.run()`，把 `normalized.cases` 传入内部 `steps`。
6. 更新单用例 normalization 和 runner tests。
7. 增加旧字段、双字段、未知字段和错误类型测试。
8. 增加多用例 document 不受影响的回归测试。
9. 检查公开类型产物，确认旧类型和旧属性不再导出。
10. 更新面向开发者的单用例示例；历史 RFC 的取代关系由本文说明。

实现过程中不应同时保留两条 parser 分支。所有调用方切换完成后，旧字段应直接退出代码。

---

## 11. 测试要求

### 11.1 Normalization

- YAML `cases` 可以规范化字符串简写；
- YAML block scalar 继续展开为 `prompt`；
- `cases` 中的 `$` 正确分离和规范化；
- 对象输入 `{ cases: [...] }` 可以规范化；
- `cases: []` 保持有效；
- `cases` 不是数组时报告 `cases array`；
- 缺少 `cases` 时报告 `cases array`；
- 旧 `workflow` 字段返回明确迁移错误；
- `cases` 和 `workflow` 同时出现时仍然拒绝旧字段；
- `case` 或其他未知字段被拒绝；
- YAML 语法错误继续包装为 `WorkflowParseError`。

### 11.2 Engine

- `WorkflowEngine.run({ cases: [...] })` 按顺序执行 node；
- YAML 字符串输入和对象输入得到相同结果；
- `continue-on-error`、timeout 和 context 语义保持不变；
- 旧对象输入在 TypeScript 中无法通过类型检查；
- 旧 YAML 在任何 node 执行前失败；
- `WorkflowRunResult` 结构和 synthetic identity 保持不变。

### 11.3 Document 与 CLI 回归

- `workflows[].steps` 继续完成 collection；
- 顶层 `cases` 不能被当作 workflow document；
- lifecycle 字段继续使用原有 node 列表；
- CLI fixture 不需要改为 `cases`；
- project result 中的 `workflows` 和 `workflowIndex` 保持不变。

### 11.4 验证命令

实现完成后运行：

```sh
pnpm run lint
npx nx test @midscene/workflow
npx nx build @midscene/workflow
```

本次修改涉及公开类型和 package 导出，因此必须执行 focused build。

---

## 12. 备选方案

### 12.1 同时支持 `workflow` 和 `cases`

不采用。双字段会引入规范写法、优先级和类型不一致问题。明确报错可以让遗漏在执行前暴露。

### 12.2 只修改 YAML 字符串

不采用。`WorkflowEngine.run()` 同时接受 YAML 字符串和对象。两者使用不同字段会让
`WorkflowSource` 无法表达统一契约。

### 12.3 把多用例 `workflows` 改为 `cases`

不采用。多用例文档是 RFC 0002～0005 的核心结构。它还关联名称、identity、lifecycle、
调度和 result model，远超本次字段改名的范围。

### 12.4 把 `workflows[].steps` 改为 `cases`

不采用。`steps` 准确表示一个具名 workflow 的有序执行列表。`cases` 表示的是单用例入口，
两者的结构层级不同。

### 12.5 全面把 Workflow 术语改为 Cases

不采用。Workflow 是包、engine、运行结果和 node context 的领域名称。`cases` 只用于缩小
单用例输入字段的歧义。

### 12.6 让规范化结果使用 `steps`

不采用。当前 `normalizeWorkflow()` 的输出与单用例顶层字段保持同名。直接把
`.workflow` 改为 `.cases` 是最小且可预测的 API 变化。内部进入 `CollectedWorkflow` 后，
仍然统一使用 `definition.steps`。

---

## 13. 验收标准

- 单用例 YAML 只接受顶层 `cases`；
- `WorkflowEngine.run()` 的对象输入只接受 `{ cases: [...] }`；
- `normalizeWorkflow()` 返回 `{ cases: NormalizedStep[] }`；
- `WorkflowCasesDefinition` 替代 `LegacyWorkflowDefinition`；
- 旧 `workflow` 字段返回明确错误，不被自动转换；
- 未知顶层字段不会被静默忽略；
- step、node、`$`、timeout 和 `continue-on-error` 语义不变；
- 多用例 `workflows[].steps`、lifecycle 和 CLI 行为不变；
- workflow 运行时类型、result 字段和 config 文件名不变；
- unit tests 覆盖新字段、旧字段拒绝和多用例回归；
- lint、focused test 和 focused build 全部通过。

核心边界是：`cases` 取代单用例输入中的 `workflow` 字段，但 Workflow 仍然是 engine 和
运行时模型的领域名称。
