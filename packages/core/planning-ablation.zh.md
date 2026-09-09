# Planning 组件消融实验

[English](./planning-ablation.md)

通过一个环境变量控制标准 Planning 的组件，不需要修改 YAML，也没有新增 `aiAct` 配置项。

```bash
# 每个实验组都使用相同的缓存设置，在独立进程中运行同一套任务。
export MIDSCENE_CACHE=false
export MIDSCENE_RECORD_MODEL_CALL=1

# 完整基线：空字符串或不设置变量，保留当前行为。
export MIDSCENE_PLANNING_DISABLE_PARTS=

# 单独关闭 memory。
export MIDSCENE_PLANNING_DISABLE_PARTS=memory

# 联合关闭两个组件。
export MIDSCENE_PLANNING_DISABLE_PARTS=memory,subGoals

# 关闭全部示例。
export MIDSCENE_PLANNING_DISABLE_PARTS=examples
```

每次选择一种配置，然后启动原来的 benchmark 命令。CSV 中的名称区分大小写；允许空格和重复项；未知名称直接报错。设置在 `aiAct` 开始时读取并冻结，执行中修改环境变量不会改变该次实验。下一次 `aiAct` 会重新读取。

## 可关闭的组件

| 名称 | 关闭的内容 |
| --- | --- |
| `taskScope` | 严格任务范围提示、只执行用户要求的限制及相关例子，包括 Input 参数中的同义提示 |
| `durableCompletion` | 保存、提交、应用等持久变更完成标准 |
| `processEvidence` | 必须用执行历史证明指定步骤完成的提示，包括首次调用的无历史提醒 |
| `observationGuidance` | 对缩略图、局部视图、精确细节的观察建议 |
| `planningText` | `<planning>` 提示、示例、有效解析结果和回放 |
| `subGoals` | 子目标拆分、状态更新、完成标记、示例及子目标历史组织 |
| `memory` | 记忆提示、示例、有效结果、写入、汇总注入和回放 |
| `log` | 模型 preamble、动作派生日志、子目标/平铺日志汇总和回放 |
| `scrollableOptions` | 下拉列表搜索、小幅滚动和选择策略 |
| `inputVerification` | 输入后不按截图重新校验文字的特殊规则 |
| `assertionTiming` | 断言失败和等待加载后再断言的提示 |
| `recoveryGuidance` | 通用重试/恢复建议及日志中的恢复示例 |
| `adbPreference` | 优先使用 RunAdbShell 的建议；保留动作能力 |
| `sliderSwipe` | 滑块优先 Swipe 的提示，包括 Swipe 描述中的滑块示例 |
| `incrementalEdit` | 最小字符编辑、光标移动策略和该策略专属的失败恢复建议，包括 Input.mode 中的强化提示 |
| `navigationRestriction` | 限制在当前页面完成任务的提示 |
| `actionDescriptions` | 动作和参数的描述性文字；保留名称、类型、默认值、可选性、定位坐标格式和执行实现 |
| `groundingGuidance` | 同次 aiAct 中的公共七条元素定位规则，覆盖 Planning 内联定位、独立 Locate 及适用的定位 fallback |
| `returnFormatReminder` | 最后的 Return Format 重复说明；保留前面的基础输出协议 |
| `ruleExamples` | 规则中的短解释例子、memory 示例和 log 示例 |
| `subGoalExample` | 登录/待办/注册的长子目标示例 |
| `actionExamples` | 动作列表里的 sample，以及单独的 Tap/error 输出示例 |
| `multiTurnExample` | 完整五轮表单演示 |

以下名称是组合别名，保存到报告时展开为具体组件：

| 组合 | 包含的组件 |
| --- | --- |
| `taskSemantics` | `taskScope,durableCompletion,processEvidence` |
| `uiCases` | `scrollableOptions,inputVerification,assertionTiming` |
| `actionStrategies` | `recoveryGuidance,adbPreference,sliderSwipe,incrementalEdit,navigationRestriction` |
| `examples` | `ruleExamples,subGoalExample,actionExamples,multiTurnExample` |

## 完整屏蔽与控制变量

关闭字段类组件时，模型即使仍输出对应标签，也不会产生有效状态或进入后续框架回放。报告中的 `rawResponse`/`rawChoiceMessage` 保留原始输出，便于核查模型是否仍在输出被关闭的字段。Action JSON 中的用户输入和 complete/error 的结果文本不按标签关键字删除。无法安全识别 Action JSON 边界的畸形响应会进入现有解析失败/重试流程，避免误删用户数据或漏回放。

原始用户指令、用户提供的上下文、真实执行反馈、动作能力、坐标协议、模型路由、截图数量和预处理、步数上限、历史压缩策略保持原有设置。关闭 `<planning>` 不等于关闭供应商的 reasoning/thinking。关闭 memory 也不等于消除模型从保留的动作、截图和普通文本中获取的信息；这个实验测量的是显式 memory 机制。

先按原来的 effort 确定基线，再应用屏蔽。测试子目标、memory 提示或观察提示时，应使用本来就包含这些内容的 deepThink 基线，并让各组保持相同 effort。关闭子目标不会切换到 balance，也不会启用 balance 的平铺日志来补偿；仍启用的 log 通过原有 assistant 字段回放。相互嵌套的例子随其所属组件一起删除，例如 memory 关闭会移除 memory 示例，即使 `ruleExamples` 仍启用。

该变量用于标准 Midscene Planning 协议。自定义 Planning、替换了关键构造函数的标准协议不支持此实验。要求原样回放整个 assistant message 的适配器不支持 `memory/subGoals/planningText/log` 消融；使用自定义 Locate 时不支持 `groundingGuidance`。这些情况在推理前报错，避免开关看似生效但实际残留。

实验组必须关闭缓存，防止旧计划跳过 Planning 或旧定位缓存绕过 Grounding。若 Agent 显式配置了 cache 对象，它可能覆盖 `MIDSCENE_CACHE=false`；此时会报错，需要在公共实验入口统一关闭该配置，或统一使用既有的 `cacheable: false`。不要只对某个消融组改变缓存、effort、任务集、模型、温度、步数上限或评判规则。

Planning 任务参数中的 `disabledPlanningParts` 保存展开后的实际配置；空基线不新增该字段。Node 下的 `MIDSCENE_RECORD_MODEL_CALL=1` 可记录实际模型请求，请核查对应 runDir 的 `model-requests` 文件，而不只看环境变量。

建议先跑完整基线和逐项消融，再针对有信号的组件做联合实验。每组使用相同任务和重复次数，记录任务成功率、模型调用数、输入/输出 token、耗时、无效输出和基础设施失败。逐项消融评估的是“在当前完整系统中移除该组件的影响”；不能单凭它估计所有组件之间的交互，也不能将其直接称为正交试验。
