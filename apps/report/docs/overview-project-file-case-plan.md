# Report Overview：Project → File → Case 改造记录

状态：原计划已完成并归档。后续首页样式改版以左侧 Project 导航、右侧单个 Project 的 File / Case 表格为准，不再采用多个 Project 同时分表的布局。

当前使用说明统一维护在[中文文档](../../site/docs/zh/midscene-test/use.mdx#查看测试结果)和[英文文档](../../site/docs/en/midscene-test/use.mdx#view-test-results)。这里保留改造边界和实现入口，不重复维护界面清单、测试数量或本地验收日志。

## 改造边界

- 增加 File 视图层，直接读取 Project 的 documents、plans 和 collectionErrors。不能只按展平 Case 的路径分组，否则空文件、未执行文件和收集失败的文件会丢失。
- Case 数和文件数分别统计。File 的最终结果包含文件初始化、清理错误；即使所有 Case 通过，File 仍可能失败。作用域错误不能伪装成失败 Case。
- Project 导航按最终结果分组，同组内沿用报告顺序。每个 Project 独立保存排序；Files 正序沿用报告文档顺序，与 Markdown 结果保持一致，倒序反转该顺序。
- 搜索覆盖全报告，状态筛选作用于选中的 Project。Compact / Detailed 使用同一结果集合；Detailed 增加简短错误或未执行原因和完整截图时间线。
- 总览改造不改变 YAML 执行语义、失败处理、Case / Step 路由或失败步骤自动定位。

## 旧 YAML 兼容边界

旧 `tasks / flow` 新生成的报告沿用同一页面：task 对应 Case，flow 条目对应 Step；内联输入显示为 Inline YAML。宿主初始化、清理异常归属 File，不虚构原 YAML 中不存在的 hook。

旧 CLI batch 和整文件 retry 的统一发布适配是独立工作。Overview 不按文件路径把独立执行推断成同一逻辑 Project，也不把整文件重试推断成规范的 Case 重试历史。

只有 Agent dump 的来源保留 Source report / Agent report 身份，不声称存在真实 YAML 文件和 Runner Step。仅在存在原文快照时提供 YAML 视图。历史 HTML 需重新生成才能使用新版页面；不为旧报告序列化格式添加兼容层。

## 代码与验证入口

- [总览视图模型](../src/components/test-runner/overview-model.ts)：File 身份、统计、筛选、排序和 Detailed 摘要。
- [总览页面](../src/components/test-runner/run-overview.tsx)、[Project 导航](../src/components/test-runner/project-navigation.tsx)、[File / Case 表格](../src/components/test-runner/project-breakdown.tsx)：布局和交互。
- [页面样式入口](../src/components/test-runner/index.less)：共享状态标签独立维护在 status-badge.less；首页布局、表格和空态集中在 figma-overview.less。
- [总览单元测试](../src/components/test-runner/overview-model.test.tsx)：作用域错误、Not run 上下文、空文件、统计、排序和摘要。
- [旧 YAML 报告测试](../tests/legacy-yaml-report.test.ts)：真实执行结果、路由与 Agent 记录关联。
- [总览浏览器用例](../e2e/midscene-test-overview.yaml)、[报告浏览器用例](../e2e/midscene-test-report.yaml)：项目选择、独立排序、筛选、详情返回、时间线和失败定位。保留 aiAssert / aiTap / aiHover 路径，DOM 检查仅用于列对齐和溢出等布局机制。

验证命令与本地开发流程见仓库 [CONTRIBUTING.md](../../../CONTRIBUTING.md)。具体测试步骤和夹具直接以代码为准。
