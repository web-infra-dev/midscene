# Test Project 示例

本目录包含多个独立的 Test Project。每个子目录都有自己的项目配置和 YAML 文件。

目前包含以下示例：

- `web-midscene`：使用 Playwright 和 Midscene Web 检查 Midscene 文档页是否跟随 UA 语言显示英文或中文。这个示例包含自定义节点、生命周期和 AI 断言。

在仓库根目录安装依赖并完成构建后，可以运行指定的子项目：

```bash
packages/test/bin/midscene-test packages/test/example/web-midscene
```

公开 summary 保存在子项目的 `.midscene/test-results/<runId>/summary.json`，各 Project 的 fact 保存在同一 run 目录下的 `project-<index>/` 子目录中；报告仍保存在子项目的 `midscene_run` 目录中。

## 从旧 YAML 迁移

使用一次性迁移命令把旧 Web YAML 脚本或批量配置转换为独立的新 Test Project：

```bash
packages/test/bin/midscene-test migrate path/to/legacy.yaml \
  --output-dir path/to/migrated-test-project
```

命令不会修改旧文件，也不会覆盖已有输出目录。它会生成 `midscene.config.ts`、`cases/*.yaml` 和 `MIGRATION.md`；可以等价转换的 `ai` / `aiAction` / `aiAct`、`aiAssert`、`sleep`、`recordToReport` 会自动迁移，无法无损转换的动作或运行方式会在写入前报错，并提示改造成自定义 Node。

迁移后先并行运行新旧用例并核对结果，再切换 CI。`describe-nodes` 只用于查看新项目可用 Node 的说明，不影响测试执行：

```bash
packages/test/bin/midscene-test describe-nodes path/to/migrated-test-project
packages/test/bin/midscene-test path/to/migrated-test-project
```
