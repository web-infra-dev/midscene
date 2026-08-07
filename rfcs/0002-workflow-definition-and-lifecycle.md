# RFC 0002 · Workflow Definition and Rstest Runner

状态：**草稿 / 待评审**

范围：定义多 workflow 文件的 YAML 结构、workflow collection、单个 workflow
的顺序执行，以及通过 Rstest JavaScript SDK 运行 workflow 的适配层。

本 RFC 建立在 RFC 0001 之上。RFC 0001 继续负责 step、node definition、step
timeout 和 `continue-on-error`。本 RFC 负责把多个 step 组织成测试用例，并把每个
workflow 注册为一个 Rstest test。

首期只保证一个 workflow 内的 step 按声明顺序执行。Workflow 不提供资源管理方法、
错误 hook、分支、DAG 或 step 并行。

CLI 通过 `@rstest/core/api` 的 `runRstest()` 在当前 Node.js 进程内启动测试，不调用
Rstest CLI。实现包含一个随 Midscene 发布的固定实体测试模块，不生成测试模块，也
不注册 virtual module。

---

## 1. 背景

RFC 0001 定义了节点输入、节点执行和 step result，但没有定义 workflow 文件和
workflow 本身。测试文件需要容纳多个测试用例，每个测试用例对应一个 workflow。

核心引擎需要补充以下能力：

- 一个 YAML 文件声明多个 workflow；
- 每个 workflow 具有名称和稳定的测试身份；
- 一个 workflow 内的 step 按声明顺序执行；
- 每个 workflow 生成独立结果；
- runner 可以串行或并行执行多个 workflow；
- retry 的每次 attempt 都重新执行完整 workflow。

现有 CLI 已经使用 Rstest JavaScript SDK，但会为 YAML 用例生成 virtual test
module。多 workflow 文件会进一步放大测试模块生成逻辑的复杂度。本 RFC 改用一个
固定 bridge module。bridge 在 Rstest 收集阶段读取 YAML，并把每个 workflow 注册
为一个 Rstest test。

---

## 2. 设计目标

1. **一个文件可以声明多个 workflow**：每个 workflow 对应一个测试用例。
2. **workflow 是独立执行单元**：每次执行具有独立的 `runId` 和结果。
3. **workflow 名称用于展示**：名称可以重复，测试身份由 `testId` 表示。
4. **step 严格顺序执行**：后一个 step 只能在前一个 step 完成后开始。
5. **复用 Rstest 调度能力**：串并行、retry、bail 和结果汇总交给 Rstest。
6. **只使用 Rstest JavaScript SDK**：CLI 不启动 Rstest 子进程。
7. **不生成测试模块**：实现不使用 `VirtualModulesPlugin`，也不写临时
   `.test.ts` 或 `.test.mjs` 文件。
8. **结果可以回溯到 YAML**：结果使用 `testId`、`sourcePath` 和
   `workflowIndex`，不依赖 Rstest test file path。

---

## 3. 不在首期范围内的能力

本 RFC 不定义以下能力：

- workflow 资源创建和释放；
- workflow 级共享 state；
- workflow 错误 hook；
- workflow 级 timeout；
- workflow 之间的数据依赖；
- 单个 workflow 内的分支、循环、DAG 和 step 并行；
- 可复用或嵌套 workflow；
- Rstest Browser Mode；
- 报告 UI。

这些能力需要独立 RFC。首期 `runWorkflow()` 只负责顺序执行 step 并生成结果。

---

## 4. 分层和职责

执行链分为 4 层。

```text
Midscene CLI
  ├─ 发现 YAML 文件
  ├─ 写入本次运行的 manifest
  └─ 调用 @rstest/core/api.runRstest()
        │
        ▼
固定 Rstest bridge test module
  ├─ 读取 manifest 和 YAML
  ├─ collection / normalize
  └─ 每个 workflow 注册为一个 Rstest test
        │
        ▼
Workflow engine
  ├─ 按顺序执行 steps
  └─ 返回 WorkflowRunResult
        │
        ▼
Node definitions
  └─ 执行单个 step
```

各层职责如下：

- CLI 负责文件发现、用户配置、运行参数和最终退出码。
- Rstest adapter 负责测试注册、串并行、retry、bail 和 runner result。
- Workflow engine 负责单个 workflow 内的 step 顺序和结果。
- Node definition 负责单个 step 的业务逻辑。

---

## 5. Workflow YAML

### 5.1 顶层结构

一个文件通过 `workflows` 声明多个测试用例：

```yaml
workflows:
  - name: Create paid order
    steps:
      - http.request:
          prompt: Create a paid order through the internal test API.
          method: POST
          url: "{{ env.API_BASE_URL }}/internal/test/orders"

      - agent.verify:
          prompt: The order detail page shows payment success.
          $:
            timeout: 60000

  - name: Cancel paid order
    steps:
      - http.request:
          prompt: Cancel an existing paid order.
          method: POST
          url: "{{ env.API_BASE_URL }}/internal/test/orders/cancel"

      - agent.verify: The order detail page shows cancellation success.
```

字段含义如下：

- `workflows` 是必填的 workflow definition 列表。
- `name` 是必填的人类可读测试名称。
- `steps` 是必填的有序 step 列表。
- step 结构、字符串简写和 `$` meta 沿用 RFC 0001。

`name` 只要求非空，可以在同一文件和不同文件中重复。名称用于报告展示和名称
过滤，不承担唯一标识职责。名称过滤命中多个 workflow 时，runner 执行全部匹配项。

一个 workflow 对应 Rstest 中的一个 test。一个 YAML 文件不是一个 test。

### 5.2 校验规则

collector 在注册 Rstest test 前完成结构校验和 step normalize。

- 顶层值必须是 mapping。
- `workflows` 必须是非空 sequence。
- 每个 workflow `name` 必须是非空字符串。
- 每个 workflow `steps` 必须是非空 sequence。
- 每个 step 必须符合 RFC 0001 的 step 契约。
- collector 必须解析 workflow 中的全部节点名称。
- 找不到节点时，collector 报告定义错误。
- 首期拒绝未知的顶层字段。
- 首期拒绝 workflow definition 中除 `name` 和 `steps` 以外的字段。

一个 YAML 文件的任一 workflow 无法完成校验时，整个文件 collection 失败。其他
YAML 文件仍可以继续 collection 和执行。

bridge 为 collection 失败的文件注册一个失败 test。这个 test 的名称使用项目相对
路径，metadata 标记 `kind: 'collection-error'`。这样，单个文件的定义错误不会让
其他文件显示为“未执行”。

### 5.3 声明顺序

`workflows` 数组顺序是声明顺序，不表示数据依赖。

- 串行模式按文件发现顺序和 `workflowIndex` 执行。
- 并行模式允许 workflow 按任意顺序完成。
- Midscene 聚合结果时，按照 `sourcePath + workflowIndex` 恢复声明顺序。
- workflow 之间不共享 step result。

未来需要依赖关系时，应增加显式 workflow id 和 `needs` 等字段。依赖关系不能引用
人类可读的 `name`。

---

## 6. Collection 模型

### 6.1 核心类型

```ts
export type WorkflowStepInput = Record<string, unknown>;

export interface WorkflowDocumentDefinition {
  workflows: readonly WorkflowDefinition[];
}

export interface WorkflowDefinition<TStep = WorkflowStepInput> {
  name: string;
  steps: readonly TStep[];
}

export type NormalizedWorkflowDefinition = WorkflowDefinition<NormalizedStep>;

export interface WorkflowDocumentSource {
  projectId: string;
  /** 相对于 project root 的规范化路径。 */
  sourcePath: string;
  /** 用于读取文件的绝对路径，不写入公开报告。 */
  absolutePath: string;
}

export interface CollectedWorkflow {
  /** 同一次 collection 中的唯一测试身份。 */
  testId: string;
  projectId: string;
  sourcePath: string;
  workflowIndex: number;
  definition: NormalizedWorkflowDefinition;
}

export interface CollectedWorkflowDocument {
  projectId: string;
  sourcePath: string;
  workflows: readonly CollectedWorkflow[];
}
```

`CollectedWorkflowDocument` 是完成解析、校验和 normalize 后的文件。它只是
collection 容器，不表示文件级运行。

`CollectedWorkflow` 是 runner 可以注册和执行的最小测试定义。

### 6.2 testId

collector 使用 project、文件路径和 workflow 在文件中的位置生成 `testId`：

```text
testId = hash(serialize([projectId, sourcePath, workflowIndex]))
```

规则如下：

- `testId` 在同一次 collection 中必须唯一。
- 修改 `name` 不改变 `testId`。
- 移动文件或调整 workflow 顺序会改变 `testId`。
- retry 的所有 attempt 使用同一个 `testId`。
- collector 发现 hash 冲突时必须抛出错误。

未来如果需要跨文件移动和重排保持身份，可以在 YAML 中增加显式 `id`。首期不增加
这个字段。

### 6.3 Collection API

```ts
export interface CollectWorkflowDocumentOptions {
  resolveNode(name: string): NodeDefinition | undefined;
}

export function collectWorkflowDocument(
  source: WorkflowDocumentSource,
  options: CollectWorkflowDocumentOptions,
): CollectedWorkflowDocument;
```

`collectWorkflowDocument()` 同步完成文件读取、YAML 解析、结构校验、step normalize
和节点解析。

同步 collection 是 Rstest 注册测试的必要条件。bridge 必须在模块求值期间调用
`test()`，不能等到 `beforeAll()` 或 test callback 中再注册 test。

collector 遇到错误时直接 throw，不返回空列表或部分 document。

---

## 7. Workflow 执行

### 7.1 WorkflowExecutionContext

```ts
export interface WorkflowExecutionContext {
  /** 当前测试定义的唯一标识；retry 时保持不变。 */
  readonly testId: string;

  /** 当前 attempt 的唯一标识。 */
  readonly runId: string;

  /** Workflow definition 中的人类可读名称；允许重复。 */
  readonly name: string;

  /** Workflow 所在文件的项目相对路径。 */
  readonly sourcePath: string;

  /** Workflow 在文件中的零基下标。 */
  readonly workflowIndex: number;

  /** 已完成的 step result，顺序与 steps 一致。 */
  readonly completedSteps: readonly StepRunResult[];
}
```

`completedSteps` 由 engine 维护，节点只能读取。当前 step 执行期间，数组不包含当前
step。engine 保存当前 `StepRunResult` 后，才开始下一个 step。

首期不提供 workflow state。需要读取历史结果的节点可以使用 `completedSteps`。
具名 output 和模板寻址由后续 RFC 定义。

### 7.2 NodeExecutionContext 扩展

RFC 0001 的 `NodeExecutionContext` 增加 `workflow` 字段：

```ts
export interface NodeWorkflowContext extends WorkflowExecutionContext {
  /** 当前 step 在 steps 中的零基下标。 */
  readonly stepIndex: number;
}

export interface NodeExecutionContext<TInput = unknown> {
  input: TInput & CommonNodeInput;
  $: Readonly<NormalizedStepMeta>;
  signal: AbortSignal;
  workflow: NodeWorkflowContext;
}
```

`NodeExecutionContext.signal` 的语义沿用 RFC 0001。首期只要求它响应当前 step
timeout。

### 7.3 WorkflowRunResult

```ts
export type WorkflowRunStatus = 'success' | 'failed';

export interface WorkflowRunResult {
  testId: string;
  runId: string;
  name: string;
  sourcePath: string;
  workflowIndex: number;
  status: WorkflowRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  steps: StepRunResult[];
}
```

最终状态遵循以下规则：

- 所有 step 成功时，状态为 `success`。
- 任一 step 失败时，状态为 `failed`。
- `continue-on-error` 只控制是否继续执行后续 step。
- `continue-on-error` 不会把最终状态改成 `success`。
- `steps` 只包含已经完成的 step，不为未开始的 step 生成占位结果。

### 7.4 顺序执行规则

engine 按以下顺序执行一个 workflow：

```text
create WorkflowExecutionContext
for each step in declaration order:
  execute node
  record StepRunResult
  decide continue or stop
finalize WorkflowRunResult
```

具体规则如下：

1. collector 在执行前完成全部 step normalize 和节点解析。
2. engine 一次只执行一个 step。
3. 当前 step 完成并写入结果后，engine 才能开始下一个 step。
4. 当前 step 失败且 `continue-on-error` 为 `false` 时，workflow 立即停止。
5. 当前 step 失败且 `continue-on-error` 为 `true` 时，workflow 继续执行。
6. workflow 最终结果保留全部已完成 step result。

单个 workflow 内不调用 `Promise.all()`，也不把 step 提交给 Rstest。Rstest 只能
调度 workflow，不能调度 workflow 内部的 step。

---

## 8. Engine API

```ts
export interface RunWorkflowOptions {
  resolveNode(name: string): NodeDefinition;
  onResult?(result: WorkflowRunResult): Promise<void> | void;
}

export function runWorkflow(
  workflow: CollectedWorkflow,
  options: RunWorkflowOptions,
): Promise<WorkflowRunResult>;
```

`runWorkflow()` 只执行一个 `CollectedWorkflow`。它不发现文件，也不决定其他
workflow 的串并行顺序。

伪实现如下：

```ts
async function runWorkflow(
  workflow: CollectedWorkflow,
  options: RunWorkflowOptions,
): Promise<WorkflowRunResult> {
  const nodes = workflow.definition.steps.map((step) =>
    options.resolveNode(step.node),
  );
  const run = createWorkflowRun(workflow);

  for (const [stepIndex, step] of workflow.definition.steps.entries()) {
    const result = await runStep({
      run,
      step,
      stepIndex,
      node: nodes[stepIndex],
    });

    run.completedSteps.push(result);

    if (result.status === 'failed' && !result.continuedAfterError) {
      break;
    }
  }

  const result = finalizeWorkflowRun(run);
  await options.onResult?.(result);
  return result;
}
```

`runWorkflow()` 捕获 node error，并按照 RFC 0001 生成失败的 `StepRunResult`。它不会
因为普通 step 失败而丢失已经完成的结果。

本 RFC 不提供负责调度整个 document 的 `runWorkflowDocument()`。document 是
collection 容器，Rstest 是多个 workflow 的执行器。

---

## 9. Rstest JavaScript SDK 适配

### 9.1 Programmatic API

CLI 通过以下入口运行 Rstest：

```ts
import { runRstest } from '@rstest/core/api';

const result = await runRstest({
  cwd: projectRoot,
  files: [bridgeTestModulePath],
  inlineConfig,
});
```

实现不得执行 `rstest`、`npx rstest` 或其他子进程命令。

`@rstest/core/api` 当前是 experimental API。首期必须锁定精确 patch 版本，不使用
范围版本。升级 Rstest 时，需要重新验证 bridge、metadata、retry 和结构化结果。

### 9.2 固定 bridge module

Midscene 发布一个固定实体模块，例如：

```text
@midscene/cli/dist/framework/workflow-rstest-bridge.test.mjs
```

该文件是包的一部分。每次运行复用同一个文件，不为 YAML 文件或 workflow 生成新的
测试模块。

bridge 的职责如下：

1. 读取本次运行的 manifest。
2. 加载项目 workflow 配置和 node registry。
3. 同步 collection 所有 YAML 文件。
4. 为每个文件建立一个 `describe(sourcePath)`。
5. 为每个 `CollectedWorkflow` 注册一个 Rstest test。
6. 为 collection 失败的文件注册一个失败 test。
7. 在 test callback 中调用 `runWorkflow()`。

示意代码如下：

```ts
import { describe, test } from '@rstest/core';
import {
  collectWorkflowDocument,
  loadWorkflowRunManifest,
  runWorkflow,
} from '@midscene/test';

const manifest = loadWorkflowRunManifest(
  process.env.MIDSCENE_WORKFLOW_MANIFEST!,
);
const project = loadWorkflowProjectSync(manifest.configPath);

for (const source of manifest.sources) {
  describe(source.sourcePath, () => {
    let document: CollectedWorkflowDocument;

    try {
      document = collectWorkflowDocument(source, {
        resolveNode: project.resolveNode,
      });
    } catch (error) {
      test(source.sourcePath, {
        meta: {
          kind: 'collection-error',
          sourcePath: source.sourcePath,
        },
      }, () => {
        throw error;
      });
      return;
    }

    for (const workflow of document.workflows) {
      defineRstestWorkflow(workflow, manifest, project);
    }
  });
}
```

### 9.3 Run manifest

CLI 把本次运行的可序列化参数写入 JSON manifest：

```ts
export interface WorkflowRunManifest {
  version: 1;
  projectId: string;
  projectRoot: string;
  configPath?: string;
  sources: readonly WorkflowDocumentSource[];
  mode: 'serial' | 'parallel';
  maxConcurrency?: number;
  retry?: number;
  bail?: number;
  resultDir: string;
}
```

CLI 只通过环境变量传递 manifest 的绝对路径：

```ts
inlineConfig.env = {
  MIDSCENE_WORKFLOW_MANIFEST: manifestPath,
};
```

manifest 是运行数据，不是可执行测试模块。使用 manifest 可以避免环境变量长度限制，
也避免把 node definition 等函数跨 worker 序列化。

bridge 在 Rstest worker 中加载项目配置。node registry 因此在执行 workflow 的进程
内创建。

bridge 必须使用 `node:fs` 和 manifest 中的绝对路径读取 YAML。实现不得通过
`new URL('./case.yaml', import.meta.url)` 读取用例，因为 Rspack 可能把这个表达式
转换为构建产物中的静态资源路径。

### 9.4 Test 注册

bridge 根据运行模式选择 Rstest test API：

```ts
function defineRstestWorkflow(
  workflow: CollectedWorkflow,
  manifest: WorkflowRunManifest,
  project: WorkflowProject,
) {
  const defineTest =
    manifest.mode === 'parallel' ? test.concurrent : test.sequential;

  defineTest(
    workflow.definition.name,
    {
      retry: manifest.retry,
      meta: {
        kind: 'workflow',
        testId: workflow.testId,
        sourcePath: workflow.sourcePath,
        workflowIndex: workflow.workflowIndex,
      },
    },
    async () => {
      const result = await runWorkflow(workflow, {
        resolveNode: project.resolveNode,
        onResult: project.resultStore.write,
      });

      if (result.status === 'failed') {
        throw new WorkflowExecutionError(result);
      }
    },
  );
}
```

`name` 可以重复。报告和结果映射必须读取 metadata 中的 `testId`，不能使用名称作为
Map key。

首期实现以支持 test metadata 和 test options 的 Rstest 精确版本为基线。

### 9.5 Rstest 配置

首期 adapter 使用以下配置：

```ts
const inlineConfig: RstestUserConfig = {
  root: manifest.projectRoot,
  testEnvironment: 'node',
  reporters: [],
  testTimeout: 0,
  retry: manifest.retry,
  bail: manifest.bail,
  maxConcurrency: manifest.maxConcurrency,
  pool: {
    maxWorkers: 1,
    minWorkers: 1,
  },
};
```

固定 bridge 是一个 Rstest test file。首期将 worker 数固定为 1，并通过
`test.concurrent` 在文件内部并发 workflow。

`maxConcurrency` 只限制带有 `concurrent` 标记的 test。串行模式不使用该并发额度。

### 9.6 Runner result 映射

Rstest test callback 必须在 workflow 失败时 throw。否则 Rstest 会把失败的
workflow 标记为 passed。

Midscene 保存完整的 `WorkflowRunResult`。Rstest 的结构化结果负责提供：

- test 最终状态；
- retry errors 和 retry count；
- runner 级未处理错误；
- bail 后未执行的 test；
- 总体退出状态。

Midscene result store 负责提供：

- 每个 attempt 的 `runId`；
- step results；
- 原始 YAML 位置；
- Midscene report 路径。

最终聚合使用 `testId` 合并两类结果。聚合器不能只读取
`TestRunResult.unhandledErrors`，还必须处理 file errors 和 test errors。

---

## 10. Retry 和执行顺序

### 10.1 Retry

Rstest retry 会再次调用 workflow test callback。每个 attempt 必须：

- 使用相同的 `testId`；
- 创建新的 `runId`；
- 从第一个 step 开始重新执行 workflow；
- 不复用上一次 attempt 的 `completedSteps`。

Midscene 报告可以记录每个 attempt 的 `WorkflowRunResult`。最终 Rstest test result
以最后一次 attempt 的状态为准。

### 10.2 Workflow 间调度

首期支持两种 runner 模式：

- `serial`：所有 workflow 使用 `test.sequential`。
- `parallel`：所有 workflow 使用 `test.concurrent`。

默认模式是 `serial`。用户必须显式启用 `parallel`。

`maxConcurrency` 限制同时执行的 workflow 数量。它不改变单个 workflow 内的 step
顺序。

### 10.3 分片限制

Rstest 的 shard 以 test file 为主要边界。固定 bridge 只有一个 test file，因此
不能直接依靠 Rstest file shard 把 workflow 分配到多个进程。

需要跨进程分片时，Midscene 先按 `testId` 切分 manifest，再让每个进程分别调用
`runRstest()`。每个进程仍然复用同一个固定 bridge。

---

## 11. Timeout 和 Watch

### 11.1 Timeout

RFC 0001 的 step timeout 继续由 workflow engine 实现。它只影响当前 step，并通过
`NodeExecutionContext.signal` 通知节点。

首期不定义 workflow timeout。Rstest `testTimeout` 默认设为 `0`。如果后续需要
workflow timeout，应由独立 RFC 定义执行停止和未完成 step 的结果语义。

### 11.2 Watch

`runRstest()` 是一次性执行接口。首期 CLI 自己监听 YAML 和配置文件，然后重新调用
`runRstest()`。

YAML 通过 `node:fs` 读取，不一定进入 Rspack module graph。因此，Rstest 的 changed
和 related-test 分析不能精确关联 YAML。Midscene watch 使用自己的文件发现结果。

---

## 12. 与现有实现的迁移关系

现有 CLI 为 YAML 文件生成 virtual test module，并通过 Rspack
`VirtualModulesPlugin` 注入 Rstest。新实现完成后，以下概念退出 workflow runner：

- 每个 YAML 文件生成一个 virtual module；
- `virtual:midscene-yaml/*.test.ts` module id；
- 通过生成源码传递 YAML 文件路径和 case options；
- 根据 virtual module id 反查 YAML case；
- 一个 YAML 文件固定对应一个 Rstest test。

迁移后的稳定入口包括：

- 一个随包发布的 bridge test module；
- 一个每次运行生成的 JSON manifest；
- 一个 YAML 文件中的多个 `CollectedWorkflow`；
- 每个 workflow 对应一个 Rstest test；
- 通过 Rstest metadata 和 `testId` 映射结果。

现有 YAML 报告写入逻辑可以复用，但结果粒度需要从文件调整为 workflow。

---

## 13. 实现顺序

### 13.1 Workflow engine

先完成不依赖 Rstest 的部分：

1. `workflows[].name + workflows[].steps` schema。
2. collection、normalize 和 `testId`。
3. `WorkflowExecutionContext` 和 `NodeExecutionContext.workflow`。
4. step 严格顺序执行。
5. `runWorkflow()` 和 `WorkflowRunResult`。
6. step 成功、失败和 `continue-on-error` 的单元测试。

### 13.2 Rstest adapter

Workflow engine 稳定后，再实现 runner：

1. 锁定支持 Programmatic API 和 metadata 的 Rstest 精确版本。
2. 定义 manifest schema 和 loader。
3. 增加固定 bridge test module。
4. 通过 `runRstest()` 执行 bridge。
5. 映射 `testId`、retry 和 runner errors。
6. 删除 virtual module 生成和 `VirtualModulesPlugin` 接线。

### 13.3 调度能力

最后接入 runner 策略：

1. 默认串行执行。
2. 显式 `parallel` 和 `maxConcurrency`。
3. retry 和 bail。
4. Midscene 自己驱动的 watch。
5. manifest 级跨进程分片。

---

## 14. 首期结论

首期实现包含以下能力：

- 一个 YAML 文件声明多个 workflow；
- `workflows[].name + workflows[].steps`；
- workflow `name` 非空但允许重复；
- `testId` 表示测试定义，`runId` 表示单次 attempt；
- 一个 workflow 内的 step 严格按声明顺序执行；
- 一个 workflow 对应一个 Rstest test；
- CLI 使用 `@rstest/core/api.runRstest()`；
- 一个固定实体 bridge module；
- 一个只包含运行数据的 JSON manifest；
- 不使用 Rstest CLI、virtual module 或生成的 test module；
- 默认串行执行 workflow，显式启用 workflow 并行；
- Rstest 管理 retry、bail、workflow 并发和 runner result；
- engine 管理 step 顺序、step timeout 和 workflow result；
- metadata 和 `testId` 负责从 Rstest result 回溯到 YAML workflow。

核心设计边界是：Rstest 调度 workflow，Workflow engine 顺序执行 step。

---

## 15. 参考资料

- [Rstest Programmatic API source](https://github.com/web-infra-dev/rstest/blob/main/packages/core/src/api/index.ts)
- [Rstest Test API](https://rstest.rs/api/runtime-api/test-api/test)
- [Rstest Reporter API](https://rstest.rs/api/javascript-api/reporter)
- [Rstest maxConcurrency](https://rstest.rs/config/test/max-concurrency)
- [Rstest retry](https://rstest.rs/config/test/retry)
