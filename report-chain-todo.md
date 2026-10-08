# Midscene 测试运行与报告链路 TODO

基于 PIA 和豆包地图两份报告整理。目标是让报告同时回答：**原本准备测试什么、实际执行了什么、哪些没有执行、为什么没有执行。**

本清单不包含报告文件迁移、图片目录打包或导出可携带性问题。下面按批次记录实现进度；未勾选的条目仍有后续工作。

## 实现批次与进度

分支：`fix/test-report-pipeline`，从 2026-10-08 拉取的 `origin/main`（`98062b63`）创建。第一批已提交为 `12355393`（`fix(report): preserve test plans and show setup timelines`）；第二批随本次证据采集与指标完整性修改提交。尚未推送。

| 批次 | 范围 | 状态 |
| --- | --- | --- |
| 1 | 独立计划、未执行步骤、准备/收尾时间线（01、06） | 本批基础实现完成，见下方范围与验收记录 |
| 2 | 证据采集与释放分离、指标完整性（02、07） | 本批原生 Runner 实现完成，见下方范围与验收记录 |
| 3 | 取消契约、资源调度、操作与取消事件（03、04、05 的事件部分） | 待实施 |
| 4 | 错误原因、诊断归组、清理与重试状态（05 的错误部分、08、09） | 待实施 |
| 5 | 宿主初始化及各阶段耗时（10） | 待实施 |

### 第一批已经落地

- 在原生 YAML 收集后、项目资源获取前，将完整计划写入运行目录下的 `plan.json`，并在 `summary.json` 中引用；报告同时保留独立计划。
- 计划包含五个阶段、超时/继续策略、重试范围与次数，以及被选择和被筛选的用例。被筛选的用例不创建执行结果，不增加成功/失败/未执行统计。
- 原生 YAML 计划保留变量占位符；计划输入按现有规则脱敏和限制大小，并保存脱敏/截断提示。运行时输入与计划输入分开保存。
- 实际步骤通过 `planStepId` 关联计划。准备失败或步骤早停时，Execution 可显示计划中未执行的步骤、原因及阻塞步骤链接；这些展示项没有实际时间、耗时或虚构 attempt。
- 当前展示范围内只要存在执行记录，时间线就能显示；范围包含准备、用例和收尾，不再要求存在 Case attempt。没有视觉帧时显示现有的明确空态。
- 当前步骤直接显示 Agent 详情缺失原因，步骤统计增加 Not run；Case 耗时标签改为 Case time。

### 第一批未覆盖的部分

- 不将所有条目 01 的要求标为完成：资源阻塞等调度原因的结构化保存依赖第三批；非 YAML 宿主操作记录依赖第五批。
- 旧 YAML/自定义收集适配器的执行前计划快照与变量保留仍需补齐。当前共享报告投影能附带计划，但不能把执行结束后的重建当作执行前保存。
- 非协作操作超时、清理延后、晚到结果、重试停止原因和缺失指标仍按后续批次处理。

### 第一批验证

- `pnpm exec nx test @midscene/core -- tests/unit-test/runner-test-plan.test.ts tests/unit-test/runner-report-projection.test.ts`
- `pnpm exec nx test @midscene/test -- tests/test-project-runner.test.ts tests/test-run-report.test.ts tests/collection.test.ts`
- `pnpm exec nx test @midscene/report -- src/components/test-runner/lifecycle.test.tsx src/components/test-runner/model.test.ts src/components/test-runner/file-retry-report.test.tsx src/components/test-runner/evidence-inspector.test.tsx`
- `pnpm exec nx build @midscene/core --skip-nx-cache`
- `pnpm exec nx build @midscene/test --excludeTaskDependencies`
- `pnpm exec nx build @midscene/report --excludeTaskDependencies`
- `node scripts/validate-core-report-template.mjs`
- `pnpm run lint --config-path /private/tmp/midscene-report-lint`：临时配置复制根目录规则，仅额外排除用户指定忽略的 `impeccable` 和本地 `.pnpm-store` 缓存。仓库 lint 配置未修改。

113 条相关回归测试、构建与上述检查已通过。页面行为通过组件回归验证；浏览器策略禁止直接打开本地 HTML，因此未进行该预览的浏览器验收。真实模型/设备 e2e 未运行。

### 第二批已经落地

- 增加独立的步骤证据采集边界：动作成功、失败或 Runner 超时返回后即可采集，不再等待资源排空或释放。
- 原生 Agent 在第一次异步 I/O 之前冻结当前步骤关联的执行数据，独立保存 JSON 与图片引用；不等待 HTML 写入队列。每个快照有独立文件及采集截止时间，进行中操作标为部分数据。
- 每步只保存关联的执行详情；报告生成时按 Agent 与作用域合并，执行 ID 用于去重统计。同一个 Agent 的跨作用域快照不会把后续作用域的执行 ID 填到先前作用域里。
- Case 与文档都保留已成功采集的来源。后续采集失败不会丢掉之前的快照；清理延后或释放失败也不会丢掉已完成步骤的数据。
- 采集最多等待 5 秒；超时会取消采集等待、保存独立诊断，并忽略晚到的采集结果。采集错误不改变动作本身的成功结论，也不把它变成需要重跑的业务失败。
- 单个来源无法读取或解析时，其他来源仍进入报告，失败来源产生诊断。执行身份存在歧义等约束错误仍会抛出。
- 模型指标保存完整、部分、未知状态及执行引用覆盖数量、缺失原因。页面显示真实零值、已知的部分值或未知 `—`；模型服务缺少 tokens 或耗时时，该字段独立显示未知。合并报告保留完整性状态。
- 当前步骤展示部分证据的采集边界及采集错误；整体报告展示指标完整性说明。

### 第二批范围与限制

- 完整的不可变快照由原生 Agent 提供。外部适配器仅支持 `flushReport()` 时，仍独立采集其 HTML 来源，但明确标为部分数据，并说明不具备不可变快照能力；该来源的时间仅表示采集观察边界。外部适配器需实现快照接口才能达到同样的封存保证。
- 本批不会提前销毁仍在运行的 Agent。操作取消、资源阻塞步骤调度、晚结束/晚失败记录及重试停止原因仍由第三、四批处理。
- 采集结束后的运行仍沿用既有资源释放契约；没有将任意外部适配器的释放操作改为可取消操作。只有步骤边界的采集等待增加了明确上限。
- 未运行真实模型/设备 e2e，也未进行浏览器视觉验收；这批使用可控 Agent、Promise、固定报告数据和组件测试验证。

### 第二批验证

- `pnpm exec nx test @midscene/core -- tests/unit-test/runner-report-collection.test.ts tests/unit-test/test-run-report.test.ts tests/unit-test/runner-report-projection.test.ts tests/unit-test/runner-report-merge.test.ts tests/unit-test/report-generator.test.ts tests/unit-test/runner-resource-cleanup.test.ts tests/unit-test/report-stats.test.ts tests/unit-test/test-runner-nodes.test.ts tests/unit-test/report-generator-reference-images.test.ts`
- `pnpm exec nx test @midscene/test -- tests/report-snapshot.test.ts tests/midscene-nodes.test.ts tests/agent-report-trace.test.ts tests/test-run-report.test.ts tests/test-project-runner.test.ts`
- `pnpm exec nx test @midscene/report -- src/components/test-runner/lifecycle.test.tsx src/components/test-runner/model.test.ts src/components/test-runner/evidence-inspector.test.tsx src/components/test-runner/file-retry-report.test.tsx`
- `pnpm exec nx build @midscene/core --excludeTaskDependencies`
- `pnpm exec nx build @midscene/test --excludeTaskDependencies`
- `pnpm exec nx build @midscene/report --excludeTaskDependencies`
- `node scripts/validate-core-report-template.mjs`
- `pnpm run lint --config-path /private/tmp/midscene-report-lint`：沿用第一批临时配置，不修改仓库 lint 规则，不涉及 `impeccable`。
- `git diff --check`

234 条相关回归测试（Core 110、Test 72、Report 52）、三个项目的构建、报告模板检查与上述 lint 检查均已通过。采集边界改动后另单独重跑了 5 条快照集成回归，结果通过。第二批验收完成。

## 两份报告暴露的事实

| 报告 | 具体情况 | 暴露的问题 |
| --- | --- | --- |
| PIA | 40 个步骤中 14 个成功、26 个失败；其中 23 个因 Agent 被占用而没有启动 | 超时后继续调度，未执行与执行失败混在一起 |
| PIA | prefetch 的 5 个 AI 步骤成功，另有 2 个 AI 步骤超时，但这 7 个步骤都缺少关联详情 | 后续清理被延后，连此前成功步骤的证据也没有进入报告 |
| PIA | 模型调用、耗时和 tokens 都显示为 0；页面有 32 条诊断 | 数据缺失被表示为零，连带警告掩盖主要失败 |
| 豆包地图 | beforeAll 执行 7 步，前 6 步成功；最后的标题断言失败，正式用例未启动 | 报告需要明确区分准备失败与用例失败，并保留未执行的测试计划 |
| 豆包地图 | 6 次 Agent 执行有详情，模型统计为 14 次调用、80,652 tokens，但 Execution 没有时间线 | 时间线只在存在 Case attempt 时显示，没有覆盖准备阶段 |
| 豆包地图 | 总运行约 12 分 46 秒，beforeAll 约 2 分 49 秒，文档执行前还有约 9 分 18 秒 | 项目初始化等阶段缺少可定位的耗时记录 |

豆包地图的具体失败是：断言要求标题为“智能服务 Debugger”或“智能服务 Debug”，报告记录模型看到的是“Debugger Tool”。它只能说明准备阶段的标题断言不成立，不能说明地图预览功能失败。PIA 的验证码发送失败和两个 AI 超时的具体底层原因，也需要另行核查。

## P0 运行与证据保存

### 01 独立保存完整的测试计划

- [ ] 在执行前保存解析后的 YAML 计划，使报告不再仅靠已发生的执行记录还原测试内容。

**具体例子：** 豆包地图用例因 beforeAll 失败而没有任何 attempt。当前报告能保留用例名称和“未启动”的结果，却没有独立保存这个用例原本准备执行的完整步骤。

**待做：**

- 保存文档、用例和各阶段的步骤定义，包括 beforeAll、beforeEach、Case steps、afterEach、afterAll，以及超时、失败后继续和重试等相关策略。
- 为计划中的步骤建立稳定身份。每次实际执行使用独立身份，并关联原计划步骤；同一 beforeEach 在多个用例和重试中执行时，记录不能互相覆盖。
- 分开保存计划、筛选/调度决策和实际结果。未启动、被过滤、因前序失败停止、被资源阻塞等情况，都能定位到对应计划并说明原因。
- 对计划输入脱敏，并明确运行时变量的处理方式，避免把凭据或环境变量秘密直接写入报告。
- 将项目初始化等非 YAML 宿主操作单独记录。解析后的 YAML 不能单独覆盖整个运行生命周期；解析失败时保留来源和错误，不伪造已解析计划。

**验收：** beforeAll 失败后，报告仍能展开正式用例原本的全部步骤，显示“未执行：准备阶段第 N 步失败”，并定位到该失败。早停和重试场景也能区分计划步骤与各次实际执行，不创建虚假的 Case attempt。

**入口：** `packages/core/src/test-runner/parser/types.ts`、`packages/core/src/test-run-report.ts`、`packages/core/src/test-runner/reporting/test-run-report.ts`、`packages/test/src/cli`。

### 02 将证据保存与资源释放拆开

- [x] 原生 Agent 已完成步骤的详情和进行中操作的部分数据，在资源清理被延后时仍然能够发布；仅提供 HTML 的外部适配器按上述限制标为部分数据。

**具体例子：** PIA 的 prefetch 已成功，但后面的 NSR 操作没有及时退出，最终连 prefetch 的截图和模型过程也无法关联。

**待做：** 持续登记执行来源，在步骤完成或超时边界保存可读取的不可变快照，明确标注部分数据及采集截止时间。资源释放单独负责清理。采集部分成功但释放失败时，也要保留已取得的数据和独立的释放错误。

**验收：** 一个后续操作持续占用 Agent 时，此前成功步骤的详情仍可查看；超时操作展示最后已取得的数据及缺失状态。延后清理不再让整段执行证据消失。

**入口：** `packages/test/src/midscene/index.ts`、`packages/core/src/test-runner/engine/run-collected-case.ts`、`packages/core/src/report.ts`。

### 03 完善取消契约

- [ ] 将取消信号贯穿任务循环、动作、hook、等待和能够取消的设备/网络调用。

**具体例子：** PIA 的步骤在 180 秒时被 Runner 判定超时，但底层操作仍占用 Agent。当前代码在规划边界检查取消，任务批次和部分动作调用没有统一的取消检查。

**待做：** 区分“Runner 结束等待”“请求取消”“操作实际停止”。取消后禁止提交新的普通动作。外部调用无法中断时，明确记录其仍在进行，并等待实际结束；恢复和清理使用明确的专用边界。

**验收：** 多动作批次执行中触发取消，不再提交后续普通动作；可取消的请求收到信号。不能及时退出的操作记录实际状态，Runner 仍能在有界时间内返回。不能只通过增大超时掩盖问题。

**入口：** `packages/core/src/test-runner/engine/execute-step.ts`、`packages/core/src/task-runner.ts`、`packages/core/src/agent/task-builder.ts`、`packages/core/src/agent/tasks.ts`。

### 04 让资源可用性参与后续调度

- [ ] 明确表达被阻塞、未启动的步骤，避免把它们当成实际执行后的业务失败。

**具体例子：** PIA 的 23 个点击/断言在 0～1 毫秒内被拒绝；它们没有真正验证 snapshot、NSR 或 SSR 功能。

**待做：** 失败后继续的决策结合资源状态。资源仍被占用时，对受影响步骤采用有界等待或明确阻塞/停止策略，并关联阻塞来源；独立步骤是否继续按明确策略处理。区分 Agent 已空闲与业务场景已恢复，提供显式恢复或终止边界，不自动猜测任意业务依赖。

**验收：** 非协作操作超时后，后续依赖同一资源的步骤明确显示未执行及原因，原有动作/断言方法没有被调用。旧操作稍后退出时，不默认认定页面已恢复到预期状态。

**入口：** `packages/core/src/test-runner/engine/run-collected-case.ts`、`packages/core/src/test-runner/engine/resource-operations.ts`、`packages/core/src/test-runner/engine/types.ts`。

## P1 数据模型与报告呈现

### 05 贯通执行身份、事件和错误原因

- [ ] 让计划步骤、实际操作、取消、详情采集和清理能够关联，并保留结构化原因链。

**具体例子：** 第一份报告知道“有操作未结束”，却没有直接指出是哪一步阻塞清理；第二份错误出现两层 `Node "aiAssert" failed` 前缀。

**待做：** 独立记录操作开始、取消请求、实际结束和采集状态；执行身份不依赖最后一次 dump 写入才建立。取消后晚到的事件仍归属于原操作，不写到后续步骤。保留经过脱敏和大小限制的错误原因链，消除重复包装。明确报告快照封存与后续事件保存的规则。

**验收：** 能从阻塞或清理诊断定位到触发步骤；能够区分 Runner 返回时间和实际操作结束时间；晚完成及晚失败可查；错误不会只剩反复拼接的英文字符串。

**入口：** `packages/core/src/test-run-report.ts`、`packages/core/src/test-runner/errors.ts`、`packages/core/src/test-runner/reporting/sanitize.ts`、`packages/core/src/test-runner/execution-record.ts`、`packages/core/src/agent/agent.ts`。

### 06 时间线覆盖当前展示的执行范围

- [x] 支持准备阶段、正式用例和收尾阶段，不再以存在 Case attempt 作为显示时间线的唯一条件。

**具体例子：** 第二份报告已经记录打开主菜单、进入设置页等准备过程，但正式用例没有启动，整个时间线被隐藏。

**待做：** 按当前展示范围计算时间轴和帧位置，保留阶段归属。结合独立计划展示未执行步骤及原因。区分没有执行、没有视觉数据、部分详情缺失等空态；当前步骤直接展示详情缺失原因。

**验收：** 只有 beforeAll 执行记录且 Case attempts 为空时，准备阶段时间线仍可用，Case 保持未启动。准备和用例同时存在时，时间范围正确。缺少视觉数据时给出明确状态。

**入口：** `apps/report/src/components/test-runner/case-workspace.tsx`、`use-case-workspace.ts`、`attempt-timeline.tsx`、`evidence-inspector.tsx`、`evidence-tabs.tsx`。

### 07 区分指标的真实零值与数据缺失

- [x] 为模型调用、耗时和 tokens 保存采集完整性，支持完整、部分和未知的表达。

**具体例子：** 第一份没有取得 Agent 来源，却显示 0 次模型调用；第二份取得来源后正常显示 14 次调用。

**待做：** 为汇总保存覆盖范围和缺失原因。完整采集且确实没有调用时显示 0；未采集时显示未知；部分采集时展示已知值并标注不完整，不估算成完整消耗。

**验收：** 空来源不再自动呈现为真实零值；部分来源缺失时，数字和完整性提示一致。

**入口：** `packages/core/src/test-run-report.ts`、`packages/core/src/report.ts`、`apps/report/src/components/test-runner/single-case-run-info.tsx`。

### 08 按原因归组诊断并突出主要失败

- [ ] 区分主要执行失败、被阻塞步骤、数据缺失和清理后果，并支持点击定位。

**具体例子：** 第一份首屏铺开 32 条诊断，而真正的两个 180 秒超时在后面；23 个未启动步骤又各自得到“没有稳定执行引用”的警告。

**待做：** 未启动步骤不报 Agent 详情能力缺失；区分已经捕获 ID 但来源缺失、已启动但没有 ID、完全未启动。相同原因合并摘要，原始记录可展开。展示步骤序号和名称，UUID 留在详情。主要失败可包含多个独立原因，不能把登录失败和 AI 超时强行归成同一个根因。

**验收：** 首屏能够解释“两个 AI 操作超时，23 步未执行，详情采集不完整，清理仍待完成”，并直接定位相关步骤；诊断条数不被表述为独立故障数量。

**入口：** `packages/core/src/test-runner/reporting/test-run-report.ts`、`apps/report/src/components/test-runner/single-case-run-info.tsx`、`lifecycle-errors.tsx`。

### 09 明确阶段结果、清理状态和重试决策

- [ ] 分别表达测试结果、准备/收尾结果、清理等待/完成/失败，以及是否继续重试。

**具体例子：** 第二份 `failed: 0`、`notRun: 1`，整次运行却失败，因为失败发生在准备阶段。第一份清理被延后却显示 teardown failed，配置 retry 3 但只有一次 attempt。

**待做：** 清楚解释各层状态及统计口径。为清理保留阻塞关系和实际完成结果，选择明确的快照/后续记录策略。保存重试预算、决策和停止原因。Case 与 Project 的同源清理问题可追踪为同一条影响链。

**验收：** 第二份直接显示“准备阶段断言失败，1 个正式用例未启动”；第一份显示“清理尚未完成，因此停止重试”，并能查询后续完成或失败状态。报告封存时仍有后台操作，必须明确说明。

**入口：** `packages/core/src/test-runner/engine/project-runtime.ts`、`resource-operations.ts`、`run-workflow-document.ts`、`packages/core/src/test-run-report.ts`、`apps/report/src/components/test-runner`。

## P2 耗时可观测性

### 10 展示项目初始化与各执行阶段的耗时

- [ ] 对项目初始化、文档准备、用例、收尾、资源等待和报告生成提供可定位的时间记录。

**具体例子：** 第二份文档执行前约 9 分 18 秒，报告无法说明时间具体花在哪里。第一份的 Case total 和 Run time 也使用不同时间范围。

**待做：** 为非 YAML 宿主操作记录阶段与耗时，允许扩展节点补充内部阶段。明确 Case time、Run time 和模型时间的定义；涉及嵌套或并行时，不将重叠时间机械相加。

**验收：** 能找到第二份文档执行前时间对应的具体阶段，未知阶段明确标注；不同范围的时间有清楚标签，阶段分解与墙钟时间一致。

**入口：** `packages/core/src/test-runner/engine/project-runtime.ts`、`packages/test/src/cli`、`apps/report/src/components/test-runner/case-workspace-header.tsx`、`single-case-run-info.tsx`。

## 联合回归场景

- [ ] 计划已保存 → beforeAll 断言失败 → Case 没有启动：原计划完整可见，未执行原因明确，准备阶段详情和时间线仍可用。
- [ ] 前几个 AI 步骤成功 → 后续操作超时且没有及时退出 → 允许失败后继续 → 清理延后：成功步骤证据保留，受影响步骤不被当成实际业务失败，指标明确标注完整性。
- [ ] 超时操作晚结束或晚失败 → 清理最终成功或失败：事件归属于原操作，记录最终状态，不覆盖当时的超时结论，也不污染后续步骤。
- [ ] 多用例、重复 hook、用例重试、文档重试和筛选：同一计划定义与各次执行能够准确关联，未执行原因不混淆。
- [ ] 单个来源缺失或释放失败：已取得的其他来源仍保存；诊断正确分组，统计显示部分数据。

优先使用可控的假 Agent、延后完成的 Promise 和固定 dump 做单元/组件回归；只有取消行为依赖真实设备或模型时，再增加对应集成测试。实现时执行相关项目的最小测试和必要构建，提交或更新 PR 前运行根目录 lint。

## 实现约束

- 保留同一 Agent 的重叠保护和资源隔离；保护机制阻止资源状态不明时复用或提前销毁。
- 尊重明确的失败后继续策略，同时记录资源不可用带来的调度限制。
- 报告 schema 可以调整，旧报告可重新生成，不增加旧格式兼容层。
- 测试计划描述作者意图；执行记录描述实际发生的事实，两者不能互相替代。
- 两份报告不足以确定 AI 超时的具体阻塞位置，也不足以确定延后清理最终成功或失败；需要通过新增记录验证。

## 报告来源

- PIA：`/Users/bytedance/Downloads/Report - Midscene.js.html`
- 豆包地图：`/Users/bytedance/Downloads/Report - Midscene.js-2.html`
