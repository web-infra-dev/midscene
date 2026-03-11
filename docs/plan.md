# Skills 报告优化实施计划

## 方案对比

| 维度 | 方案 A：常驻进程复用 Agent | 方案 B：session 目录 + execution 分片持久化 | 方案 C：分片持久化 + 可选后台热复用 |
|------|---------------------------|-------------------------------------------|-----------------------------------|
| 思路 | `connect` 启动常驻进程，后续命令 RPC 到同一个 Agent | 每次 `npx` 独立执行；按 session id 读写磁盘状态与 execution 分片 | 先落盘保证正确性，再为部分平台增加可选热复用 |
| 优点 | 真复用连接、缓存、Agent 内存态 | 兼容当前 CLI 模型；失败恢复简单；报告/视频共享统一数据源 | 兼顾正确性和性能上限 |
| 缺点 | 需要守护进程、端口、清理、崩溃恢复 | 不复用内存对象；每次需重建连接/Agent | 复杂度最高 |
| 适用场景 | 强交互、长会话、可接受常驻后台 | 当前 Skills 的 `npx` 独立进程模型 | 后续增强阶段 |
| 改动范围 | `packages/shared` CLI、各端 CLI、连接编排、后台协议 | `packages/shared` CLI/MCP、core report、report viewer、各端工具接线 | 横跨 A+B |
| 风险 | 平台兼容性、后台进程治理 | 长 session 大文件、viewer 懒加载、分片一致性 | 两套机制叠加的维护成本 |

## 选择结论

用户已选择：**方案 B：session 目录 + execution 分片持久化**

选择理由：

- 当前各平台 CLI 入口都走 `runToolsCLI()`，命令结束后会执行 `await tools.destroy()`，天然是一次性进程模型。
- `BaseMidsceneTools` 的 `this.agent` 只对单进程调用有效，跨 `npx` 无法成立。
- 现有 `GroupedActionDump.executions` 已足以表达连续步骤，不需要先设计后台常驻体系。
- execution 分片能同时服务：
  - Skills 连续报告
  - 失败恢复
  - 未来的视频导出

## 方案说明

### 目标

在不改变“每个 `aiAct` 都是独立 `npx` 调用”这一前提下，实现：

1. `connect` 生成一个 session id
2. 后续命令通过 session id 将 execution 持续追加到同一个 session
3. session 结束或显式导出时，生成一个连续的 Skills 报告
4. 初版不做视频导出，只保证数据模型为后续导出预留

### 非目标

- 不实现常驻后台进程
- 不追求跨进程复用真实内存里的 `Agent`
- 不在初版重构所有平台设备连接协议
- 不在初版实现大 session 的完全分页式 viewer

## 现状约束

### 约束 1：CLI 生命周期是一枪一进程

已确认文件：

- `packages/shared/src/cli/cli-runner.ts`

当前逻辑结尾：

```ts
const result = await match.def.handler(parsedArgs);
outputResult(result);
await tools.destroy();
```

这意味着任何平台 CLI 在命令返回后都会销毁 agent。

### 约束 2：MCP tools 的 agent 复用仅在单进程内生效

已确认文件：

- `packages/shared/src/mcp/base-tools.ts`
- `packages/android/src/mcp-tools.ts`
- `packages/computer/src/mcp-tools.ts`
- `packages/web-integration/src/mcp-tools.ts`

这些实现通过 `this.agent` 做懒初始化和同进程复用，但没有跨进程序列化。

### 约束 3：报告 viewer 当前默认消费一个完整 grouped dump

已确认文件：

- `apps/report/src/App.tsx`
- `apps/report/src/components/store/index.tsx`

当前 viewer 支持：

- 一个 `GroupedActionDump`，内部多个 `executions`
- 或多个 `midscene_web_dump` script，按 Playwright case 切换

但不支持“按需从 session 目录加载 execution 分片”。

## 数据设计

### session 目录结构

建议放在 `midscene_run/sessions/<sessionId>/` 下：

```text
midscene_run/sessions/<sessionId>/
  session.json
  executions/
    000001.json
    000002.json
  screenshots/
    <screenshot-id>.png
  report/
    index.html
```

### `session.json`

职责：

- session 元信息
- 当前聚合状态索引
- 导出/报告所需元数据

建议字段：

```ts
interface PersistedSkillSession {
  sessionId: string;
  platform: 'web' | 'android' | 'ios' | 'computer' | 'harmony';
  createdAt: number;
  updatedAt: number;
  groupName: string;
  groupDescription?: string;
  reportMode: 'single-html' | 'html-and-external-assets';
  reportFilePath?: string;
  executionCount: number;
  status: 'active' | 'closed';
}
```

### execution 分片

每个分片保存一个 `ExecutionDump.toJSON()` 的结果，而不是整个 `GroupedActionDump`。

原因：

- 更接近当前真正增长的单位
- 便于追加
- 便于后续按 execution 做 viewer 懒加载

示意：

```ts
interface PersistedExecutionEntry {
  index: number;
  execution: IExecutionDump;
}
```

## 实施步骤

### 阶段一：新增 session 持久化基础设施

目标：先把“session 目录 + execution 分片”的基础能力建起来。

文件：

- `packages/core/src/session-store.ts` 新增
- `packages/core/src/index.ts` 或相关导出文件补导出
- `packages/core/tests/unit-test/session-store.test.ts` 新增

职责：

- 创建/读取/关闭 session
- 追加 execution 分片
- 根据 session 目录重建 `GroupedActionDump`
- 管理 screenshots 目录路径

建议 API：

```ts
export class SessionStore {
  static create(input: {
    sessionId?: string;
    platform: string;
    groupName: string;
    groupDescription?: string;
    reportMode: 'single-html' | 'html-and-external-assets';
  }): PersistedSkillSession;

  static load(sessionId: string): PersistedSkillSession;

  static appendExecution(
    sessionId: string,
    execution: IExecutionDump,
  ): { index: number; filePath: string };

  static buildGroupedDump(sessionId: string, input: {
    sdkVersion: string;
    modelBriefs: string[];
    deviceType?: string;
  }): GroupedActionDump;
}
```

关键决策：

- 不把 `GroupedActionDump` 全量常驻写进 `session.json`
- `session.json` 只做索引
- execution 作为 append-only 文件保存

### 阶段二：让 Agent 支持“输出 execution 分片”而不强耦合 session

目标：复用现有 Agent/task 更新链路，但不把 session 逻辑硬塞进 Agent 内核。

文件：

- `packages/core/src/agent/agent.ts`
- `packages/core/tests/unit-test/agent-session-persistence.test.ts` 新增

改动：

- 为 `AgentOpt` 增加可选钩子，例如：

```ts
type AgentOpt = {
  onExecutionDumpPersist?: (execution: ExecutionDump) => Promise<void> | void;
};
```

- 在 `appendExecutionDump(...)` 或 `onTaskUpdate` 更新路径里，当 runner 对应 execution 刷新时触发该钩子

约束：

- 这个钩子只发“当前 execution”，不直接读写 session 目录
- 这样 core 仍保持通用性

### 阶段三：在共享 CLI/MCP 层接入 session 参数

目标：让当前所有 `npx @midscene/*` 命令都能带 `sessionId` 工作。

文件：

- `packages/shared/src/cli/cli-runner.ts`
- `packages/shared/src/mcp/base-tools.ts`
- `packages/shared/src/mcp/tool-generator.ts`
- 对应单测文件新增或扩展

改动：

1. CLI 增加通用参数：

```txt
--session-id <id>
--session-group-name <name>
--close-session
--export-session-report
```

2. 运行工具命令时，将 `sessionId` 等上下文传给工具层

3. `BaseMidsceneTools` 增加统一的 session-aware agent 初始化入口，例如：

```ts
protected async ensureAgentWithSession(
  initParam?: string,
  session?: SessionExecutionOptions,
): Promise<TAgent>
```

### 阶段四：在 BaseMidsceneTools 实现 session 报告续写

目标：把平台无关的 session persistence 尽量集中到共享层。

文件：

- `packages/shared/src/mcp/base-tools.ts`
- 可能新增 `packages/shared/src/mcp/session-context.ts`
- `packages/shared/tests/unit-test/...` 新增

实现思路：

- 工具执行前：
  - 解析 `sessionId`
  - 若存在，创建一个 `SessionStore` 代理
- 创建 agent 时注入 `onExecutionDumpPersist`
  - 每次 execution 更新时，写入或覆盖当前 execution 分片
- 工具执行结束后：
  - 如果带了 `exportSessionReport`，从 session 目录重建 `GroupedActionDump`
  - 再统一生成 `report/index.html`

这里需要一个“execution 更新幂等规则”：

- 对同一个 runner 的多次刷新，应只覆盖同一个 execution 文件
- 不应在一个 task 流程内刷出多个重复 execution 分片

因此建议 session 层使用临时文件名 + finalize 改名，或者引入一个 `executionKey`。

### 阶段五：生成 session 报告

目标：从 execution 分片重建连续报告。

文件：

- `packages/core/src/report-generator.ts` 小改
- 或新增 `packages/core/src/session-report.ts`
- `packages/core/tests/unit-test/session-report.test.ts` 新增

推荐方式：

- 不修改 `ReportGenerator` 的增量写入语义
- 新增 `generateSessionReport(sessionId)`：
  1. 读取 `session.json`
  2. 按顺序读取 execution 分片
  3. 组装成 `GroupedActionDump`
  4. 调用现有 `reportHTMLContent()` 或 `ReportGenerator` 生成最终报告

这样更清晰，也避免把两种写入模式混进一个类。

### 阶段六：report viewer 为长 session 做最小兼容

目标：初版先能看，不先做完整分页架构。

文件：

- `apps/report/src/App.tsx`
- `apps/report/src/components/store/index.tsx`
- 相关测试或 test-data

改动范围控制：

- 初版仍输出一个完整 `GroupedActionDump` 给 viewer
- viewer 只做“显示 session 级标题/元信息”的轻量增强
- 不在第一版引入 execution 懒加载协议

原因：

- 当前用户目标先是“连续会话报告”
- 懒加载是第二阶段性能优化

## 代码片段

### 片段 1：SessionStore 追加 execution

```ts
appendExecution(sessionId: string, execution: IExecutionDump) {
  const session = this.load(sessionId);
  const index = session.executionCount + 1;
  const filePath = join(this.executionDir(sessionId), `${String(index).padStart(6, '0')}.json`);

  writeFileSync(filePath, JSON.stringify({ index, execution }), 'utf-8');

  this.saveSession({
    ...session,
    executionCount: index,
    updatedAt: Date.now(),
  });

  return { index, filePath };
}
```

### 片段 2：BaseMidsceneTools 注入 execution persist

```ts
const agent = await this.ensureAgent(initParam, {
  sessionId,
  onExecutionDumpPersist: (execution) => {
    sessionStore.upsertExecution(sessionId, executionKey, execution.toJSON());
  },
});
```

### 片段 3：session 报告重建

```ts
const executions = listExecutionFiles(sessionId)
  .sort()
  .map((file) => readExecution(file));

return new GroupedActionDump({
  sdkVersion,
  groupName: session.groupName,
  groupDescription: session.groupDescription,
  executions,
  modelBriefs,
  deviceType: session.platform,
});
```

## 文件路径

计划创建：

- `packages/core/src/session-store.ts`
- `packages/core/src/session-report.ts`
- `packages/core/tests/unit-test/session-store.test.ts`
- `packages/core/tests/unit-test/session-report.test.ts`
- `packages/core/tests/unit-test/agent-session-persistence.test.ts`

计划修改：

- `packages/core/src/agent/agent.ts`
- `packages/shared/src/cli/cli-runner.ts`
- `packages/shared/src/mcp/base-tools.ts`
- `packages/shared/src/mcp/tool-generator.ts`
- `apps/report/src/App.tsx`
- `apps/report/src/components/store/index.tsx`

可能按接入情况补改：

- `packages/android/src/mcp-tools.ts`
- `packages/ios/src/mcp-tools.ts`
- `packages/computer/src/mcp-tools.ts`
- `packages/web-integration/src/mcp-tools.ts`

## 考量

### 为什么不直接把 execution 拆成多个 HTML 再 merge

- HTML 是展示层产物，不是稳定数据层
- session 目录下存 execution json 才便于：
  - 报告重建
  - 视频导出
  - viewer 分页
  - 故障恢复

### 为什么 session 逻辑不直接写进 Agent

- `Agent` 是通用执行引擎
- session persistence 是 Skills/CLI/MCP 场景需求
- 写进 Agent 会把 core 抽象污染成“跨进程会话框架”

### 为什么初版不做 viewer 分页

- 问题主线是“连续会话报告”
- 分页会显著放大前后端协议设计
- 可以先把数据分片持久化做好，viewer 再演进

## 风险与遗漏

### 风险 1：同一个 execution 在运行过程中会多次更新

如果直接“每次 onTaskUpdate 都 append 新文件”，会产生重复 execution。

应对：

- session 层必须支持 upsert，而不是纯 append
- 需要为正在运行的 execution 分配稳定 key

### 风险 2：截图持久化路径可能与 session 目录不一致

当前 report 体系会把截图写进报告自己的目录或 HTML。

应对：

- session persistence 与最终 report 生成分离
- execution 分片阶段仅保存 execution JSON 与必要截图资源
- 最终报告导出时再统一整理 media 路径

### 风险 3：跨平台 connect 信息未必可完全重建

例如：

- bridge current tab
- iOS WDA session
- Android scrcpy 状态

应对：

- 方案 B 的承诺是“连续报告”，不是“无感连接复用”
- session 恢复失败时，应允许继续新建连接，但仍归档到原 session

### 风险 4：大 session viewer 仍可能卡顿

初版仍输出完整 grouped dump，所以长会话依然可能有前端压力。

应对：

- 第一版接受该限制
- 第二版在 session-report 层输出 execution 分页索引

### 风险 5：是否引入新依赖

当前计划不引入新依赖。

原因：

- 目录管理、JSON 分片、索引重建都可用 Node 原生 `fs/path`
- 没有足够理由引入数据库、队列或状态机库

### 我漏掉了什么

- 还没有把“操作视频导出”的数据契约写进计划，只是给 execution 分片预留了基础
- 还没有锁定 Skills 实际调用的是 MCP tool 入口还是 YAML/CLI 入口；若用户最终目标是外部 `midscene-skills` 仓库，接线文件会不同，但 core/shared 的方案仍可复用

## 待办

### 阶段一：基础持久化

- [x] 新增 `SessionStore` 与 session 元数据模型
- [x] 为 execution 分片写入/读取补单测
- [x] 新增 session -> grouped dump 重建能力

### 阶段二：执行链路接线

- [x] 为 `Agent` 增加可选 execution persist hook
- [x] 在 `BaseMidsceneTools` 注入 session-aware persistence
- [x] 在 CLI 参数中暴露 `sessionId` / `exportSessionReport`

### 阶段三：报告导出与展示

- [x] 新增 session report 生成入口
- [ ] 补充 report viewer 的 session 元信息展示
- [ ] 为端到端会话报告补测试样例
