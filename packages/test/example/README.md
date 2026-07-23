# Test Project 示例

本目录包含多个独立的 Test Project。每个子目录都有自己的项目配置和 YAML 文件。

目前包含以下示例：

- `web-midscene`：使用 Playwright 和 Midscene Web 检查 Midscene 文档页是否跟随 UA 语言显示英文或中文。这个示例包含自定义节点、生命周期和 AI 断言。

在仓库根目录安装依赖并完成构建后，可以运行指定的子项目：

```bash
packages/test/bin/midscene-test packages/test/example/web-midscene
```

公开摘要和报告保存在子项目的 `midscene_run` 目录中，详细 fact 文件保存在 `.midscene/test-results`。
