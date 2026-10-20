# {{PROJECT_NAME}}

这是参考 `midscene-example/android/vitest-demo` TodoMVC 用例的 Android 版 Midscene Test 项目。

如果创建时跳过安装，执行 `{{INSTALL_COMMAND}}`。安装后会自动生成 `midscene-node-spec.android.md`；若禁用了安装脚本，手动执行 `{{RUN_NODES_COMMAND}}`。复制 `.env.example` 为 `.env`，按[模型配置指南](https://midscenejs.com/model-common-config.html)配置模型。

配置后，在项目目录执行 `{{VERIFY_MODEL_COMMAND}}`，检查模型连接和 Midscene 兼容性。这一步不需要浏览器或设备；若检查失败，请先参考[模型调试与可观测性](https://midscenejs.com/model-debugging-observability.html)排查，再运行测试。

连接设备并用 `adb devices` 确认；可设置 `ANDROID_DEVICE_ID` 指定设备。`cases/todo.yaml` 打开在线 React TodoMVC，添加三个任务、删除一个、完成另一个、筛选已完成任务，并校验可见任务和未完成数量。设备需要能访问该网站；`beforeEach` 先执行 `midscene.config.ts` 中的 `todo.setup`，打开 All 视图并等待输入框加载，再由 `aiAssert` 确认列表为空（包含已完成任务）且没有遮挡弹窗。已有任务会保留；检查失败时，用例会在修改任务前停止。请切换到 All，删除全部任务（包括已完成任务），或仅清除 TodoMVC 网站的数据；关闭遮挡弹窗后重新运行。模型或连接异常应先按报告中的原因排查。AI 检查可能误判，失败时请结合报告确认页面状态。

执行 `{{TEST_COMMAND}}` 运行测试。Node 列表见 `midscene-node-spec.android.md`；修改配置中的 Node 后执行 `{{RUN_NODES_COMMAND}}` 刷新。用例串行运行，首次失败即停止后续用例（`test.bail: 1`）；失败时仍会保存报告并释放连接。报告位于 `midscene_run/report/`。

每份测试文件通过 `fileSetup` 创建独立 Agent，结束后释放。此模板连接一台设备或一个桌面，因此 Project 的 `maxConcurrentFiles` 固定为 1；提高此上限前，需要通过资源分配脚本为并发文件提供独立设备或桌面。
