# Backlogs

- 验证 `gui-plus-2026-02-26` PC 端返回坐标是否稳定为 0-1000 归一化坐标。当前接入先按 1000 归一化处理，后续需要用真实截图和模型调用确认点击偏移。
- 评估是否继续接入 `gui-plus-2026-02-26` 的 `browser_use` 协议。当前只接 PC `computer_use`，浏览器端 SoM label 到元素/坐标的链路还未实现。
## MAI-UI adaptor 后续验证

- 背景：已新增 `mai-ui` custom planning adaptor，并让 locate 从 planning tap 结果中提取定位结果。
- 下一步：用真实 MAI-UI 服务和设备验证 `swipe.direction` 与 Midscene `Scroll.direction` 的语义是否一致；如果方向相反，只调整 `packages/core/src/ai-model/models/mai-ui/actions.ts` 中的映射。
- 下一步：验证 MAI-UI 的 `SCALE_FACTOR = 999` 坐标协议在真实模型和设备上的表现；接入侧目前按 MAI-UI Python demo 的实际实现使用 `normalizedBy: 999`。
- 下一步：确认 MAI-UI 的 `ask_user` 和 MCP tool call 是否需要映射到 Midscene 现有 action space，当前实现会对这些 action 明确抛错，避免静默误执行。
- 搁置原因：本轮只做 adapter 接入和 unit/build 验证，没有运行真实模型或设备自动化。
