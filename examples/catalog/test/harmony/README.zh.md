# {{PROJECT_NAME}}

这是参考 `midscene-example/harmony/vitest-demo` TodoMVC 用例的 HarmonyOS 版 Midscene Test 项目。

如果创建时跳过安装，执行 `{{INSTALL_COMMAND}}`。安装后会自动生成 `midscene-node-spec.harmony.md`；若禁用了安装脚本，手动执行 `{{RUN_NODES_COMMAND}}`。复制 `.env.example` 为 `.env`，按[模型配置指南](https://midscenejs.com/model-common-config.html)配置模型。

连接设备并用 `hdc list targets` 确认；可设置 `HARMONY_DEVICE_ID` 指定设备，必要时设置 `HDC_HOME`。`cases/todo.yaml` 在浏览器打开在线 React TodoMVC，添加三个任务、删除一个、完成另一个、筛选已完成任务，并校验可见任务和未完成数量。设备需要能访问该网站；重复运行前请使用全新浏览器配置或清除 TodoMVC 存储。

执行 `{{TEST_COMMAND}}` 运行测试。Node 列表见 `midscene-node-spec.harmony.md`；修改配置中的 Node 后执行 `{{RUN_NODES_COMMAND}}` 刷新。报告位于 `midscene_run/report/`。
