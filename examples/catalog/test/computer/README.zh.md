# {{PROJECT_NAME}}

这是参考 `midscene-example/computer/vitest-demo` TodoMVC 用例的 Computer 版 Midscene Test 项目。

如果创建时跳过安装，执行 `{{INSTALL_COMMAND}}`。安装后会自动生成 `midscene-node-spec.computer.md`；若禁用了安装脚本，手动执行 `{{RUN_NODES_COMMAND}}`。复制 `.env.example` 为 `.env`，按[模型配置指南](https://midscenejs.com/model-common-config.html)配置模型。

按照[桌面环境指南](https://midscenejs.com/platforms/desktop.html)准备权限和依赖。可设置 `COMPUTER_DISPLAY_ID` 选择显示器；无头 Linux 需要 Xvfb 和 `MIDSCENE_COMPUTER_HEADLESS_LINUX`。`cases/todo.yaml` 在 macOS 使用 Safari、在 Windows/Linux 使用 Chrome 打开在线 React TodoMVC，添加三个任务、删除一个、完成另一个、筛选已完成任务，并校验任务名称及输入框占位文字。桌面需要能访问该网站；重复运行前请使用全新浏览器配置或清除 TodoMVC 存储。

执行 `{{TEST_COMMAND}}` 运行测试。Node 列表见 `midscene-node-spec.computer.md`；修改配置中的 Node 后执行 `{{RUN_NODES_COMMAND}}` 刷新。报告位于 `midscene_run/report/`。
