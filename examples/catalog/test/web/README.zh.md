# {{PROJECT_NAME}}

这是参考 `midscene-example` TodoMVC Test Runner 用例的 Web 版 Midscene Test 项目。直接使用 Playwright 的示例请看 [playwright-demo](https://github.com/web-infra-dev/midscene-example/tree/main/playwright-demo)。

如果创建时跳过安装，执行 `{{INSTALL_COMMAND}}`。安装后会自动生成 `midscene-node-spec.web.md`；若禁用了安装脚本，手动执行 `{{RUN_NODES_COMMAND}}`。复制 `.env.example` 为 `.env`，按[模型配置指南](https://midscenejs.com/model-common-config.html)配置模型。

配置后，在项目目录执行 `{{VERIFY_MODEL_COMMAND}}`，检查模型连接和 Midscene 兼容性。这一步不需要浏览器或设备；若检查失败，请先参考[模型调试与可观测性](https://midscenejs.com/model-debugging-observability.html)排查，再运行测试。

首次运行前执行 `{{CHROMIUM_INSTALL_COMMAND}}` 安装 Chromium。

`cases/todo.yaml` 使用在线 React TodoMVC。每条用例先由 `todo.setup` 打开 All 视图、清空页面存储并重新加载，通过 DOM 确认列表为空，再由 `todo.seed` 添加三个任务；第一条用例校验初始化状态，第二条用 AI 删除和完成任务，再校验最终状态。`todo.captureState` 在每条用例后记录页面状态。运行时需要能访问 TodoMVC 网站。

执行 `{{TEST_COMMAND}}` 运行测试。Node 列表见 `midscene-node-spec.web.md`；修改配置中的 Node 后执行 `{{RUN_NODES_COMMAND}}` 刷新。用例串行运行，首次失败即停止后续用例（`test.bail: 1`）；失败时仍会保存报告并关闭浏览器。报告位于 `midscene_run/report/`。

## 准备工作如何执行

| 阶段 | 次数 | 本例中的工作 |
| --- | --- | --- |
| `setup`（项目配置） | 项目一次 | 启动共享 Browser |
| `fileSetup`（项目配置） | 每份文件一次 | 创建独立 BrowserContext、Page，返回 Node 使用的 `context` |
| `beforeAll`（YAML） | 文件用例开始前一次 | 设置视口；首次调用 `getAgent` 创建 Agent，后续 Node 复用 |

`fileSetup` 自动应用到每份文件；`beforeAll` 由各文件声明。业务 Node `todo.setup` 与配置项 `setup` 无关。

## 注意事项

- 提高 `test.maxConcurrentFiles` 可并发运行文件，文件内用例仍顺序执行。
- 重试不重跑上述三个阶段；`beforeEach` 负责重置业务状态。
- 文件结束后先销毁 Agent、关闭 BrowserContext；所有文件清理完再关闭 Browser。后端账号和数据需自行隔离。
