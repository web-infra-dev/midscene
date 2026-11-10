# 数据隐私

Midscene.js 是一个开源项目（GitHub: [Midscene](https://github.com/web-infra-dev/midscene/))，遵循 MIT 许可证。你可以在公开仓库中查看到所有代码。

Midscene 项目方不会通过 SDK 收集你的截图、API Key 或访问令牌。执行 AI 步骤时，SDK 会将所需的截图、提示词和页面上下文直接发送给你配置的模型服务。数据如何保存和使用取决于该服务的隐私政策。

Midscene 默认将运行报告和日志保存在执行机器的 `midscene_run/report` 和 `midscene_run/log` 目录。如果你的脚本、界面或执行结果中包含明文令牌、Cookie 等敏感信息，这些信息也可能出现在报告和日志中。请自行管理文件的访问权限和保留期限，分享前检查并移除敏感内容。在 CI 中，控制台日志和上传的产物也可能对有作业访问权限的人可见。

如果你希望在你自己的环境中构建 Midscene.js 和它的 Chrome 扩展（而不是使用我们已发布的版本），你可以参考 [贡献指南](https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md) 以找到构建说明。

