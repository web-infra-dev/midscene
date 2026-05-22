# Backlogs

- Action Record 的 YAML 入口设计：本轮只实现 JS API，YAML 中如何开启 `record`、如何引用上一个 action result 继续做 `aiAssert`/`aiQuery`，需要后续单独设计。
- Action Record 文档补充：代码落地后需要在公开文档中补充 `record` 参数、`ActionResult`/`ActionRecord` 返回类型、默认 `interval: 1000`/`maxCount: 5`、以及 `await result.aiAssert('过程中出现 toast')` 这类 toast 断言示例。
- Action Record 参数语义调整：`maxCount` 命名偏截图实现细节，若未来支持视频或其他 record 形态不够通用；并且截图持续失败时，按 count 补采可能拖到后续长等待结束。后续考虑改为 `maxDuration`，默认可对应当前约 5s 窗口，语义是从 action 真正执行完成后开始最多录制多久，超过窗口后停止采样尝试。
