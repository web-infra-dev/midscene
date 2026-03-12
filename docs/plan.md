# Dump/Report Runtime Decoupling Plan

## 方案对比

| 维度 | 方案 A：运行时临时工件存储，结束后导出 inline HTML | 方案 B：单 HTML 追加写，HTML 兼作运行时存储 | 方案 C：维持现状，仅继续优化序列化/节流 |
|------|--------------------------------------------------|---------------------------------------------|------------------------------------------|
| 思路 | 执行中写 temp screenshot/store，结束后再产出单文件 HTML | 执行中直接把图片和 dump 追加进 HTML | 保留现有架构，只减少全量序列化次数 |
| 优点 | 运行时最稳，协议最清晰，local/remote 易统一 | 最终形态和运行态一致，改动概念少 | 改动最小，短期见效快 |
| 缺点 | 需要引入 runtime store 与导出阶段拆分 | HTML 仍是差的随机访问存储 | 没解决架构根因，后续还会遇到瓶颈 |
| 适用场景 | 长流程、截图多、需要实时进度和最终导出并存 | 强依赖单文件写入且执行规模较小 | 只想止血，不做架构演进 |
| 改动范围 | core + playground + visualizer + server | core + viewer 恢复链路 | core 热路径为主 |
| 风险 | 迁移面广，但方向正确 | 长期性能和维护性仍差 | 容易再次回归 |

已选方案：**方案 A**

## 目标

- 运行时不再把 inline HTML 当主存储
- listener 默认只消费紧凑对象或增量事件
- 截图在运行时尽快落地并释放内存
- 最终仍能得到单文件 inline HTML
- local playground 和 remote playground 统一到同一套事件协议

## 非目标

- 本次不改视觉展示层交互设计
- 本次不引入数据库或外部服务
- 本次不要求移除旧 API；旧 API 先保留兼容层

## 总体设计

把“运行时状态存储”和“最终报告导出”拆开：

```text
执行中
  temp/
    snapshots/current.json
    events.ndjson
    screenshots/<id>.<ext>

结束后
  report.html
  清理 temp/
```

核心原则：

1. `current.json` 里永远只存紧凑 dump，对截图只存引用
2. listener 拿到的是事件或紧凑对象，不是 dump string
3. 图片恢复统一通过 resolver 完成
4. 只有 final export 才把截图内联进 HTML

## 补充约束（2026-03-12 Android 回归）

最新 beta 日志说明，真正的性能问题不只在 listener 热路径，还在运行时结果返回和调试输出链路上。补充约束如下：

1. 运行时禁止调用 `reportHTMLString({ inlineScreenshots: true })` 作为默认结果返回。
2. 运行时禁止调用 `writeOutActionDumps()` 去刷新最终 HTML 报告。
3. `cancelExecution` / `getCurrentExecutionData` / server `/execute` 返回必须优先提供 compact snapshot。
4. `unstableLogContent` 只能写 compact snapshot，不能再复制整份 inline dump。
5. 如果某个消费方仍需要可回放结果，只允许在单次最终结果上按需生成，不得进入 task update 热路径。

## 数据模型

### 新增类型

```ts
export type ScreenshotArtifactRef = {
  kind: 'file';
  id: string;
  path: string;
  format: 'png' | 'jpeg';
  capturedAt: number;
};

export type CompactScreenshot =
  | { $screenshot: ScreenshotArtifactRef }
  | undefined;

export interface DumpEventBase {
  version: number;
  requestId?: string;
  timestamp: number;
}

export interface ExecutionUpdatedEvent extends DumpEventBase {
  type: 'execution_updated';
  executionDump: IExecutionDump;
}

export interface ReportFlushedEvent extends DumpEventBase {
  type: 'report_flushed';
}

export type DumpEvent = ExecutionUpdatedEvent | ReportFlushedEvent;
```

说明：

- `IExecutionDump` / `IGroupedActionDump` 内部截图字段最终都应只含文件引用
- 运行时不再允许把 base64 直接放进事件负载

## 核心组件设计

### 1. Runtime Artifact Store

新增运行时存储抽象，位置建议：

- `packages/core/src/dump/runtime-artifact-store.ts`

职责：

- 写入 screenshot 二进制到临时目录
- 生成 `ScreenshotArtifactRef`
- 提供 `resolveImage(ref): string`
- 管理 `current.json` 和 `events.ndjson`
- 在 finalize 时把 compact dump 导出成 inline HTML

建议接口：

```ts
export interface RuntimeArtifactStore {
  persistScreenshot(screenshot: ScreenshotItem): ScreenshotArtifactRef;
  writeSnapshot(dump: GroupedActionDump): void;
  appendEvent(event: DumpEvent): void;
  resolveImage(ref: ScreenshotArtifactRef): string;
  exportInlineHtml(dump: GroupedActionDump, outputPath: string): string;
  cleanup(): void;
}
```

### 2. Agent 事件协议

新增 listener API，保留旧 API：

```ts
type DumpEventPayload = {
  event: DumpEvent;
  getSnapshot: () => IGroupedActionDump;
  hydrateImage: (ref: ScreenshotArtifactRef) => string;
};

addExecutionEventListener(
  listener: (payload: DumpEventPayload) => void,
): () => void;
```

兼容策略：

- 旧 `addDumpUpdateListener((dumpString, executionDump) => ...)` 标记 deprecated
- 内部实现用新协议驱动
- 只有旧 listener 被注册时，才通过兼容层按需生成 dump string

### 3. Report Generator 职责重划分

当前 `ReportGenerator` 同时负责运行时落图和 HTML 生成。改造后分两层：

- `RuntimeArtifactStore`
  - 负责执行中的工件落地与 snapshot/event 写入
- `ReportGenerator`
  - 负责最终导出为：
    - `single-html`
    - `html-and-external-assets`

也就是说：

- 执行中默认写 temp store
- `destroy()` / 显式 finalize 时才调用 `ReportGenerator.finalize(...)`

### 4. 截图序列化策略

运行时统一使用 file ref，哪怕最终目标是 inline HTML：

```ts
{
  "$screenshot": {
    "kind": "file",
    "id": "abc",
    "path": "/abs/temp/screenshots/abc.png",
    "format": "png",
    "capturedAt": 123
  }
}
```

导出 inline HTML 时再把图片读回并写成 `midscene-image` script tag。

## 模块改造范围

### Core

- `packages/core/src/agent/agent.ts`
  - 新增 `addExecutionEventListener`
  - `onTaskUpdate` 改为先写 runtime store，再发事件
  - `writeOutActionDumps()` 改为写 compact snapshot，而不是每次刷最终 HTML
- `packages/core/src/report-generator.ts`
  - 收敛为“最终导出器”
- `packages/core/src/screenshot-item.ts`
  - 增加从 `ScreenshotArtifactRef` 恢复的标准入口
- `packages/core/src/dump/image-restoration.ts`
  - 支持 `ScreenshotArtifactRef`
- `packages/core/src/dump/html-utils.ts`
  - 保留导出/恢复能力，不再承担运行时主存储职责
- 新增 `packages/core/src/dump/runtime-artifact-store.ts`

### Playground

- `packages/playground/src/sdk/index.ts`
  - 新增 `onExecutionEvent`
  - `onDumpUpdate` 退化为兼容 API
- `packages/playground/src/adapters/local-execution.ts`
  - 监听新事件协议
  - 本地结果改成 live dump + compact snapshot，移除运行时 `reportHTMLString/writeOutActionDumps`
- `packages/playground/src/adapters/remote-execution.ts`
  - 轮询/推送 `DumpEvent`
  - 本地和远端统一 UI 消费形态
- `packages/playground/src/server.ts`
  - `taskExecutionDumps` 升级为 `taskExecutionEvents` 或 `taskExecutionState`
  - `/task-progress/:requestId` 返回紧凑状态对象或事件
  - `/execute` 和 `/cancel` 默认返回 compact snapshot；如需回放，仅在最终返回阶段按需生成一次结果 dump

### YAML / Runner

- `packages/core/src/yaml/player.ts`
  - `unstableLogContent` 改写为 compact snapshot，不再复制 inline dump/base64

### Visualizer

- `packages/visualizer/src/hooks/usePlaygroundExecution.ts`
  - 改为优先监听 `onExecutionEvent`
  - 继续只消费 task 进度，不依赖 dump string

## 对外 API 设计

如果用户要“监听 JSON”，新方式不是继续监听字符串，而是直接监听对象。

### 推荐主 API

```ts
type ExecutionEventPayload = {
  event: DumpEvent;
  getSnapshot(): IGroupedActionDump;
  hydrateImage(ref: ScreenshotArtifactRef): string;
};

playgroundSDK.onExecutionEvent(
  (payload: ExecutionEventPayload) => {
    if (payload.event.type === 'execution_updated') {
      console.log(payload.event.executionDump);
    }
  },
);
```

语义：

- `event`：每次增量更新的 JSON 对象
- `getSnapshot()`：如果用户要当前完整 JSON 快照，按需获取
- `hydrateImage(ref)`：如果用户真的要某张图的 base64，再显式恢复

### 如果用户想每次都拿完整 JSON

提供一个更直接但仍然是对象协议的 API：

```ts
playgroundSDK.onSnapshotUpdate((snapshot: IGroupedActionDump) => {
  console.log(snapshot);
});
```

注意：

- 这里的 `snapshot` 仍然是 compact JSON
- 截图字段只包含 `ScreenshotArtifactRef`
- 不包含 base64

### 如果用户要单独恢复某张图

```ts
playgroundSDK.onExecutionEvent(({ event, hydrateImage }) => {
  if (event.type !== 'execution_updated') return;

  const screenshotRef =
    event.executionDump.tasks?.[0]?.uiContext?.screenshot?.$screenshot;

  if (screenshotRef) {
    const base64 = hydrateImage(screenshotRef);
    console.log(base64);
  }
});
```

### 旧 API 的兼容策略

旧接口保留，但降级为兼容层：

```ts
playgroundSDK.onDumpUpdate((dumpString, executionDump) => {
  // deprecated
});
```

它的实现会变成：

- 内部先走 `onExecutionEvent`
- 只有旧 API 被订阅时，才把 compact snapshot `JSON.stringify(...)`
- 不再作为主协议

### 推荐给用户的使用分层

- 只看进度：`onExecutionEvent`
- 要完整当前 JSON：`onSnapshotUpdate` 或 `payload.getSnapshot()`
- 要最终导出结果：`getCurrentExecutionData()` / finalize 结果
- 要图片 base64：`hydrateImage(ref)`

## 实施步骤

### 阶段 1：建立运行时存储层

- 新增 `RuntimeArtifactStore`
- 把 screenshot 落地与 compact snapshot 写入抽出来
- 为 compact screenshot ref 补充序列化/反序列化测试

### 阶段 2：引入新事件协议

- `Agent` 增加 `addExecutionEventListener`
- 本地 adapter 和 server 改为基于新事件传播
- 保留旧 `addDumpUpdateListener` 兼容层

### 阶段 3：迁移消费者

- `PlaygroundSDK` 暴露 `onExecutionEvent`
- `visualizer` 迁移到新接口
- `remote-execution` 轮询响应改为 compact payload

### 阶段 4：最终导出 inline HTML

- `destroy()` / finalize 时导出最终 HTML
- inline HTML 导出从 runtime screenshot store 回读图片
- 执行结束后清理 temp 目录

### 阶段 5：收口兼容层

- 标记旧 API deprecated
- 仓库内所有内部调用完成迁移
- 视兼容窗口决定是否保留旧协议

## 关键代码片段

### Agent 热路径

```ts
onTaskUpdate: (runner) => {
  const executionDump = runner.dump();
  this.appendExecutionDump(executionDump, runner);

  this.runtimeArtifactStore.writeSnapshot(this.dump);

  const event: ExecutionUpdatedEvent = {
    type: 'execution_updated',
    version: ++this.dumpVersion,
    requestId: this.currentRequestId,
    timestamp: Date.now(),
    executionDump: this.dump.toSerializableCompact(),
  };

  this.runtimeArtifactStore.appendEvent(event);
  this.emitExecutionEvent(event);
  this.emitLegacyDumpUpdateIfNeeded(executionDump);
}
```

### 兼容层

```ts
private emitLegacyDumpUpdateIfNeeded(executionDump?: ExecutionDump) {
  if (this.dumpUpdateListeners.length === 0) return;

  const snapshot = this.getCompactSnapshot();
  const dumpString = JSON.stringify(snapshot);
  for (const listener of this.dumpUpdateListeners) {
    listener(dumpString, executionDump);
  }
}
```

### 最终导出

```ts
async finalizeReport() {
  const snapshot = this.runtimeArtifactStore.readSnapshot();
  const reportPath = this.reportGenerator.finalizeFromArtifactStore(
    snapshot,
    this.runtimeArtifactStore,
  );
  this.runtimeArtifactStore.cleanup();
  return reportPath;
}
```

## 测试计划

- core unit
  - screenshot ref 序列化/恢复
  - runtime store 写 snapshot/event
  - 新 listener 不触发整份 dump string 序列化
  - 兼容 listener 仍可拿到 dump string
- playground unit
  - local adapter 使用新事件协议
  - remote adapter 轮询 compact progress
- integration
  - `single-html` 最终导出仍可恢复图片
  - `html-and-external-assets` 保持兼容
- regression
  - 长流程 Android case 验证 task update 延迟显著下降

## 风险与遗漏

### 风险

- 改动面覆盖 core、playground、visualizer、server，回归面较广
- `ScreenshotRef` 结构变更会影响序列化兼容性，需要明确版本策略
- 若执行中崩溃，temp 目录可能残留，需要清理兜底

### 边界情况

- 浏览器环境下无文件系统时，仍需 fallback 到现有轻量内存/HTML 方案
- cancel 场景下需要确保 temp store 能导出当前快照
- 多 request 并发时，runtime store 目录必须隔离

### 10 倍规模下的表现

- 该方案的核心成本从“反复全量序列化 + 大 HTML append”变成“事件追加 + 小 JSON snapshot + 文件随机读写”
- 在截图和任务数增长时，扩展性明显优于当前 inline 运行态

### 依赖策略

- 不新增依赖
- 临时文件、snapshot、event log 全部用 Node 原生 `fs` 实现

### 还未覆盖的点

- 是否把 `snapshot.json` 改成只写增量而不写全量，需要看执行规模后再决定
- 是否将 remote progress 从 polling 升级为 SSE/WebSocket，不在本次范围内

## 需要你确认的点

1. 运行时允许使用临时目录，最终仍导出单文件 HTML
2. 新主协议为 `onExecutionEvent`，旧 `onDumpUpdate` 只保留兼容层
3. 运行时截图统一先落文件，再在最终导出时内联

如果这三点没有异议，我下一步就按这份 plan 开始实施，并在文档末尾生成待办清单。

## 待办

### 阶段一：建立运行时存储层

- [x] 新增 `RuntimeArtifactStore`
- [x] 为运行时 screenshot ref 补充序列化与恢复能力
- [x] 补充 core 单元测试覆盖 runtime store 与 compact screenshot ref

### 阶段二：引入新事件协议

- [x] 在 `Agent` 中增加 `addExecutionEventListener`
- [x] 保留 `addDumpUpdateListener` 兼容层，按需生成 compact dump string
- [x] 将 task update 热路径切换到 runtime store + event emit

### 阶段三：迁移 playground 与 remote server

- [x] `PlaygroundSDK` 暴露 `onExecutionEvent` / `onSnapshotUpdate`
- [x] 本地 adapter 切到新事件协议
- [x] 远端 server / adapter 切到 compact progress payload
- [x] 本地执行结果改成 `live dump + compact snapshot`
- [x] 停止在 playground 运行时刷新 `reportHTML` / report 文件

### 阶段四：最终导出与清理

- [x] 将 `ReportGenerator` 收敛为最终导出器
- [x] finalize 阶段从 runtime store 导出 inline HTML
- [x] 执行结束或取消后清理 temp 目录

### 阶段五：验证

- [x] 运行 core 聚焦测试
- [x] 运行 playground 聚焦测试
- [x] 运行 lint
- [x] 验证 `unstableLogContent` 不再写 inline screenshot/base64
