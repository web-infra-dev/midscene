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
