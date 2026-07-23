# Midscene 文档语言切换测试

本项目使用 Playwright 和 Midscene Web 测试 Midscene 文档站。YAML 用例先将 UA 语言设为英文，再进入文档页并检查页面语言。随后，用例将 UA 语言切换为中文，并再次检查页面语言。

这个示例演示以下能力：

- 注册 `browser.setLanguage` 自定义节点，并通过 YAML 传入 `language: en` 或 `language: zh`。
- 通过根 `setup` 配置隐式的 `default` Project，一次性创建浏览器和页面，并在 Project 结束时按逆序释放资源。Agent 会在首次运行 Midscene Node 时创建。
- 切换 UA 语言时创建新的 Playwright Context，并让后续 Agent 使用新页面。
- 在 YAML 中组合自定义节点、`aiAct` 和 `aiAssert`。
- 为 AI 步骤设置独立的超时时间。

模型配置从当前进程的环境变量读取。默认使用无头模式。设置 `HEADLESS=false` 可以显示浏览器窗口。

在仓库根目录运行：

```bash
packages/test/bin/midscene-test packages/test/example/web-midscene
```

命令行会实时输出 Project、文档、用例、attempt、生命周期和 Step 的执行进度。公开摘要和报告保存在 `midscene_run`，详细 fact 文件保存在 `.midscene/test-results`。
