# Report 回归测试

[English](./README.md)

Report 包含两条查看路径：按 Project/File/Case 展示的 **Test Report**，以及可独立打开或嵌入 Case 的 **Record** 标签页的 Agent 查看器。修改共享样式时，需要覆盖这两条路径。

## 运行检查

在仓库根目录执行：

```sh
pnpm exec nx test @midscene/report
pnpm exec nx build @midscene/report
pnpm run lint
```

report 单元测试也会解析所有 E2E YAML 文件。解析通过不代表浏览器场景或 AI 断言已执行。

配置好模型和浏览器环境后，运行完整浏览器测试：

```sh
pnpm --filter @midscene/report e2e
```

该命令会构建 Report 和 CLI、校验 Core 内嵌的报告模板，运行真实模型驱动的演示流程、生成测试报告，再执行 YAML 测试，会产生模型调用。生成报告后，可定向重跑：

```sh
cd apps/report
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-report.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-lifecycle.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-overview.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-late-failure.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/timeline-interaction.yaml
```

修改界面后需重新构建 Report 并生成测试报告。已有 HTML 内嵌了自己的界面，不会自动应用源码中的修改。
定向重跑命令从 `apps/report` 执行；需在那里导出模型环境变量，或通过 Node 的 `--env-file=../../.env` 选项显式加载根目录的 `.env`。

## 覆盖范围

| 场景                                                                                      | 测试报告                               | 主要检查                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `midscene-test-report.yaml`                                                               | `demo-midscene-test.html`              | File 层级与复选框筛选、Compact/Detailed 列表、重试、Execution 表头、统一 Step 列表、Record/Information/Events、分栏上限和重置、浅色/深色 Events |
| `midscene-test-lifecycle.yaml`                                                            | `demo-midscene-test-lifecycle.html`    | 初始化失败、受阻 Case、清理错误和问题抽屉                                                                                                       |
| `midscene-test-overview.yaml`                                                             | `demo-midscene-test-overview.html`     | 多 Project 分表、File 错误与受影响 Case、空文件、复选框多选、各 Project 独立排序、与 Markdown 一致的文件顺序、未知值及返回详情后状态保留        |
| `midscene-test-late-failure.yaml`                                                         | `demo-midscene-test-late-failure.html` | 打开失败 Case 后，无需手动滚动即可看到列表末尾选中的 Step 及其错误                                                                              |
| `timeline-interaction.yaml`                                                               | `demo.html`                            | 旧 YAML 打开 Test Report，选择时间线截图后显示所属 Step 的 Record                                                                               |
| `report-single.yaml`、`sidebar-navigation.yaml`、`detail-panel.yaml`、`theme-toggle.yaml` | `demo-agent.html`                      | 独立 Agent 的任务列表、耗时、回放、详情、Markdown 和主题                                                                                        |
| `report-mobile.yaml`、`player-only.yaml`                                                  | `demo-agent.html`                      | 窄屏 Steps/Player 切换、信息抽屉和仅播放器模式                                                                                                  |
| `report-merged.yaml`                                                                      | `demo-merged.html`                     | 合并 Agent 报告的 Case 选择和状态筛选                                                                                                           |

使用当前可见标签 **Test Report**、**Information** 和 **Events**。Attempts 与 Visual/YAML 位于 Execution 表头；Case 清理错误仍在 Execution 上方，Step 错误则在详情标签页上方。
Events 使用 **Run step**、**Started**、**Finished** 等易读文案；原始 Operation/Event 名称保留在悬浮提示中，不作为单元格正文展示。
分栏测试通过 DOM 检查验证宽度变化、上下限和复位数值，通过 AI 断言验证选中 Step、录制任务列表和截图查看器仍然可见。不要让单张截图证明“比之前更宽”等需要前后比较的变化。

保留 `aiAssert`、`aiTap` 和 `aiHover` 的界面断言与导航覆盖。`javascript` 仅用于历史导航、分栏键盘事件等确定性的 DOM 行为。进入失败 Case 的回归场景不能手动滚动到失败步骤，否则会掩盖自动定位失效的问题。

`fixtures/test-report.mjs` 使用真实 Agent 录屏，并保持模拟的层级和生命周期结果确定。生成的 HTML 放在被忽略的 `dist/` 中；应修改测试数据源码并重新生成，不能直接改 HTML。

Test Report 的主题变量位于 `src/components/test-runner/tokens.less`。`index.less` 依次导入共享结构、页面布局、响应式规则、Select，最后导入错误卡片样式。需保留这个级联顺序。对样式源码的单元断言不能替代实际布局的浏览器检查。
