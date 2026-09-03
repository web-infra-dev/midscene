# 排行榜筛选 Feature

本 Feature 的 Case 不是手写脚本，而是生成 Agent 根据以下输入产出的 YAML：

- [产品要求](./product-requirements.md)：测试目标和预期结果。
- [Node 能力说明](../../midscene-nodes.md)：根据当前 Test Project 的 Node 定义和输入 Schema 自动生成。
- [参考提示词](./generate-cases-prompt.md)：供生成 Case 的 Agent 直接消费并按策略调整。

以下信息不是这批 Case 的生成输入，而是执行时由 Midscene 消费的 App Context：

- [页面跳转 Context](../../app-context/page-navigation.md)：页面入口、层级和跨页面路径。
- [排行榜组件 Context](../../app-context/ranking-components.md)：榜单、筛选和自定义价格组件的使用方式。

生成产物是 [ranking-filtering.yaml](../../test-runner/ranking-filtering.yaml)。价格调整场景的截图、Context 定义和两种组织方式集中写在 [AI 测试最佳实践](https://midscenejs.com/zh/test-runner-best-practices)，这里不再重复。

运行时，页面跳转、组件使用和当前年月作为 `aiAct` 的 API 级 Context；YAML 中的 `options.context` 只补充对应 Step。Test Runner 的 workflow history 是另行追加的只读框架信息，不会覆盖上述 App Context。

## 真实运行结果

2026-08-28 在 Android 真机运行该 YAML，5 个 Case 全部通过，未发生重试，总耗时约 14 分 41 秒。页面重置、组合筛选、榜单切换、自定义价格和最终检查均正常完成。

运行后的 HTML 报告保存在 `midscene_run/report/`，其中包含 5 个 Case 的规划、操作、截图和检查结果。用于讲解 Context 的关键界面截图保留在上述最佳实践文档中。
