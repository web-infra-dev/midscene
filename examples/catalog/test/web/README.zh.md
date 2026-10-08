# {{PROJECT_NAME}}

这是参考 `midscene-example` TodoMVC Test Runner 用例的 Web 版 Midscene Test 项目。直接使用 Playwright 的示例请看 [playwright-demo](https://github.com/web-infra-dev/midscene-example/tree/main/playwright-demo)。

如果创建时跳过安装，执行 `{{INSTALL_COMMAND}}`。安装后会自动生成 `midscene-node-spec.web.md`；若禁用了安装脚本，手动执行 `{{RUN_NODES_COMMAND}}`。复制 `.env.example` 为 `.env`，按[模型配置指南](https://midscenejs.com/model-common-config.html)配置模型。首次运行前执行 `{{CHROMIUM_INSTALL_COMMAND}}` 安装 Chromium。

`cases/todo.yaml` 使用在线 React TodoMVC。每条用例先由 `todo.seed` 清空页面存储并添加三个任务；第一条用例校验初始化状态，第二条用 AI 删除和完成任务，再校验最终状态。`todo.captureState` 在每条用例后记录页面状态。运行时需要能访问 TodoMVC 网站。

执行 `{{TEST_COMMAND}}` 运行测试。Node 列表见 `midscene-node-spec.web.md`；修改配置中的 Node 后执行 `{{RUN_NODES_COMMAND}}` 刷新。报告位于 `midscene_run/report/`。
