This is the documentation for the Midscene (an SDK for AI automation)

In this file you can get a list of all the docs and their links: ./rspress.config.ts

All the english docs are in the `docs/en` folder, and the chinese docs are in the `docs/zh` folder. All the modifications should be synchronized at both places.

一些中文翻译规范：

- Key：保持原样或使用 “API Key”，不要翻译，不要写成“凭证”。
- Agent：如果指的是 AI Agent 或 Midscene Agent，保持原样，不要翻译，更不要翻译成“代理”。

Device 生命周期规范：

- 每个 Device 实例只能归属于一个 Agent。
- 文档和示例不得把同一个 Device 实例传给多个 Agent，也不得在 Agent 结束后复用该 Device 实例。
- `Agent.destroy()` 会调用 `Device.destroy()`。对于使用 Device 的 Agent，应为每个 Agent 创建独立的 Device 实例。该 Agent 独占并负责 Device 的完整生命周期。

提示框样式规范：

- 普通提示框统一使用 `:::info`（蓝色），不要使用 `:::tip`（绿色）。
- 风险和错误提示仍应根据语义使用 `:::warning` 或 `:::danger`。

推荐模型名称规范：

- README、introduction 等面向用户的支持或推荐模型列表可以使用模型系列或版本名称，例如 `Qwen3.x`、`Doubao-Seed-2.1`，无需使用可直接配置的精确模型名称。
- 只有环境变量中的模型配置项需要使用精确值，例如 `MIDSCENE_MODEL_NAME`、`MIDSCENE_MODEL_FAMILY`、`MIDSCENE_PLANNING_MODEL_NAME` 和 `MIDSCENE_INSIGHT_MODEL_NAME`。这些值必须与 `model-common-config.mdx` 保持一致。

写作风格：

- 文档应当务实，有技术品味：用机制、约束和示例打动用户，不要用华丽的词强行拔高。
- 避免营销腔和评价先行。程度副词（如「完美」「极致」「彻底」）和成语叠用（如「各司其职」「相辅相成」）如果只是在给架构打分、不增加信息，应删掉。
- 句子负责陈述事实和对应关系，价值判断交给后文的设计说明。中英文同步修改时，英文同样避免 `perfectly`、`seamlessly`、`empowers` 这类空评价。

反例 1（`docs/zh/test-runner-overview.mdx`）：

> 它将测试框架划分为两种相辅相成的对等能力，各司其职，完美契合了测试团队中的两种核心视角：

「完美契合」评价先于事实，「各司其职」「相辅相成」也不增加信息。应改成直接陈述对应关系：

> 它将测试框架划分为两种能力，分别对应测试团队中的两类工作：

反例 2（`docs/zh/test-runner-overview.mdx`）：

> Midscene 提供了开箱即用的内置原子能力（如 `aiAct`、`aiAssert` 等），支持零配置快速上手。同时，它也具备极高的扩展上限。面对复杂业务场景时，工程搭建者可以使用 TypeScript 自定义专属的原子节点（自定义 Node），将复杂的业务接口、数据准备或特定工具链进行高内聚封装。这些自定义节点可以直接在 YAML 用例中调用，在保持极简上手体验的同时，让测试工程能够应对复杂的定制化场景。

「极高的扩展上限」、「高内聚封装」、「极简上手体验」等词汇偏向营销腔，且「如 `aiAct`、`aiAssert` 等」不够准确。应改成逻辑分段清晰、陈述客观事实的表达：

> Midscene 提供了开箱即用的内置原子能力（不仅包含 `aiAct`、`aiAssert` 等 AI 交互，还包括环境初始化、设备与浏览器配置等），支持零配置快速上手。
> 
> 为了应对复杂的业务场景，Midscene 支持通过 TypeScript 自定义原子节点（自定义 Node）。你可以将业务接口、数据准备或特定工具链进行封装，并在 YAML 用例中直接调用。这在保持 YAML 脚本简洁的同时，也使测试工程能够应对定制化的业务场景。
