# Dump/Report Runtime Decoupling Research

## 背景

当前 Android 慢问题已经确认不只是截图或模型调用慢，还包含执行热路径上对整份 dump 的重复处理。现有代码已经具备“截图引用化”和“按需恢复”的基础能力，但这些能力没有成为主协议。

## 当前关键链路

### Core Agent

- `Agent` 在 `onTaskUpdate` 中执行：
  1. `runner.dump()`
  2. `appendExecutionDump(executionDump, runner)`
  3. 触发 dump listener
  4. `writeOutActionDumps()`
- 位置：
  - `packages/core/src/agent/agent.ts`
  - 当前 listener 仍是 `dump string + executionDump` 形态

### Local Playground

- `LocalExecutionAdapter` 通过 `agent.addDumpUpdateListener(...)` 接收更新。
- `PlaygroundSDK.onDumpUpdate(...)` 暴露给前端，回调签名仍然是 `(dump: string, executionDump?: ExecutionDump) => void`

### Remote Playground

- 服务端 `/task-progress/:requestId` 实际存的是 `ExecutionDump`，不是完整 dump string。
- 远端 adapter 轮询时调用 `this.dumpUpdateCallback('', progressData.executionDump)`，已经表明前端进度更新并不依赖 dump string。
- 但 `/execute` 和 `/cancel` 最终返回结果时，仍会调用 `dumpDataString({ inlineScreenshots: true })` 和 `reportHTMLString({ inlineScreenshots: true })`

### Visualizer

- `packages/visualizer/src/hooks/usePlaygroundExecution.ts` 在 `onDumpUpdate` 回调中忽略第一个 `dump` 参数，只使用 `executionDump.tasks`
- 这说明当前最重要的消费方已经天然适配“增量对象优先”的方向

## 已有可复用能力

### Screenshot 引用化

- `ScreenshotItem.toSerializable()` 可以把截图序列化成：
  - inline: `{ $screenshot: string, capturedAt: number }`
  - directory: `{ base64: string, capturedAt: number }`
- `ReportGenerator` 已经支持：
  - `single-html` -> inline
  - `html-and-external-assets` -> directory

### Screenshot 按需恢复

- `restoreImageReferences()` 可以把 `{$screenshot:id}` 恢复成 lazy getter 对象
- `ScreenshotItem.base64` 支持从：
  - HTML 中按 id 恢复
  - 本地文件按路径恢复
- `extractImageByIdSync()` 可以从 HTML 中流式扫描指定图片

## 现有架构的问题

### 1. HTML 被当作实时状态载体

- inline 模式下，HTML 同时承担：
  - 图片落地
  - dump 快照承载
  - 最终可查看报告
- 这导致“运行时状态”和“导出格式”耦合

### 2. listener 协议落后于真实需求

- 协议仍以 `dump string` 为第一公民
- 但实际主要消费者只关心：
  - 当前 execution/task 状态
  - 需要时才看截图

### 3. 最终导出和运行时存储没有分层

- 运行过程中，如果用单文件 HTML 直接承接所有截图和 dump 更新，会把执行链路拖入高频 IO 和大对象序列化

### 4. local / remote 协议不统一

- remote 进度接口已经更接近“execution dump 增量”
- local 仍然是 string-first API

## 关键约束

- 最终产物仍需支持单文件 inline HTML
- 不能牺牲现有 report 查看能力
- 不应新增第三方依赖
- 需要兼容 local playground 与 remote playground
- 需要允许渐进迁移，不能一次性打断现有外部接入

## 结论

最佳方案不是继续优化 `dumpDataString()`，而是：

1. 运行时引入临时工件存储，截图优先落到临时文件
2. listener 改成“事件/紧凑对象优先”，不再以整份 dump string 为主协议
3. 最终只有在导出阶段，才生成 inline HTML
4. 旧 `onDumpUpdate` 作为兼容层保留一段时间
