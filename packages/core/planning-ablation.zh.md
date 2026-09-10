# Planning 组件实验

[English](./planning-ablation.md)

标准 Planning 不再接受 `deepThink` 或 `effort` 总模式参数。所有组件默认开启，通过 `MIDSCENE_PLANNING_DISABLE_PARTS` 独立关闭。SDK、MCP/CLI、Playground 使用同一机制，无需修改 YAML 配置结构。

```bash
# 每组独立进程；基准与消融组使用相同缓存和记录设置
export MIDSCENE_CACHE=false
export MIDSCENE_RECORD_MODEL_CALL=1

# 完整基准
export MIDSCENE_PLANNING_DISABLE_PARTS=
# 关闭子目标：能力、独立示例、多轮示例中的相关内容一起关闭
export MIDSCENE_PLANNING_DISABLE_PARTS=subGoals
# 联合消融
export MIDSCENE_PLANNING_DISABLE_PARTS=subGoals,memory
```

选择一项设置后运行原来的 benchmark 命令。只接受下表列出的组件名，多项以逗号分隔。组件名区分大小写，允许空白与重复项，未知名称报错。每次 `aiAct` 在入口读取并冻结配置；运行期间修改环境不会影响已经开始的调用。

## 组件

| 名称 | 关闭后的变化 |
| --- | --- |
| `taskScope` | 任务范围限制及其示例、Input 参数提示 |
| `durableCompletion` | 保存、提交、应用等持久化完成要求 |
| `processEvidence` | 执行证据要求及首次规划的无历史提醒 |
| `observationGuidance` | 局部视图、缩略图等详细观察建议，以及目标不可见时先寻找的示例 |
| `planningText` | 规划文本及其示例、解析结果、回放 |
| `subGoals` | 子目标提示、全部所属示例、更新、完成标记、状态、日志分组与回放；关闭后仍启用的 log 使用平铺历史 |
| `memory` | memory 提示、全部所属示例、输出、写入、摘要与回放 |
| `log` | 模型 log 提示、全部所属示例、输出、分组或平铺摘要与回放 |
| `screenshotHistory` | 上一张截图：由保留最近两张改为只保留最新截图 |
| `separateLocate` | Planning/Locate 分开调用：使用默认模型时合并定位；显式配置独立 Planning 模型时仍保持分开 |
| `scrollableOptions` | 下拉选项搜索及渐进滚动建议 |
| `inputVerification` | 不通过截图重复检查输入结果的特殊规则 |
| `assertionTiming` | 断言失败及等待加载规则和示例 |
| `recoveryGuidance` | 重试、恢复建议及所属示例 |
| `adbPreference` | 优先使用 RunAdbShell 的建议，保留动作本身 |
| `sliderSwipe` | 滑块优先 Swipe 的建议及 Swipe 描述中的滑块示例 |
| `incrementalEdit` | 最小编辑、光标策略、对应恢复及 Input.mode 提示 |
| `crossPageNavigation` | 自主跨页导航：关闭后加入当前页限制及对应示例；用户明确要求的导航仍允许 |
| `groundingGuidance` | 本次 aiAct 的 Planning、独立 Locate 及适用回退中的共享定位规则 |
| `returnFormatReminder` | 末尾重复的 Return Format 说明 |
| `multiTurnExample` | 整个多轮表单示例 |

## 能力与示例的归属

`subGoalExample` 已删除，不能再单独配置。`subGoals` 一项覆盖提示、独立子目标示例、多轮示例中的子目标及状态回放。memory、log、planningText、taskScope、recoveryGuidance、sliderSwipe、incrementalEdit 的所属示例也随能力关闭。共享示例保留其他仍启用能力的内容。

`ruleExamples` 已删除。规则示例分别归属 `taskScope`、`subGoals`、`memory`、`log`、`observationGuidance`、`assertionTiming`、`recoveryGuidance`，随所属组件一起开关。目标不可见时先寻找的示例归属 `observationGuidance`；恢复示例归属 `recoveryGuidance`，关闭 `log` 时只去掉其 XML 标签，保留原始示例文字。当前页限制及其示例在 `crossPageNavigation` 关闭时一起出现。

`actionDescriptions` 和 `actionExamples` 不再是可配置组件。标准 Planning 提示词始终保留动作及参数的基础说明、动作样例、样例格式提示和独立 Tap/error 示例，即使关闭所有可选组件也不会移除。说明中的策略句仍由所属组件 `taskScope`、`incrementalEdit`、`sliderSwipe` 控制。

已有 `MIDSCENE_PLANNING_DISABLE_PARTS` 配置需要删掉 `actionDescriptions`、`actionExamples` 和 `ruleExamples`，否则会按未知组件报错。

`multiTurnExample` 控制整个多轮表单示例，其中每个组件的内容仍随所属组件关闭。关闭多轮示例不会移除各组件的独立示例。动作偏好不是动作本身，例如关闭 `sliderSwipe` 会删除滑块建议与滑块示例，但仍保留通用 Swipe 能力及其非滑块样例。

默认全开基准保持现有 Planning 提示词的原文和顺序。组件划分与开关不改写规则、示例、日志措辞或执行反馈；关闭组件只移除该组件所属的内容和行为。

## 替代旧模式与实验边界

完整基准默认保留子目标、memory、观察建议、两张截图、独立定位和跨页导航。以下组合覆盖旧 `deepThink=false` 对应的机制选择，不再通过另一个总开关实现：

```bash
export MIDSCENE_PLANNING_DISABLE_PARTS=subGoals,memory,observationGuidance,screenshotHistory,separateLocate,crossPageNavigation
```

该组合使用平铺日志、单张截图，并在没有独立 Planning 模型时合并定位。它是机制对应关系，不承诺与旧版本字节相同：旧模式在未提示 memory 时仍可能接受模型自发输出；现在关闭 memory 后，其有效输出、状态与回放都会被屏蔽。

模型即使输出已关闭字段，也不能写入有效状态或进入后续框架回放。报告保留原始 `rawResponse`/`rawChoiceMessage`。Action JSON 中的用户输入及 complete/error 的结果文字不按标签关键字删除；无法安全识别 Action JSON 边界的畸形响应进入现有解析失败/重试流程。

除本组明确修改的组件外，固定用户任务与上下文、真实执行反馈、动作能力、模型及温度、截图预处理、步数上限、历史压缩和评判规则。关闭 `<planning>` 不控制供应商 thinking。关闭 memory 测试显式 memory 机制，不会消除模型从保留的动作、截图、普通文本获取的信息。

组件实验仅适用于标准 Midscene Planning 协议。自定义 Planning 在未设置组件屏蔽时沿用自己的协议；显式组件屏蔽会在推理前报错。替换核心构造函数的标准协议也不支持实验。要求原样回放 assistant message 的适配器不支持字段消融；自定义 Locate 不支持 `groundingGuidance` 消融。

所有组都应禁用缓存。Agent 显式 cache 对象可能覆盖 `MIDSCENE_CACHE=false`，此时组件实验会报错；应在公共入口关闭该配置，或各组统一使用 `cacheable: false`。

报告 Planning 参数记录 `includeSubGoals`、`includeLocateInPlanning`、`imagesIncludeCount` 和禁用组件列表 `disabledPlanningParts`（为空时省略）。用 `MIDSCENE_RECORD_MODEL_CALL=1` 核查 runDir 下的 `model-requests`，不要只检查环境变量。

先做完整基准和单项消融，再测试有信号的组合。固定任务与重复次数，记录成功率、模型调用数、token、耗时、无效输出及基础设施失败。单项消融只能估计组件在完整系统中的贡献，不能单独识别所有交互效应，也不能直接称为正交试验。
