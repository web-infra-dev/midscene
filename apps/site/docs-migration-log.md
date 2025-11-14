# 文档迁移工作日志

## 记录规范

- 每条记录都仅针对一个 breaking change，避免多个操作混写。
- 在描述路径时请写明仓库内的完整相对路径，便于检索。
- 如果是合并、拆分或改名，请在「操作类型」里明确指出。
- 如果需要后续验证或修改，使用「后续行动」注明负责人或跟进人。

### 模板

```markdown
### YYYY-MM-DD – 简短的变更摘要

- 原路径：`apps/site/...`
- 原标题：`原文档标题`
- 操作类型：移动 / 合并 / 拆分 / 重命名
- 新位置：`apps/site/...`
- Breaking change 说明：说明迁移原因、影响范围以及需要知悉的事项。
- 后续行动：若无后续事项，可填「无」。
```

## 迁移记录

（按时间倒序追加记录，最新记录放最上方）

### 2025-11-13 – 统一模型文档命名（中英文）

- 原路径：`apps/site/docs/zh/choose-a-model.mdx`、`apps/site/docs/zh/model-provider.mdx`、`apps/site/docs/en/choose-a-model.mdx`、`apps/site/docs/en/model-provider.mdx`
- 原标题：`选择 AI 模型 / Choose a model`、`配置模型和服务商 / Configure model and provider`
- 操作类型：重命名
- 新位置：`apps/site/docs/zh/model-strategy.mdx`、`apps/site/docs/zh/model-config.mdx`、`apps/site/docs/en/model-strategy.mdx`、`apps/site/docs/en/model-config.mdx`
- Breaking change 说明：统一中英文文档使用英文 slug，避免非 ASCII 路径带来的构建与协作问题；同步更新 `apps/site/rspress.config.ts` 中英双语侧边栏路由及站内引用，保证链接一致。
- 后续行动：无

### 2025-11-05 – 拆分英文 YAML 自动化与命令行文档

- 原路径：`apps/site/docs/en/automate-with-scripts-in-yaml.mdx`
- 原标题：`Automate with scripts in YAML`
- 操作类型：拆分
- 新位置：`apps/site/docs/en/automate-with-scripts-in-yaml.mdx`、`apps/site/docs/en/command-line-tools.mdx`
- Breaking change 说明：将 CLI 安装与执行说明抽离为独立页面，原文保留 YAML 格式与语法说明。同步更新 `apps/site/rspress.config.ts` 侧边栏链接为 `/command-line-tools`。
- 后续行动：无

### 2025-11-05 – 拆分中文 YAML 自动化与命令行文档

- 原路径：`apps/site/docs/zh/automate-with-scripts-in-yaml.mdx`
- 原标题：`使用 YAML 格式的自动化脚本`
- 操作类型：拆分
- 新位置：`apps/site/docs/zh/automate-with-scripts-in-yaml.mdx`、`apps/site/docs/zh/command-line-tools.mdx`
- Breaking change 说明：同步中文文档结构，新增命令行工具页面并简化 YAML 文档内容，同时更新侧边栏链接到 `/zh/command-line-tools`。
- 后续行动：无

### 2024-07-23 – 合并 Web 与 Android MCP 文档

- 原路径：`apps/site/docs/en/web-mcp.mdx`
- 原标题：`MCP server`
- 操作类型：合并
- 新位置：`apps/site/docs/en/mcp.mdx`
- Breaking change 说明：原 Web 端 MCP 文档与 Android MCP 文档合并为统一文档，新增对两种环境配置和工具差异的说明。
- 后续行动：无

- 原路径：`apps/site/docs/en/mcp-android.mdx`
- 原标题：`MCP server`
- 操作类型：合并
- 新位置：`apps/site/docs/en/mcp.mdx`
- Breaking change 说明：Android 模式内容合入统一的 MCP 文档，文档中区分 Web 与 Android 的配置与可用工具。
- 后续行动：无

- 原路径：`apps/site/docs/zh/web-mcp.mdx`
- 原标题：`MCP 服务`
- 操作类型：合并
- 新位置：`apps/site/docs/zh/mcp.mdx`
- Breaking change 说明：中文 Web 端 MCP 文档合并入统一文档，补充了 Web 与 Android 的环境差异说明。
- 后续行动：无

- 原路径：`apps/site/docs/zh/mcp-android.mdx`
- 原标题：`MCP 服务`
- 操作类型：合并
- 新位置：`apps/site/docs/zh/mcp.mdx`
- Breaking change 说明：中文 Android 模式内容合并到统一 MCP 文档，统一呈现配置与工具差异。
- 后续行动：无

### 2025-11-06 – 重命名桥接模式文档

- 原路径：`apps/site/docs/en/bridge-mode-by-chrome-extension.mdx`、`apps/site/docs/zh/bridge-mode-by-chrome-extension.mdx`
- 原标题：`Bridge to the desktop Chrome`、`桥接到桌面 Chrome`
- 操作类型：重命名
- 新位置：`apps/site/docs/en/bridge-mode.mdx`、`apps/site/docs/zh/bridge-mode.mdx`
- Breaking change 说明：将桥接模式文档从冗长的文件名简化为 `bridge-mode.mdx`，同时更新 `apps/site/rspress.config.ts` 中的侧边栏链接配置。
- 后续行动：无
