# Report Overview：Project → File → Case 改版计划

状态：Overview 改造与回归验证已完成。旧 CLI batch / 整文件 retry 的统一发布适配仍是独立阶段，未在本次改造中实现。

调研日期：2026-10-13。调研阶段依据源码静态检查；落地后的实际测试与预览验证见末尾实施记录。

## 1. 目标与边界

报告总览需要直接呈现执行模型的三个层级：Project → File → Case。用户应能先找到项目和文件，再查看具体用例，并区分用例失败与文件初始化、清理、收集失败。

本次计划包含：

- 每个 Project 一张独立表格，表格内容为 File → Case。
- 用复选框替换状态筛选下拉框。
- 用列头排序替换排序下拉框。
- Compact / Detailed 共用分组、筛选、排序和统计规则。
- 评估旧 YAML 兼容执行链路复用该报告的适用范围与缺口。

不改变 YAML 执行语义、失败处理策略或现有 Case / Step 路由身份。Case 详情的 Visual / YAML 切换、失败步骤定位和 Agent 记录继续沿用现有能力。

## 2. 页面结构

```text
运行信息：创建时间 / tokens / 总耗时 / Projects / Files
运行统计：Cases / Passed / Failed / Retried / Not run

Compact / Detailed     [✓ All] [ Failed] [ Retried] [ Passed]     Search

Project A                         项目状态、Cases 等汇总
┌ File ↕ ──────────────── Passed / Case ── Attention ── Duration ┐
│ ▾ 文件 A.yaml            2 / 3          1 failed     30 s    │
│     Case 1               Passed                     10 s    │
│     Case 2               Failed        —             12 s    │
│     Case 3               Retried       1 retry        8 s    │
│ ▸ 文件 B.yaml            2 / 2                      20 s    │
└─────────────────────────────────────────────────────────────┘

Project B                         项目状态、Cases 等汇总
┌ File ↕ ──────────────── Passed / Case ── Attention ── Duration ┐
│ …                                                          │
└─────────────────────────────────────────────────────────────┘
```

示意图表达层级和信息位置，不规定最终列宽。Case 行的结果状态放在名称旁，Passed / Case 单元格不重复展示百分比；Detailed 中的记录预览可使用独立的第二行。

### Project

- Project name 放在每张表格的标题区域，不在每个 File / Case 行重复增加 Project 列。
- Project 按报告中的项目顺序排列，不受列头排序影响。
- 标题展示项目状态和用例汇总；文件数只在页面顶部运行信息中展示。Project 级 setup / teardown / infrastructure 错误在标题下单独呈现。
- 项目可整体折叠。表格随内容增长，不为不同项目强制设置相同高度。

### File

- File 是表格第一级，点击展开该文件的 Case。
- 展示文件路径、汇总状态、通过数 / 总 Case 数、Attention、Duration；不额外显示百分比。
- 默认展开失败、有文件级错误或重试后通过的文件；正常通过的文件默认折叠。用户手动展开状态在筛选、排序时保留。
- 长路径保留可辨识的目录信息，截断时提供完整路径提示；相同 basename 的文件不能混淆。
- 收集失败、没有 Case、setup / teardown 失败的文件仍需保留 File 行和错误入口。
- File 错误入口展开就近的错误说明；不把文件错误伪造成一个 Case，也不跳转到无关用例。

### Case

- Case 是 File 下的第二级，缩进表达归属；点击进入现有 Case 详情。
- Compact 展示名称、状态、重试信息和耗时；Case 错误详情在进入 Case 后查看；Detailed 在此基础上展示记录预览。
- 文件路径已在父级展示，不在每个 Case 的常规副标题重复；搜索命中完整路径时可以展示命中片段。
- 进入失败 Case 仍定位对应失败步骤并展示错误说明；返回总览保留筛选、排序和展开状态。

## 3. 筛选：All / Failed / Retried / Passed

移除状态筛选下拉框，使用带计数的复选框，直接勾选生效。

| 选项    | 匹配范围                                                 |
| ------- | -------------------------------------------------------- |
| All     | 不限制状态，包括 Not run、空文件、文件级和项目级错误     |
| Failed  | 最终失败的 Case，以及存在文件级 / 项目级错误的作用域     |
| Retried | 最终通过且此前存在失败尝试的 Case，即 Passed after retry |
| Passed  | 未经历失败重试而通过的 Case，不包含 Retried              |

这里将 Retried 明确定义为“重试后通过”，而不是“发生过任何重试”：重试后仍失败的 Case 属于 Failed。悬浮提示需说明这一点。文件整体重试不等于文件内每个 Case 都曾失败，不能给所有子 Case 自动添加 Retried。

交互规则：

1. 初始只选中 All。
2. 选中任一具体状态时取消 All；具体状态支持多选，按 **OR** 匹配。
3. 点击 All 清除具体状态，恢复全部；取消最后一个具体状态也恢复 All，避免无意进入零选项状态。
4. All 已选中时再次点击保持 All；选完三个具体状态也不自动等同 All，因为它们没有覆盖 Not run。
5. 状态与搜索词按 **AND** 组合；Clear filters 恢复 All 并清空搜索，排序不受影响。

### 保留错误与上下文

- 命中 Case 时保留所属 File 和 Project；没有任何匹配内容且没有匹配作用域错误的 Project 隐藏。
- Failed 命中文件级错误时，即使没有 Failed Case，也必须保留 File 和错误说明。由该错误阻止的 Not run Case 可以作为受影响上下文显示，明确标注 Not run，不计作 Failed 匹配数。
- Project 级失败采用同样规则；无法归属文件的错误留在 Project 标题下，不能凭空创建 File。
- 当前四个选项不提供独立的 Not run 筛选；Not run 通过 All 查看，也可作为失败作用域的受影响上下文出现。需要独立排查时，再另行增加 Not run 选项。

### 计数口径

- Failed / Retried / Passed 的括号计数均为互斥的 Case 数，按整个报告计算，不受当前复选框选择影响；搜索生效后可展示该搜索范围的可匹配数。
- All 的计数是 Case 总数，包括 Not run。文件级和项目级错误另计，例如 `1 file error`，不混入 Case 数。
- 页面顶部运行汇总和 File 的通过率保持完整执行结果口径。筛选后不增加重复的 Case 总数或逐文件匹配提示；File 的 Passed / Case 保持完整执行计数。
- 收集失败导致 Case 总数未知时显示 `—` 或 `Unknown`，不能用 `0 / 0 · 100%` 表示通过。

## 4. 排序：直接点击列头

删除排序下拉框。每张 Project 表格提供四个可点击列头：**File、Passed / Case、Attention、Duration**，各列均显示双向箭头。

各 Project 的排序字段和方向独立保存：点击一个表格列头仅改变该 Project。项目块顺序固定；File 只在所属 Project 内排序，Case 只在所属 File 内排序，不能打散父子关系。

| 列头          | 首次选择                   | 再次点击        | File 行排序依据                | Case 行排序依据                                     |
| ------------- | -------------------------- | --------------- | ------------------------------ | --------------------------------------------------- |
| File          | 报告文档顺序，也是默认排序 | 正序 / 倒序切换 | 与 Markdown 结果相同的文档顺序 | `caseIndex` 定义顺序                                |
| Passed / Case | 降序                       | 升序 / 降序切换 | 最终通过 Case 数 / 总 Case 数  | 最终通过为 1，失败或 Not run 为 0；同值保留定义顺序 |
| Attention     | 问题优先                   | 反向切换        | 下述问题优先级及数量           | 下述问题优先级，之后保留定义顺序                    |
| Duration      | 降序                       | 升序 / 降序切换 | 文件实际记录的总耗时           | Case 全部尝试的记录耗时                             |

Passed / Case 的 Case 排序只分最终通过与未通过，不把“重试后通过”当成较低通过率，也不把 Not run 显示为 Failed。Case 行的实际状态仍展示在名称旁。

### 定义顺序的来源

- Project 使用报告的项目顺序。
- File 优先沿用 `project.documents` 的报告顺序，和 Markdown 结果的文档分组顺序一致；未执行、仅存在于 `project.plans` 的文件以及收集错误按原有顺序追加。正序和倒序互为反向，不按文件名或完成时间重新排序。
- Markdown 结果只列出有 Case 的文档；Overview 还需要保留空文件、未执行文件和收集错误。两者共有的文档顺序保持一致。
- File 内按 `caseIndex` 排序，而不是按 Case 名称或执行完成时间。
- 收集错误尚无对应文档位置时，使用稳定的收集错误顺序追加，并显示错误；以后如需严格还原其在全部候选文件中的位置，应由生产端提供顺序信息。

File 列悬浮提示说明其采用报告顺序，Case 保持文件内定义顺序。再次点击列头反转 File 顺序，并更新双向箭头和无障碍排序状态。

### Attention 与稳定排序

问题优先时依次为：当前失败 / 作用域错误 → Not run → 重试后通过 → 正常通过。同一等级的 File 按该等级的问题数量降序，再按定义顺序；反向时反转优先级和数量，最终相同仍按定义顺序。

- 文件有失败 Case 或文件级错误时归为失败；全部 Case 通过但 teardown 失败时，File 仍然失败。
- Attention 展示可解释的内容，例如 `1 failed · 1 retried`、`Setup failed`、`2 not run`，不只显示模糊总分。
- File 通过率为 100% 与 File 失败可以同时成立：前者描述 Case 结果，后者可能来自清理错误。错误原因必须可见。
- 未知通过率 / 耗时始终放在已知值之后，正反序都如此；零耗时显示 `0 ms`，不当成未知。
- 排序使用完整作用域的统计，不因为筛选只显示部分 Case 而改变 File 的排序值。
- 文件耗时优先复用报告的 `durationMs`；不要以 Case 耗时相加冒充文件墙钟耗时。重试跨度和未记录时长的含义沿用协议，未知值不猜测。

## 5. 数据组织与实现方向

现有数据已经有 Project 的 `documents`，每个 Document 有 `cases`；缺失的是总览中的 File 视图层，而不是必须增加一个新的执行层。

建议在报告视图模型中增加 File 级结构，由 Project 的 plans、documents 和 collectionErrors 构建，再挂载现有 Case 视图。**不能只对展平的 Case 数组按路径分组**，否则没有 Case 的失败文件会消失。

- 文件身份以 Project 和报告提供的 document 身份为准；同路径在不同 Project 下分别展示。
- 同文件的协议内重试合并为一个 File，保留文档和 Case 尝试历史；同文件的独立执行调用仍为不同 File 实例。
- 使用 `logicalDocumentId`、`documentRunId` 和已有重试结构区分这些情形，不凭 sourcePath 或显示名称猜测。
- 未执行文件优先从 plan 获取名称与 Case 定义；未收集成功的文件只展示真实可知信息。
- 搜索覆盖 Project name、File path、Case name、错误摘要及现有可搜索内容；匹配 File / Project 名称时保留其符合状态条件的后代。
- 展开状态以稳定 ID 保存；排序与筛选不修改原始报告数据。
- 采用语义化表格和可访问的展开按钮；列头提供排序状态，复选框可通过键盘操作。窄屏允许合理横向滚动，长标题省略并提供完整内容提示。

现有单 Case 自动进入详情的策略不在本次计划中改变；用户返回 Overview 后仍应看到对应 Project / File 层级。

## 6. 旧 YAML 兼容链路调研

### 6.1 结论

**适合复用同一报告页面，但不能宣称所有旧入口已经具备完整的项目分组、批量文件和重试聚合能力。**

- 新生成的旧 YAML 单次执行报告：可以沿用共享协议，直接适配 File → Case 视图。
- 旧 CLI 的批量执行与整文件重试：需要补齐生产端身份、计划和尝试聚合后，才能提供完整、准确的总览。
- 只有 Agent dump 的报告：只能展示真实已有的执行摘要，不能假装恢复出了 YAML 文件、tasks 和 flow。
- 历史 HTML 文件不要求向后兼容；优先重新生成，不为本次 UI 改版增加旧序列化格式解析垫片。

报告复用不等于执行命令兼容。`midscene-test` 当前明确拒绝旧 `tasks / flow`，旧文件仍由 `midscene` 或原有 `agent.runYaml` 执行；这次不修改该边界。

### 6.2 已存在的映射

| 旧 YAML 概念               | 共享报告概念          | 展示原则                                                     |
| -------------------------- | --------------------- | ------------------------------------------------------------ |
| 执行环境 / 平台            | 合成 Project          | 使用已有项目显示名或平台信息，不虚构用户配置的 Project       |
| YAML sourcePath            | File / Document       | 展示真实来源文件；内联输入显示 `Inline YAML`，不伪造磁盘路径 |
| `tasks[i]`                 | Case，`caseIndex = i` | 保留 task 名称和定义顺序                                     |
| `tasks[i].flow[j]`         | Step                  | 使用现有记录和步骤详情                                       |
| 宿主创建 / 执行 / 清理异常 | 文件作用域错误        | 不假装成用户声明的 beforeAll / afterAll                      |

兼容编译器默认 projectId 为 `legacy-yaml`，名称可来自 projectName 或 platform。这是内部归类身份，不等于原生的执行项目配置。界面需要帮助用户理解其来源；没有显示名时可使用 `YAML execution`。

### 6.3 批量、重试与错误的缺口

1. **批量输出不是一份统一运行报告。** 旧 CLI 的 execution summary 目前写出每个文件的 report / retryReport 引用与 JSON 汇总。要让用户在同页看到同 Project 下的多个 File，需要在宿主发布层汇总真实执行记录和计划；单改 UI 不能让独立 HTML 自动合并。
2. **通用报告合并保留来源隔离。** `mergeTestRunReportDumps` 给 Project / Document 等 ID 加来源前缀，不负责将同名 Project 或同路径文件归为一个逻辑运行。不能在视图层取消隔离以实现视觉合并。
3. **CLI retry 是整个文件重跑。** 每轮创建新的 Player；Player 生成的执行记录目前使用 `attemptIndex: 0`，CLI 另在 summary 中记录 attempt。现有 retry report 通过通用合并器汇集各轮报告，不能直接把它解释成一个 File / Case 的规范重试历史。
4. **需要宿主提供重试事实。** 如果后续统一旧 CLI 报告，应由 CLI 把同一次 batch、同一逻辑文件、各轮 attempt 和对应 task 身份传给共享发布链路；同文件独立调用不能合并。文件级重试标记与 Case 的“此前失败后通过”分别计算。
5. **没有运行的文件可能没有报告。** Setup 文件失败或中断时，summary 可记录 notExecuted，但没有对应 HTML。完整总览需要携带 batch 计划中的文件以及阻塞原因；无法解析的 Case 总数保持未知。
6. **统计单位不同。** CLI summary 的 Total files / Successful / Failed 是文件数；共享报告的 Case 是 task 数。例如一个文件包含三个 task，其中两个成功、一个失败，应显示 `Files: 0 / 1 passed`、`Cases: 2 / 3 passed`，不能拿两个分母互相替代。
7. **YAML 原文定位不能直接假定可用。** 兼容编译器没有像原生计划那样捕获 sourceYaml；当前源码定位器按 `cases / steps` 查找。旧 `tasks / flow` 的原文展示与步骤定位需单独提供捕获和映射，不能拼一份假的原生 YAML 冒充原文件。

这些补齐工作应作为独立的旧 CLI 报告发布适配阶段，不为 Overview 改版扩大执行引擎或 YAML 解析器的职责。

### 6.4 只有 Agent dump 的降级

通用合并器的 Agent fallback 会创建一个合成 Project、Document 和 Case，sourcePath 可能是报告 HTML 路径，且没有真实 Runner Steps。此类来源应明确标注为 Agent report / Source report，保留现有记录浏览；不得将 HTML 路径显示成 YAML 源文件，或承诺 task / flow 导航。

### 6.5 调研证据

以下链接记录调研阶段的实现与测试依据；实际运行结果见末尾实施记录。

- [Case 视图模型](../src/components/test-runner/model.ts)、[File 视图模型](../src/components/test-runner/overview-model.ts)、[Project → File → Case 渲染](../src/components/test-runner/project-breakdown.tsx)：原总览直接展示 Project 下的 Case，本次增加独立 File 层级。
- [共享报告类型](../../../packages/core/src/test-run-report.ts)：已包含 documents、cases、plans、文档尝试历史与作用域错误。
- [原生文件发现与计划准备](../../../packages/test/src/cli/project-preparation.ts)、[执行结果顺序恢复](../../../packages/test/src/cli/run-prepared-project.ts)：定义 File 排序的来源。
- [旧 tasks / flow 编译](../../../packages/core/src/yaml/test-runner-compat.ts)：task → Case、flow → Step、合成 Project 和 File 身份。
- [旧 YAML 执行记录](../../../packages/core/src/yaml/legacy-yaml-execution-record.ts)、[Player](../../../packages/core/src/yaml/player.ts)：真实时长、宿主错误及当前 attemptIndex。
- [旧 YAML 报告发布](../../../packages/core/src/yaml/legacy-yaml-report.ts)、[共享执行记录投影](../../../packages/core/src/test-runner/reporting/execution-record.ts)：已使用共享报告输入。
- [旧 CLI 批量执行](../../../packages/cli/src/yaml-batch-executor.ts)、[文件汇总和重试报告](../../../packages/cli/src/execution-summary.ts)：文件级状态、每轮重建 Player、summary 引用和通用合并。
- [报告合并](../../../packages/core/src/test-runner/reporting/merge-report.ts)：来源隔离和 Agent-only fallback。
- [原生 YAML 格式边界](../../../packages/test/src/parser/collect.ts)：旧格式仍由旧命令执行。
- [旧 YAML 共享协议测试](../tests/legacy-yaml-report.test.ts)：已有真实 ReportGenerator 测试验证 Case / Step 路由、Agent execution ID、截图与记录关联。
- [源码定位](../src/components/test-runner/yaml-source.ts)：当前原文步骤匹配针对 cases / steps。

## 7. 实施顺序

1. **File 视图模型与统计**：先覆盖多文件、零 Case、收集错误、文件生命周期错误、未执行、重试与重复调用；不改变执行协议语义。
2. **总览结构**：Project 独立表格、File 展开与 Case 展示，复用现有详情导航和记录预览。
3. **筛选与排序**：替换两个下拉框，落实复选框状态机、列头排序、稳定展开状态和匹配计数。
4. **原生报告验收**：使用主演示和固定夹具验证多 Project、多 File，以及失败定位、Compact / Detailed、明暗主题和窄屏。
5. **旧链路分层验收**：先确认新生成的单次旧 YAML 报告可用；另行落实 CLI batch / 整文件 retry 适配后，再承诺统一批量报告。
6. **同步文档**：更新 report e2e 中英文说明与涉及的站点中英文报告文档，说明 Case 与 File 计数、Retried 含义和旧入口支持范围。

## 8. 验收与测试清单

- 多 Project 分表；同 Project 下多个 File；同 basename 不同路径；同文件跨 Project；同文件独立调用不被误合并。
- 空文件、收集失败、Project setup 失败、File setup / teardown 失败，以及全部 Case 通过但 File 失败，均可见且计数正确。
- All 与具体复选框互斥；具体状态多选 OR；取消最后一个恢复 All；Not run 只在 All 或受影响上下文出现。
- Failed 文件只有 Not run Case 时仍能找到文件错误；零 Case 文件错误不计入 Failed Case 数。
- 搜索与状态筛选 AND；父级名称命中；筛选后全量通过率稳定，匹配数量单独展示。
- File 默认与 Markdown 文档顺序一致，可切换正反序；文件内 Case 保持 caseIndex 顺序。
- 每个 Project 独立排序；其他列正反序、未知值始终置后、相同值稳定；排序不改变 Project 顺序或打散 File / Case。
- Compact / Detailed 的结果集合一致；来回进入详情保留筛选、排序和展开状态；失败步骤自动定位保持有效。
- 明暗主题、长文件名、长 Case 名称、键盘操作、窄屏及表格列对齐。
- 旧 YAML 单文件多 task、continueOnError、初始化 / 清理异常、内联 YAML，以及真实 Agent 记录关联。
- 旧 CLI 适配阶段另测多文件 batch、整文件 retry、setup 阻塞、缺失单轮报告、重复独立执行和文件数 / task 数区分。
- Agent-only 来源不虚构 YAML 与 Step；历史 HTML 通过重新生成验证新行为。

实现时优先扩展邻近的 model、组件和共享协议单元测试；页面 e2e 继续保留既有 aiAssert / aiTap 等真实用户路径覆盖。按实际改动运行最小相关 Nx 测试目标；涉及共享发布链路时增加 core / cli / test 对应验证与必要构建。提交前运行仓库要求的 `pnpm run lint`，并在 PR 列出实际执行命令。

## 9. 实施与验证记录

已增加独立 File 视图模型，替换总览分组、筛选、排序和样式；筛选、排序与展开状态提升到报告根组件，详情返回时保留。删除原有平铺分组、状态 / 排序下拉框及其过时样式和测试，Case 详情沿用既有实现。已同步 report e2e 中英文说明与站点中英文使用文档。

补充计划文件与缺失 Case、收集错误、File / Case 重试差异、稳定排序和语义表格测试。旧 YAML 覆盖真实 ScriptPlayer 的多 task、continueOnError、阻塞后续 task、宿主 setup / cleanup 异常和 Agent 记录关联；初始化和清理异常只归属 File，不伪造 YAML hook。

实际验证：

- `NX_DAEMON=false pnpm exec nx test @midscene/report`：41 个测试文件、322 个测试通过。
- `NX_DAEMON=false pnpm exec nx build @midscene/report`：构建及 TypeScript 检查通过。
- `pnpm exec node packages/cli/bin/midscene /tmp/report-file-overview-e2e --concurrent 2`：4 组报告浏览器测试、11 个任务通过，保留真实 `aiAssert` / `aiTap` / `aiHover`。临时目录是 `midscene-test-report.yaml`、`midscene-test-overview.yaml`、lifecycle、late-failure 四份用例的本地预览路径版本。
- 用本地主演示的真实执行数据验证 4 个 Project、10 个 File、10 个 Case；核对 Compact / Detailed、桌面明暗主题和 390px 窄屏。用收集错误和空文件夹具核对未知值、零耗时及错误作用域。
- 用旧 `tasks / flow` 的真实报告重新组装新版预览，确认一个真实 YAML File 下保留两个 task Case 和原记录关联；未把独立报告或整文件重跑推断成规范 Case 重试。
- `pnpm run lint`：已执行，但仓库整体检查被受保护的 `.agents/skills/impeccable` 目录权限阻断（`Operation not permitted`）；未修改该目录。本次报告相关文件的定向 Biome / Prettier 检查通过。

最后一轮复核统一了 File 错误文案、加深 Case 层级缩进、区分空文件与筛选无匹配提示、增强复选框边界；并增加回归，避免把子 Case 失败导致的 Project 聚合失败重复统计成独立 Project 错误。

样式对齐记录：表格复用旧版字体、字重、定宽状态标签、实心展开箭头、双向排序指示、表头分隔及内缩行分割线。移除额外百分比、逐文件筛选匹配提示和 Case 行错误摘要；复选框保留多选语义，改为独立的轻量选项，窄屏排成两列。新增回归验证精简后的行内容和排序双箭头；`pnpm exec node packages/cli/bin/midscene /tmp/report-overview-style-e2e.yaml --concurrent 1` 的三个总览浏览器任务通过。临时用例是 `midscene-test-overview.yaml` 的本地预览路径版本。

后续细化：将 Projects / Files 放到左侧运行信息中，删去 Project 标题的文件数和筛选下方重复的 Case 数。File 列改为可切换正反序；其默认顺序采用报告 `project.documents` 顺序，和主分支 Markdown 结果的文档分组一致。每个 Project 各自保存排序状态。定向 322 个 report 单测、report 构建，以及更新后的三个总览浏览器任务均通过；浏览器任务覆盖了两个 Project 的独立排序、File 正反序及详情返回后的状态保留。
