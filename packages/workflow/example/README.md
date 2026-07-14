# Workflow 示例

本目录包含多个独立的 Workflow Project。每个子目录都有自己的项目配置和 YAML 文件。

目前包含以下示例：

- `web-baidu`：使用 Midscene Web 打开百度首页，并确认页面正常加载。

在仓库根目录安装依赖并完成构建后，可以运行指定的子项目：

```bash
packages/workflow/bin/midscene-workflow packages/workflow/example/web-baidu
```

运行结果保存在子项目的 `.midscene` 目录中。
