# RFC 0005 · Main-Process Workflow Runner

状态：**已实现**

范围：移除 workflow CLI 对 Rstest 的依赖，让 collection、调度、lifecycle、node 执行和
结果汇总全部运行在 CLI 主进程中。

本 RFC 建立在 RFC 0001～0004 之上：

- RFC 0001 定义 node input、output、timeout 和错误处理；
- RFC 0002 定义多 workflow 文件、collection 和执行结果；
- RFC 0003 定义 project config、context 和 teardown；
- RFC 0004 定义 document lifecycle 和 YAML lifecycle hooks。

本 RFC 替代 RFC 0002 中的 Rstest adapter，也替代 RFC 0004 中通过 Rstest
`beforeAll`、test callback 和 `afterAll` 接入 lifecycle 的实现方式。YAML schema、node API
和 lifecycle 语义不变。

---

## 1. 结论

workflow 不再被包装成 Rstest test。CLI 主进程直接完成整个执行过程：

```text
CLI main process
  load project config once
  create node registries once
  discover and collect workflow documents
  schedule workflow cases
    setupDocument -> beforeAll
    beforeEach -> steps -> afterEach
    afterAll -> document teardown
  aggregate and persist project result
  set process exit code
```

这里的“主进程执行”不是把 Rstest 配成 in-process mode，而是从 workflow runtime 链路中
完整删除 Rstest。首期 workflow runner 只提供确定性的串行执行。

所有 project config、node definition、`setupDocument()`、node handler 和 teardown 都在同一
个 Node.js 进程中运行。它们可以直接共享 context 中的数据库 client、UI Agent、page 和
其他不可序列化对象。

---

## 2. 为什么移除 Rstest

当前实现只向 Rstest 注册一个固定的 bridge test file。bridge 再读取 manifest，把所有
YAML workflow 动态注册成 tests。与此同时，runner 把 worker 数量固定为 1、关闭 Rstest
reporter，并禁用 Rstest test timeout。

因此，Rstest 的 test-file 分片和 worker pool 没有带来实际收益，却引入了以下成本：

1. project config 在 runner 和 worker 中分别求值；
2. node definitions 和 registries 在子进程中重复创建；
3. runner 与 worker 之间需要通过 manifest 和环境变量传递可序列化数据；
4. `setupDocument()` 创建的资源不能被主进程直接引用；
5. workflow result 需要再次映射成 Rstest test result；
6. lifecycle 的真实语义分散在 engine、bridge 和 Rstest hooks 中；
7. Rstest 的默认值或调度行为可能间接改变 workflow 的公开行为。

workflow runner 执行的是声明式 YAML，而不是需要编译、隔离和 mock 的 JavaScript test
module。现有 engine 已经拥有 collection、node 执行、lifecycle 和结果落盘能力。保留一层
通用测试框架不会降低这些能力的实现复杂度。

---

## 3. 设计目标

1. **单次加载**：每次 CLI run 只加载一次 project config。
2. **同一进程**：node、context 和 lifecycle 直接共享内存引用。
3. **串行确定**：document 和 workflow 使用稳定顺序执行。
4. **清理可靠**：已启动的 document 在正常失败后仍执行 `afterAll` 和 teardown。
5. **结果独立**：公开结果不再包含 Rstest 类型、test id 或映射文件。
6. **顺序稳定**：串行执行和 collection 顺序可以被测试和复现。
7. **职责集中**：调度策略由 workflow runner 定义，不再受第三方 test runner 默认值影响。

---

## 4. 首期不做的能力

本 RFC 不包含以下能力：

- 不增加 watch mode；
- 不增加 shard；
- 不增加 process、thread 或 VM 隔离；
- 不支持 parallel 和 `maxConcurrency`；
- 不支持 retry；
- 不支持 bail；
- 不增加 workflow timeout；
- 不增加代码型 lifecycle hook；
- 不支持 TypeScript 或 ESM project config；
- 不增加 project config 中的 `runner` 或 `testRunner` 字段；
- 不修改文件发现规则；文件发现由 RFC 0006 讨论；
- 不修改 YAML schema 和 node timeout；
- 不保证 `SIGKILL`、进程崩溃或宿主机退出时执行 teardown。

---

## 5. Project 加载与 Runtime 边界

### 5.1 单次加载

runner 按以下顺序初始化 project：

```text
resolve cwd, projectRoot and configPath
load and validate project config once
create NodeRegistry and DocumentNodeRegistry once
discover workflow sources
collect all workflow documents
validate test identity and node references
start scheduling
```

首期继续使用现有 CommonJS loader。config 和它导入的模块遵循 Node.js module cache 语义，
不会因为 collection 或执行阶段切换而重新求值。

project config 顶层仍应保持声明式。虽然删除 worker 后不会再发生双重求值，但在 module
顶层创建外部资源仍然没有可靠的 teardown 边界。数据库连接、server、设备会话和 UI
Agent 应继续在 `setupDocument()` 中创建，并通过 `onTeardown()` 释放。

### 5.2 Registry

runner 使用本次加载得到的 definitions 创建唯一一组 registry：

```text
project.nodes          -> NodeRegistry
project.documentNodes  -> DocumentNodeRegistry
```

collection 和执行共用这组 registry。runner 不序列化 handler，也不重新注册 node。

node definition 的创建仍然不能依赖执行顺序。`defineNode()` 和
`defineDocumentNode()` 应只完成声明与校验，外部资源初始化应留给 lifecycle。

### 5.3 Context 和资源引用

`setupDocument()`、YAML hooks 和普通 node handler 都在 CLI 主进程中运行：

```js
module.exports = defineWorkflowProject({
  nodes,

  async setupDocument({ env, onTeardown }) {
    const database = await connectDatabase(env.DATABASE_URL);
    onTeardown(() => database.close());

    return { database };
  },
});
```

`database` 不经过 JSON、IPC 或 proxy。node 通过 `ctx.context.database` 取得同一个对象。

这也意味着不同 document 和 workflow 默认共享主进程的 module cache、`process.env` 和
global object。需要隔离这些状态的项目不能依赖本 RFC；将来如有需求，应单独设计明确的
isolation mode。

---

## 6. Collection

runner 在调用任何 `setupDocument()` 前完成整次 run 的文件发现和 collection。这样可以：

- 在创建外部资源前报告 YAML 和 schema 错误；
- 提前检查重复的 `testId`；
- 得到稳定的 document 和 workflow 顺序；
- 让调度器只处理已经通过 collection 的 workflow case。

每个 source 独立 collection。单个 source 的 YAML、schema 或 node resolution 错误记录为
collection error，不改变其他 source 的 `sourcePath` 和 workflow identity。

无效 source 不创建 document runtime。collection error 进入 project result，但不会阻止
其他有效 source 按顺序执行。

---

## 7. 串行调度模型

### 7.1 执行层级

调度器使用以下三个层级：

```text
project run
  document runtime
    workflow case
```

- project run 对应一次 CLI 调用；
- document runtime 对应一个 YAML 文件和一套 document context；
- workflow case 对应 YAML `workflows` 中的一项。

一个 workflow case 只执行一次。runner 不创建并发任务，也不重试失败的 workflow。

### 7.2 固定顺序

runner 按照以下顺序执行：

1. document 按规范化后的 `sourcePath` 排序；
2. 同一 document 内按 YAML `workflows` 数组顺序执行；
3. 一个 document 完整执行 `setupDocument`、`beforeAll`、全部 workflow、`afterAll` 和
   teardown；
4. 当前 document 完成后，runner 再启动下一个 document。

任意时刻最多只有一个 document runtime 和一个 workflow case 正在运行。document context
不需要处理框架引入的并发访问。

### 7.3 Workflow 失败

每个 workflow 执行一次：

```text
beforeEach -> steps -> afterEach
```

当前 workflow 失败后，runner 记录失败结果，然后继续执行同一 document 中的下一个
workflow。一个 workflow 的失败不会跳过后续 workflow 或后续 document。

### 7.4 Document 启动失败

`setupDocument()` 或 YAML `beforeAll` 失败时，当前 document 的 workflow 全部标记为
`not-run`，原因是 `document-start-failed`。runner 完成当前 document 的清理后，继续执行
下一个有效 document。

清理规则沿用 RFC 0004：

- `setupDocument()` 失败时，跳过 `beforeAll`、workflow 和 `afterAll`，但已经注册的 teardown
  必须执行；
- `beforeAll` 失败时，跳过 workflow，但仍执行 `afterAll` 和 teardown；
- teardown failure 与原始 start failure 一起进入 document result，不覆盖原始错误。

### 7.5 不支持的调度选项

首期 CLI 和 programmatic API 都不提供以下选项：

- `parallel`；
- `maxConcurrency`；
- `retry`；
- `bail`。

CLI 收到对应参数时应报告未知参数，不能静默忽略。programmatic API 不声明对应字段。
后续如果需要其中一项能力，应通过独立 RFC 定义语义和结果模型。

---

## 8. Result Model

### 8.1 Project Result

Rstest result 不再是公开结果的一部分。runner 返回 workflow 原生结果：

```ts
export type WorkflowCaseStatus = 'success' | 'failed' | 'not-run';

export interface WorkflowCaseRunResult {
  testId: string;
  name: string;
  sourcePath: string;
  workflowIndex: number;
  status: WorkflowCaseStatus;
  run?: WorkflowRunResult;
  notRunReason?: 'document-start-failed' | 'interrupted';
}

export interface WorkflowProjectRunSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  collectionErrors: number;
  documentFailures: number;
}

export interface WorkflowProjectRunResult {
  status: 'success' | 'failed';
  exitCode: 0 | 1;
  resultDir: string;
  summary: WorkflowProjectRunSummary;
  workflows: readonly WorkflowCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly WorkflowCollectionError[];
}
```

具体错误继续使用现有可序列化 error 类型。`WorkflowRunResult` 仍表示一次 workflow 执行，
`WorkflowDocumentRunResult` 仍表示一次 document lifecycle。

project 在以下任一条件成立时失败：

- 存在 collection error；
- 存在失败的 workflow case；
- document start、finish 或 teardown 失败；
- runner 自身发生调度或结果写入错误。

`not-run` 本身不重复增加失败数。它由 document start failure 或运行中断产生。summary
仍单独展示它，避免把未执行用例误报成 passed。

### 8.2 Result Store

保留现有的 workflow 原生结果目录：

```text
<resultDir>/
  project.json
  runs/<testId>/<runId>.json
  documents/<documentId>/<documentRunId>.json
  collection-errors/<sourceId>.json
```

`project.json` 保存本次 run 的输入、选项、summary 和各结果文件引用。RFC 0006 可以在
这个文件中增加规范化后的文件发现配置和最终 sources。

删除以下 Rstest 专用数据：

- `rstest-tests/` 映射目录；
- Rstest test id；
- Rstest suite hierarchy；
- Rstest structured result；
- 只用于 bridge IPC 的 run manifest。

CLI 输出使用 workflow 术语，例如：

```text
8/10 workflows passed, 1 failed, 1 not run
Results: <resultDir>
```

---

## 9. 中断与清理

runner 为 `SIGINT` 和 `SIGTERM` 安装本次 run 范围内的 handler。收到信号后：

1. 停止调度新的 workflow case；
2. 等待已开始的 workflow 进入可清理状态；
3. 对所有已启动的 document 执行一次 finish；
4. 把尚未执行的 workflow 标记为 `not-run`，原因是 `interrupted`；
5. 写入能够得到的结果；
6. 返回非零退出码。

如果 node handler 永久不返回，主进程无法仅靠 JavaScript 强制中断它并同时保证 teardown。
首期不承诺解决这个问题。workflow timeout 和 `AbortSignal` 应由后续 RFC 单独设计。

runner 必须在 run 结束后移除自己安装的 signal handler，避免 programmatic API 多次调用时
重复注册。

---

## 10. 删除与迁移范围

实现本 RFC 时需要删除以下 Rstest adapter：

1. 从 `@midscene/test` runtime dependencies 删除 `@rstest/core`；
2. 删除固定的 `workflow-rstest-bridge.test.ts`；
3. 删除 `runRstest()` 调用和 Rstest inline config；
4. 删除 Rstest reporter、pool 和 structured result 类型；
5. 删除 `MIDSCENE_WORKFLOW_MANIFEST` 等 bridge IPC 环境变量；
6. 删除只用于启动 bridge 的 manifest writer/reader；
7. 删除 Rstest test mapping result；
8. 从 `WorkflowProjectRunResult` 删除 `rstest` 字段；
9. 从 CLI 和 programmatic API 删除 parallel、`maxConcurrency`、retry 和 bail 选项；
10. 删除对应的 Rstest 调度测试；
11. 更新 package lockfile 和 build 配置。

如果现有 manifest 还承载可观察的 project metadata，应把这些字段迁移到
`project.json`，不能继续保留一个会被误认为 IPC 输入的 manifest 抽象。

这是一次未发布框架的内部迁移。本 RFC 不提供旧 Rstest result 或 dump 的兼容 shim。

---

## 11. 备选方案

### 11.1 保留 Rstest，改用 Threads

不采用。threads 仍然存在独立执行上下文、config 重复加载和 bridge result 映射，也没有
解决单个固定 bridge file 无法利用 test-file 分片的问题。

### 11.2 在主进程创建资源，通过 RPC 给 Worker

不采用。数据库 client、UI Agent 和 page 等对象需要为每种方法设计 proxy。错误、取消、
stream 和 teardown 都会变成跨进程协议，复杂度远高于直接执行 workflow。

### 11.3 每个 Workflow 使用一个子进程

不采用。RFC 0004 明确定义同一 YAML document 共享 context 和 document lifecycle。跨进程
共享这些资源会再次引入 RPC，也会改变 `beforeAll` 和 `afterAll` 语义。

### 11.4 暂时保留 Rstest Result 作为兼容层

不采用。workflow 对外应该暴露自己的 document、case 和 run 模型。继续生成 Rstest
结构会让内部 adapter 变成事实上的公开 API，并妨碍后续演进。

---

## 12. 实现顺序

1. 定义 workflow 原生 project result 和 `project.json`。
2. 实现串行 runner，并接入现有 collection、document runtime 和 `runWorkflow()`。
3. 实现 document start failure 和 interrupted 对应的 `not-run` 状态。
4. 实现 signal handling 和 started-document cleanup。
5. 更新 CLI summary 和 exit code。
6. 删除 Rstest bridge、manifest IPC、mapping 和 package dependency。
7. 删除 CLI 和 programmatic API 中的非串行调度选项。
8. 更新 unit tests、CLI e2e fixtures 和 package build tests。

迁移过程中不能同时保留两条可选执行链路。所有测试通过主进程 runner 后，应直接删除
Rstest adapter，避免两套执行链路的行为继续分叉。

---

## 13. 测试要求

### 13.1 Unit Tests

- project config 顶层在一次 run 中只求值一次；
- node definition 和 registry 只创建一次；
- `setupDocument()`、node handler 和 teardown 与 runner 使用同一个 PID；
- collection 在任何 document start 前完成；
- runner 按 source 和 workflow index 稳定执行；
- 任意时刻最多执行一个 workflow；
- workflow 失败后继续执行后续 workflow 和 document；
- 每个 workflow 只执行一次；
- document start failure 会标记所属 workflow 为 `not-run`；
- setup 已注册的 teardown 在 setup 或 beforeAll 失败时仍执行；
- afterAll 和 teardown error 不覆盖更早的 workflow error；
- collection error 与有效 document 可以同时进入 project result；
- success、failure 和 not-run 的 summary 计数正确；
- CLI 和 programmatic API 不接受非串行调度选项；
- programmatic API 返回 workflow 原生结果，不包含 `rstest`；
- result store 不再写入 `rstest-tests/`；
- signal handler 在 run 完成后被移除。

### 13.2 E2E Tests

增加 model-free CLI fixture，从开发者视角验证：

- CommonJS config、custom node 和 `setupDocument()` 的完整写法不变；
- config 顶层、setup、node 和 teardown 只在一个 PID 中执行；
- 多个 document 和 workflow 的可观察顺序稳定；
- workflow 失败后，后续 workflow 仍然执行；
- `--parallel`、`--max-concurrency`、`--retry` 和 `--bail` 会被拒绝；
- lifecycle 事件顺序符合 RFC 0004；
- CLI 失败时返回非零 exit code；
- CLI summary 和 `project.json` 使用 workflow 术语；
- 结果目录不存在 Rstest mapping 和 bridge manifest；
- fixture 不依赖模型、浏览器或设备。

---

## 14. 验收标准

- `@midscene/test` runtime 不再依赖 `@rstest/core`；
- workflow 执行链路中不存在 Rstest bridge 和 worker；
- project config、node definitions 和 registries 每次 run 只初始化一次；
- `setupDocument()` 和 node handler 可以直接共享不可序列化 context；
- runner 只按稳定顺序串行执行 document 和 workflow；
- CLI 和 programmatic API 不提供 parallel、retry 或 bail；
- lifecycle、context 和 teardown 语义与 RFC 0004 一致；
- 已启动 document 在普通失败和可处理 signal 后得到清理；
- programmatic API 和结果目录不再暴露 Rstest 类型与映射；
- unit tests 和 model-free CLI e2e tests 覆盖调度与清理边界；
- RFC 0006 可以在此主进程架构上增加文件发现配置，不需要设计跨进程 manifest。

核心边界是：workflow runner 是 workflow 的执行引擎，不再把 YAML workflow 伪装成另一套
test runner 的 test case。
