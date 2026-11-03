# 产物与日志开发规范

[English](./artifacts.md)

本文面向修改产物路径、执行记录、报告发布、导出工具和日志的 Midscene 开发者。
用户配置参见 [Agent 报告配置](../apps/site/docs/zh/reference/index.mdx#report-options)
和 [运行 Midscene Test](../apps/site/docs/zh/midscene-test/running.mdx)。

## 目录职责

默认产物根为 `midscene_run/`。新增运行产物应放在这个根目录下，同时保留用户显式指定路径的能力。

| 目录                                  | 职责                                                 | 保留规则                                             |
| ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `report/`                             | Agent 报告与 Midscene Test 整合报告                  | 单 HTML 或完整外置报告目录是独立交付单元。           |
| `test-results/<runId>/`               | Native Test 结果、计划、操作记录、各次尝试和诊断来源 | 分析时保留完整运行目录，包括失败尝试和生命周期错误。 |
| `test-results/<recordingId>/records/` | 旧 YAML 快照与诊断图片                               | 快照和它引用的图片一起保留。                         |
| `cache/`                              | 可复用的执行缓存                                     | 丢弃缓存不应丢失诊断证据。                           |
| `log/`                                | SDK 诊断日志                                         | 用于补充结构化结果。                                 |
| `output/`                             | 操作产生的文件                                       | 保留用户指定输出路径的能力。                         |
| `tmp/`                                | Midscene 临时工作文件                                | 仅清理当前操作拥有的文件。                           |
| `cli-report-session/`                 | 各端及 Skill CLI 的私有会话状态                      | 追加报告所需的状态与报告交付目录分开。               |

产物根是工作目录，发布时按需选择报告和结果。设备、浏览器连接或 CLI 即时图片响应仍可能使用系统临时目录；报告交付应包含自身依赖，不依赖这些临时文件。

两种报告使用相同的组织方式：

```text
midscene_run/report/
  <name>.html                    # single-html，默认格式
  <name>/                       # html-and-external-assets
    index.html
    report.json                 # 清单与报告元数据
    data/                       # 执行数据
    screenshots/                # 本报告内复用的图片文件
```

独立 Agent 默认自动命名，也可通过 `reportFileName` 指定。Native Test 使用
`midscene-e2e-<runId>`，由宿主发布一份整合报告；内部 Agent 通过宿主会话记录数据，
不额外发布独立 Agent HTML。Test 的格式由 `output.reportFormat` 决定，独立 Agent
和旧 YAML 使用 `outputFormat`。

两种报告格式下，旧 YAML 的快照都放在 `test-results/`。同一个 Agent 连续运行 YAML
时，共用记录目录，每次保留独立快照。显式开启的 `persistExecutionDump` 是另一项能力：
单 HTML 模式下额外 JSON 位于 `report/.execution-dumps/<HTML 文件名>/`。
它可能引用 `report/screenshots/` 中的图片，保留时应带上这些依赖。
正常生成报告时无需额外开启原始 dump。

## 通过共享上下文解析路径

- 新增文件时，使用 `@midscene/shared/common` 的 `getMidsceneRunSubDir()`。
  在操作执行时解析路径，避免在模块加载时固定路径。
- Native Test 的 `output.runDir`、`MIDSCENE_RUN_DIR` 相对测试项目解析；独立 Agent、
  旧 YAML、Playwright 相对工作目录解析。Native Test 显式配置的 `output.reportDir`
  相对测试项目，`--result-dir` 相对命令工作目录。
- Test 宿主通过 `resolveMidsceneRunDir()` 和 `runWithMidsceneRunDir()` 将绝对根目录
  传递给 SDK。保留异步运行间的隔离，以及 ESM/CJS 包之间的共享上下文。
  并发运行之间切换目录时，不修改 `process.env` 或 `process.cwd()`。
- 根目录查找顺序为：异步运行上下文、进程级 `setMidsceneRunDir()`、环境变量、默认值。
  Test 显式配置与环境变量必须指向同一根目录。空路径、冲突或不可写时明确报错，
  不将产物转存到其他位置。
- 集成方读取返回的 `summaryPath`、`markdownPath`、`reportPath`。
  `loadTestProject().output` 是配置值，不是最终输出路径。
  Summary 内的相对文件引用以 Summary 所在目录为基准。

例如，操作执行时再调用 `getMidsceneRunSubDir('output')`。如果在模块初始化时保存目录，
下一个测试项目的文件可能写到上一个项目中。

## 记录与清理

1. **宿主负责记录。** Native Test 创建 `ReportSession`，内部 Agent writer 提供结构化记录。
   独立报告使用 `ReportGenerator`，旧 YAML 使用共享的来源快照能力。
   嵌套 YAML 的记录归属于所在运行。
2. **在同一时刻冻结证据。** 执行内容、采集时间和 busy/partial 状态应在等待磁盘 I/O
   前一起确定。操作在图片写盘期间结束，不能让缺少最终结果的快照变成 complete。
   晚返回的数据不能改写已经交付的快照。
3. **先保留诊断，再释放 writer。** 补收未被步骤记录覆盖的 setup/teardown 证据后，
   在 writer 结束时释放执行对象和回调。合并、导出时保留超时、失败、中断、跳过和重试信息。
4. **交付后清理可替换的进度。** Native Test 在报告发布及之前的结果写入成功后、writer
   均空闲时清理 `records/data/`、`records/report.json` 和未被引用的图片。
   不可变快照 JSON 及其图片继续保留，最后再写 Summary。
   发布失败时保留诊断来源。
5. **完成状态与执行结果分别处理。** 清单中的 `complete` 表示记录已完成。
   只有全部 writer 完成，整份报告才能 complete；用例是否通过由执行结果决定。

## 发布、图片与内存

- 默认保持自包含 `single-html`。外置报告使用上面的清单、执行数据和图片结构。
  复用现有读写与发布模块，避免另写 HTML 解析器或复制整个工作目录。
- 外置报告、`split` 和 Markdown 导出按图片内容去重。每次观察的 ID、时间和步骤关联
  继续保留。消费者使用导出内容中的图片路径，观察 ID 不代表文件名。
- 报告搬迁后应能独立读取：包含被引用的资源、交付路径使用相对引用、拒绝越出报告范围
  的资源路径。覆盖已有输出前先校验依赖。
- 共用清单或发布目标时，对完整的“读取、合并、写入”进行跨进程协调。
  原子重命名只能防止文件写一半，不能防止更新丢失。保留其他 writer 的内容并汇总状态。
- `overwrite` 仅替换实际输出目标。例如将 `run.html` 导出到 `run/index.html`，
  源 HTML 和无关同级文件应继续保留。仅在显式要求 `rmOriginalReports` 且发布成功后
  删除被消费的源报告。
- 进度写入采用异步、有序处理；图片逐步处理，避免同时持有所有解码图片、Base64 副本
  和旧执行对象。离线转换工具可使用同步入口，执行热路径不应每步同步扫描大 HTML。
- 报告序列化结构无需添加旧格式兼容层。修改公开配置、默认格式或输出路径时，仍需更新
  用户文档并检查下游集成。

## 日志规范

包内代码使用共享 logger：

```ts
import { getDebug, logReport } from '@midscene/shared/logger';

const debug = getDebug('report:publish');
const warn = getDebug('report:publish', { console: true });

debug('Published report %s', reportPath);
warn('Optional diagnostic unavailable for run %s: %s', runId, reason);
logReport(`Report: ${reportPath}`);
```

- **稳定命名。** topic 使用 `模块:主题`，logger 自动增加 `midscene:` 前缀。
  上例可用 `DEBUG=midscene:report:publish` 查看终端调试输出，文件为
  `<runDir>/log/report-publish.log`。Node.js 下未开启 `DEBUG` 也会写文件日志。
- **按用途选择入口。** 用户可见的包内警告使用 `getDebug(topic, { console: true })`，
  同时进入文件和终端或 CLI reporter。报告路径通知使用 `logReport()`。
  影响执行结果的错误继续抛出或传递，让结果与退出码体现失败。
- **保留归属。** Test 宿主用 `runWithConsoleLogHandler()` 接收消息，
  用 `runWithConsoleLogScope()` 附加项目、文件和用例上下文，晚到日志仍归属于原作用域。
  包内直接使用 `console.warn()`、`console.log()` 会绕过这一层；CLI 展示层负责终端排版。
- **控制内容。** 记录 ID、路径、数量和简洁错误原因，避免整份 dump、Base64 图片、
  环境变量值、API Key 和其他敏感信息。显式模型或调试记录可能包含敏感载荷，
  需要单独管理其保留范围。
- **诊断证据写入结构化结果。** 文件日志在背压或流错误时可能丢弃消息。
  日志流或终端写入失败不应导致应用崩溃，也不应掩盖原始错误。
  产物根目录无效或不可写时，仍按前面的路径规则报错。
- **修改 logger 时检查资源生命周期。** 切换根目录时，待写字节和 stream 数量应有上限。
  结束被替换的 stream；它可能触发 `finish` 而非 `drain`。
  背压状态应在对应 stream 刷盘或出错后解除，并检查 stream 身份，
  避免旧回调清除新 stream 的状态。

## 消费端与回归检查

| 改动范围      | 需要验证                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------- |
| 根目录解析    | 默认、自定义、绝对路径、显式覆盖、配置冲突、并发项目和 ESM/CJS 上下文共享。                        |
| 执行记录      | 独立 Agent、旧 YAML 及其初始化失败、Test 无额外 Agent HTML、重试与超时、快照截断时刻一致。         |
| 报告与工具    | 两种格式经过合并、导出、拆分、Markdown 转换；状态保留、图片去重、目录搬迁和缺失资源。              |
| 共用报告发布  | 独立进程追加；覆盖时保留来源与无关文件；发布失败保留证据。                                         |
| Viewer 与集成 | Playground 展示与 replay、Playwright 报告、各端及 Skill CLI 跨进程追加、CI Summary/上传/发布路径。 |
| 资源生命周期  | 重复截图的内存预算、writer 释放、真实日志流的背压、目录切换与过期回调。                            |

从就近测试开始：
[路径解析](../packages/test/tests/artifact-paths.test.ts)、
[Test 产物链路](../packages/test/tests/report-artifact-pipeline.test.ts)、
[会话](../packages/core/tests/unit-test/report-session.test.ts)、
[发布](../packages/core/tests/unit-test/report-artifact.test.ts)、
[导出](../packages/core/tests/unit-test/report-export.test.ts)、
[内存预算](../packages/core/tests/unit-test/report-memory-budget.test.ts)、
[CLI 会话](../packages/shared/tests/unit-test/cli-report-session.test.ts) 和
[真实日志流](../packages/shared/tests/unit-test/logger-stream-lifecycle.test.ts)。
消费端测试使用实际生成的报告；仅手写 HTML 无法发现目录数据路由或 replay 读取遗漏。

按 [CONTRIBUTING.md](../CONTRIBUTING.md) 运行受影响项目的最小相关 Nx 测试与构建，
提交前执行 `pnpm run lint`。纯文档改动检查格式、链接和 lint，无需运行模型或设备测试。
用户文档聚焦配置与使用，内部产物和日志约定变化同步到本文。
