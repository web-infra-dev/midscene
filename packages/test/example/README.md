# Test Project 示例

本目录包含多个独立的 Test Project。每个子目录都有自己的项目配置和 YAML 文件。

目前包含以下示例：

- `web-midscene`：使用 Playwright 和 Midscene Web 检查 Midscene 文档页是否跟随 UA 语言显示英文或中文。这个示例包含自定义节点、生命周期和 AI 断言。
- `android-dongchedi`：使用 Android 真机和 Midscene 检查懂车帝排行榜筛选。这个示例演示如何组织 App Context、让 Agent 生成 Case，再由 Test Runner 执行。

在仓库根目录安装依赖并完成构建后，可以运行指定的子项目：

```bash
packages/test/bin/midscene-test packages/test/example/web-midscene

# 需要已授权的 Android 真机和已安装的懂车帝 App
node --env-file=packages/test/example/android-dongchedi/.env packages/test/bin/midscene-test packages/test/example/android-dongchedi --project dongchedi-android
```

公开 summary 保存在子项目的 `.midscene/test-results/<runId>/summary.json`，各 Project 的 fact 保存在同一 run 目录下的 `project-<index>/` 子目录中；报告仍保存在子项目的 `midscene_run` 目录中。
