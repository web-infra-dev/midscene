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
