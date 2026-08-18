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
