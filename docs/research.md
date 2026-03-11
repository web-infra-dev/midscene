# Skills 报告优化调研

## 任务判断

- TRM: Low
- 原因: 这是一个跨 `packages/core`、`apps/report`、可能还会涉及各端 Skill 接入方式的多模块功能调整，不适合直接改代码。

## 飞书文档需求拆解

来源文档标题: `Skills 报告优化`

核心诉求有三块:

1. Skills 的多步操作不要在报告里表现成一串离散的“独立报告”，而是更接近一次连续会话。
2. `Connect` 之后应复用同一个 session，让后续多次命令调用串在一起。
3. 后续可选能力包括导出操作视频、导出包含上述步骤的报告。

文档里给出的初始技术方向:

- “考虑把现有的 executions 拆成独立的 json 文件，再弄个合并方法”
- “Midscene connect 之后，生成一个 session id，赋值给 agent ，实现多次命令调用之间的 session 复用”
- “有初步实现之后先评审，不着急全部跑通”

## 相关模块与职责

### `packages/core`

- `packages/core/src/agent/agent.ts`
  - `Agent` 持有 `GroupedActionDump`
  - 每次任务进度更新时，把 `TaskRunner.dump()` 产出的 `ExecutionDump` 追加或更新到 `dump.executions`
  - 同时把整个 `GroupedActionDump` 交给 `ReportGenerator` 增量写入报告
- `packages/core/src/agent/tasks.ts`
  - `TaskExecutor` 会为一次 action/query/assert/planning 流程创建一个 `ExecutionSession`
  - `ExecutionSession` 本质上是 `TaskRunner` 的薄封装，代表一次线性执行
- `packages/core/src/agent/execution-session.ts`
  - 当前只有“单次线性执行”的抽象，没有“跨多次命令复用的 session 聚合层”
- `packages/core/src/types.ts`
  - `ExecutionDump`: 一次执行的任务序列
  - `GroupedActionDump`: 一组 execution 的集合，已经天然支持 `executions: ExecutionDump[]`
- `packages/core/src/report-generator.ts`
  - 单个 `Agent` 运行期间，持续把同一个 `GroupedActionDump` 写到报告文件
  - 支持 `single-html` 和 `html-and-external-assets`
- `packages/core/src/report.ts`
  - `ReportMergingTool` 能把多个独立报告文件合成一个 HTML 报告
  - 本质是“多份完整报告拼接”，不是“同一业务会话的连续 execution 写入”

### `apps/report`

- `apps/report/src/App.tsx`
  - 页面启动时扫描所有 `script[type="midscene_web_dump"]`
  - 每个 script 被视为一个独立 dump 条目
  - UI 默认只加载 `dumps[0]`
- `apps/report/src/components/store/index.tsx`
  - Store 的核心对象是单个 `GroupedActionDump`
  - 单个 dump 内部可以包含多个 `executions`
- `apps/report/src/components/playwright-case-selector/index.tsx`
  - 当前的“多 dump 切换”是为 Playwright merged report 设计的
  - 语义上更像“多个测试用例”，不是“一个 Skill session 下的多条命令”
- `apps/report/src/components/timeline/index.tsx`
  - 时间轴展示的是当前 `GroupedActionDump` 里的所有 task 截图
  - 如果把多次 Skill 命令都归入一个 `GroupedActionDump`，现有时间轴天然可以展示连续过程

### 现有调用样例

- `packages/android/tests/ai/merge-reports.test.ts`
- `packages/harmony/tests/ai/merge-reports.test.ts`

这些测试都在 `afterEach` 收集 `agent.reportFile`，最后交给 `ReportMergingTool.mergeReports(...)`。

这说明仓库已经有“把多个 agent 输出合并成一个报告”的成熟路径，但它面向的是“多测试用例合并”，不是“长连接 session 复用”。

## 当前数据流

### 路径 A: 单个 Agent 的连续执行

1. 用户调用 `agent.aiAct()` / `agent.aiQuery()` / `agent.aiAssert()` 等
2. `TaskExecutor` 创建一个新的 `ExecutionSession`
3. `ExecutionSession` 内部驱动 `TaskRunner`
4. `Agent` 在 `onTaskUpdate` 中拿到 `runner.dump()`
5. `Agent.appendExecutionDump()` 把该 runner 对应的 `ExecutionDump` 放进 `GroupedActionDump.executions`
6. `ReportGenerator.onDumpUpdate(this.dump)` 将整个 grouped dump 刷到报告

结论:

- 单个 `Agent` 生命周期内，多次操作已经能形成一个连续报告
- “连续性”依赖于是否复用同一个 `Agent` 实例

### 路径 B: 多个报告文件的合并

1. 每次执行各自产生一个独立 HTML 报告
2. 调用 `ReportMergingTool.append(...)`
3. 最终 `mergeReports(...)`
4. 报告前端扫描到多个 `midscene_web_dump` script
5. UI 把它们当成多个 case / dump 列表供切换

结论:

- 这个路径解决的是“汇总浏览”
- 不是一个 session 里持续追加 execution
- 对 Skills 场景来说，用户看到的是多个 case，而不是一次连续操作

## 现有模式与可复用点

### 已经具备的能力

- `GroupedActionDump.executions` 已经是会话内多步骤容器，不需要重新发明报告数据结构
- `Agent` 已经支持在同一实例内累计 execution
- `ReportGenerator` 已经支持增量落盘与截图持久化
- `apps/report` 对“单个 grouped dump 里多个 execution”的展示链路是通的

### 尚未具备的能力

- 没有面向 Skills 的“session registry / session manager”
- 没有把外部 `connect` 得到的 session id 绑定回 `Agent` 生命周期的通用层
- 报告前端目前没有“Skill session”这一语义层，只有：
  - 一个 grouped dump
  - 或多个 playwright-style dumps

## 关键判断

### 判断 1: 不需要优先把 execution 拆成独立 json 文件

原因:

- 当前 `GroupedActionDump.executions` 已经是天然的多 execution 容器
- 报告前端对一个 grouped dump 内多 execution 的展示已可用
- 再拆成独立 json，最后仍然需要重新聚合，短期内会增加复杂度
- 除非目标明确是“超长会话降低单文件内存/IO 压力”，否则这个方向不是最短路径

### 判断 2: Skills 需求的第一优先级应是“复用 Agent/session”，而不是“合并报告”

原因:

- 只要复用同一个 `Agent`，当前 core/report 体系已经能把多次命令沉淀到同一个 `GroupedActionDump`
- 如果每条 Skill 命令都新建 `Agent`，那就只能继续走 merge 报告路径，体验上天然是离散的

### 判断 3: 初版实现可以只做到“session 级连续报告”

飞书文档明确说“先评审，不着急全部跑通”，因此比较合理的第一阶段是:

- `Connect` 创建 Skill session
- session 绑定一个长生命周期 `Agent`
- 后续命令复用同一个 agent / report / grouped dump
- 暂不处理操作视频导出

## 约束与风险

### 约束

- 当前 `Agent.resetDump()` 会清空 execution 映射，如果复用 Agent，需要明确哪些场景允许 reset
- `ReportGenerator` 与 `Agent` 生命周期强绑定；如果 session 长时间存在，需要考虑 finalize 时机
- 各平台连接方式不同:
  - Web bridge / browser
  - Android / iOS / Harmony / computer
  - session 复用层最好放在 Skills/CLI 入口侧，而不是硬塞进某个平台设备类

### 风险

- 若在 CLI 进程间传递 session id，但 agent 实例只存在内存中，则跨进程复用会失败
- 若要支持“多次命令调用之间 session 复用”，必须确认 Skills 当前执行模型:
  - 是单进程常驻
  - 还是每次命令启动一个新进程
- 如果是多进程模型，仅传 session id 不够，还需要持久化 session state 或引入常驻 server
- 长 session 可能导致报告文件持续膨胀，尤其是 inline screenshot 模式
- 操作视频导出当前仓库内未看到现成通用实现，属于后续独立课题

## 初步建议方向

### 方向 A: 复用单个 Agent，直接累计到同一个 `GroupedActionDump`

思路:

- 在 Skills/CLI 层新增 session manager
- `Connect` 时创建 session id，并保留:
  - device/page 连接对象
  - agent 实例
  - reportFileName / reportGenerator 状态
- 后续命令通过 session id 找回 agent，继续调用 `aiAct` / `aiQuery`

优点:

- 复用现有 core/report 机制最多
- 报告天然连续
- 改动更聚焦在 Skills 接入层

代价:

- 需要确认 Skills 是不是支持常驻进程或共享进程内状态

### 方向 B: 继续每次命令独立执行，但新增“session 维度的 dump 聚合文件”

思路:

- 每次命令仍产生独立 agent/report
- session manager 只负责记录本 session 下的报告文件列表
- 新增一个“session finalize / export report”步骤，把多个报告重新聚合成一个 `GroupedActionDump` 或 merged HTML

优点:

- 对当前命令执行模型侵入较小

缺点:

- 用户无法实时看到一个自然连续的会话报告
- 更接近“后处理合并”，而不是“session 复用”

## 当前结论

现有仓库最值得利用的事实是:

- “一个 agent 内多 execution”已经成立
- “多个独立报告合并”也已经成立

所以真正缺的不是底层报告结构，而是 `Skills Connect -> session id -> agent 实例复用` 这一层编排。

如果这个判断成立，下一步规划应优先围绕:

1. Skills 当前执行模型是否允许 session 常驻
2. session manager 应该放在哪个包/入口
3. 初版是否只做“连续报告 + session 复用”，暂不做视频导出

## 待确认问题

1. 你希望初版优化覆盖的是哪个具体入口:
   - `midscene-skills` 仓库中的 Skill 实现
   - 还是当前 monorepo 中某个 CLI / MCP / playground 入口
2. `Connect` 后的“多次命令调用”是否发生在同一个常驻进程里
3. “导出报告”是指:
   - 运行中持续更新的 session report
   - 还是结束后显式导出一份最终报告
