# API Reference 后续改进清单

本文记录 `docs/en/reference/index.mdx` 和 `docs/zh/reference/index.mdx` 合并为单页 Reference 后仍需完成的工作。

## 目标和原则

- 英文版和中文版继续保留在各自的一篇文档中，不拆分页面。
- 以当前公开导出的 TypeScript API 和运行时行为为准，文档不能只根据已有文案互相翻译。
- 两种语言的章节、参数、示例和显式锚点保持一致。
- 示例应当可以复制运行；至少通过 TypeScript 编译检查。
- 易变信息应指向单一事实来源，避免在 Reference 中维护重复结论。

## 已处理的审计项

当前分支已经处理以下问题，后续修改不应使其回退：

- `aiQuery()` 的 `dataDemand` 参数已从错误的泛型 `T` 改为 `string | object`。正式类型仍需按下文继续收紧。
- `aiLocate()` 的 `dpr` 已改为 Web 专用的可选字段，源码类型和双语文档保持一致。
- 通用 Agent 参数列表已补充 `modelConfig`、`useDeviceTime`、`createOpenAIClient` 和 `onLLMUsage`。

以下清单只列尚未完成的工作。

## P0：修正事实和 API 覆盖

### 1. 统一 `overrideAIConfig` 的公开状态

现状：

- 中文版包含“在运行时设置环境变量（已弃用）”一节。
- 英文版没有对应章节。
- `@midscene/web/puppeteer`、`@midscene/web/playwright`、Bridge、Android 和 iOS 等入口仍公开导出 `overrideAIConfig`。
- 公开包装函数 `packages/shared/src/env/utils.ts` 中没有 `@deprecated` 标记，但底层 `GlobalConfigManager.overrideAIConfig()` 已标记废弃。

需要先确认产品结论，再按其中一种方案处理：

1. 如果该 API 已废弃，在源码声明中增加 `@deprecated`，并在中英文文档中说明替代方案和迁移方式。
2. 如果该 API 仍受支持，移除中文版的“已弃用”表述，并补齐英文版。
3. 如果该 API 不应继续公开，从包入口移除导出，并在变更记录中说明兼容性影响。

迁移说明不能只写“改用 `modelConfig`”。`overrideAIConfig` 还能覆盖非模型全局配置，而 `modelConfig` 只负责单个 Agent 的模型配置。文档还应准确说明：

- 该函数修改 Midscene 的全局配置覆盖层，不会写入 `process.env`。
- 默认模式会替换当前覆盖层；扩展模式才会合并已有配置。
- 非法键、非字符串值和覆盖已读取配置时分别会发生什么。
- 模型配置迁移到 `AgentOpt.modelConfig`；其他配置迁移到环境变量或对应的 CLI、Agent 参数。

验收标准：

- 源码声明、包导出和双语文档对 API 状态的表述一致。
- 中英文版具有相同的章节和示例。
- 替换和合并模式的说明与 `packages/shared/src/env/global-config-manager.ts` 一致。

### 2. 补齐通用 `AgentOpt`

以 `packages/core/src/types.ts` 中的 `AgentOpt` 为准，通用参数列表仍缺少：

- `groupName`
- `groupDescription`
- `reportAttributes`
- `testId`（已废弃，需要说明替代方案）

还应检查详细章节中已经出现、但通用参数列表仍未完整解释的字段，避免用户只能从示例中猜测含义。

目前参数列表还把多个可选字段写成了必填形式。`AgentOpt` 中的字段都带 `?`，应先给出完整类型，再逐项解释。需要一并说明：

- `groupName` 默认值为 `'Midscene Report'`，`groupDescription` 默认值为空字符串。
- `reportAttributes` 的值类型不能简化为无约束的 `object`。
- `cache: true` 仅保留在兼容类型中，运行时会报错，不能作为有效配置推荐。

验收标准：

- 每个面向用户的 `AgentOpt` 字段都在通用参数列表中出现一次。
- 所有可选字段均显示 `?`。
- 废弃字段包含替代字段和迁移说明。
- 中英文参数顺序、类型、默认值和废弃状态一致。

### 3. 修正报告 API 的类型和生命周期说明

`ReportMergingTool` 仍有以下缺口：

- `.mergeReports()` 的选项缺少 `outputDir?: string`。
- `.append()` 把 `reportFilePath` 写成必填字段，但 `ReportFileWithAttributes` 允许状态为 `skipped` 的报告省略该字段。
- `agent.reportFile` 的源码类型是 `string | null | undefined`，文档只说明它是“路径”，没有解释何时尚未生成或不可用。
- 示例通过 `agent.reportFile as string` 绕过空值检查，容易掩盖真实生命周期。
- Vitest 完整示例在 `afterEach` 读取 `reportFile` 前没有调用 `agent.destroy()`，报告可能尚未完成写入。
- 示例复用同一个 Device 创建多个 Agent；直接补上逐个 `agent.destroy()` 又会销毁共享 interface，需要先明确 Agent 和 Device 的所有权模型。
- 正文把合并结果笼统写成“一个文件”，但目录报告会生成包含 `index.html` 和截图资源的目录。

验收标准：

- 文档签名与 `packages/core/src/types.ts`、`packages/core/src/report.ts` 和 `packages/core/src/agent/agent.ts` 一致。
- 说明 `reportFile` 在首次写入前、禁用报告、浏览器内运行、没有 execution 和跳过用例等场景下的取值，以及 `destroy()` 如何等待最终写入。
- 示例先检查 `reportFile`，不使用不安全的类型断言。
- 合并前所有输入报告均已完成 finalization，示例不存在共享 Device 被提前销毁的问题。
- 根据输入报告格式说明文件输出和目录输出，并使用 `.mergeReports()` 的返回值，不假定固定路径。
- 双语示例和说明同步。

### 4. 明确并补齐公共 Agent 方法

当前参考文档没有覆盖以下公开方法：

- `runMarkdown()`
- `destroy()`
- `flushCache()`
- `recordErrorToReport()`

`runMarkdown()` 需要说明它接收 Markdown 文件路径，而不是 Markdown 字符串；相对图片按文件所在目录解析，最多支持 20 张图片，并且不支持 reference-style image。

`destroy()` 需要说明它会停止活跃的 UI observer、调用平台销毁逻辑、等待报告完成，并具有幂等保护。通用章节不能笼统承诺它会关闭用户持有的浏览器、页面或设备连接；平台章节应分别说明资源所有权。

`flushCache()` 需要说明未配置缓存时会抛错，以及 `cleanUnused: true` 的清理行为。`recordErrorToReport()` 需要覆盖必填的 `error`、可选的 `content` 和 `screenshotBase64`，并说明未传截图时会实时截图。

还需要决定以下高级接口是否属于稳定的公共 API：

- `getActionSpace()`
- `getUIContext()`
- `dumpDataString()`
- `reportHTMLString()`
- 监听器和进度监听相关接口

处理原则：

- 面向普通用户的稳定方法应补充签名、参数、返回值、生命周期和最小示例。
- 仅供框架内部使用的方法应通过可见性、导出边界或 JSDoc 明确标记，不应处于“公开可调用但文档完全缺失”的状态。
- `destroy()` 应放入通用生命周期说明，并在所有需要释放资源的快速上手示例中调用。

验收标准：

- 建立“公开 API 导出 → Reference 章节”的核对表。
- 每个公开稳定方法都有文档；每个内部方法都有明确的内部边界。
- 中英文覆盖范围一致。

#### 补全 `onLLMUsage` 的执行语义

当前文档只给出一句描述和一个示例，仍缺少：

- `AIUsageInfo` 的稳定字段及其可选性；字段使用 snake_case。
- 回调针对去重后的每次用量调用一次。
- 回调异常会被捕获，不会中断 Agent。
- 回调返回的 Promise 不会被等待；耗时上传需要由调用方自行排队。
- 聚合统计应读取 `agent.metrics`。

验收时应对照 `packages/core/src/types.ts` 中的 `AIUsageInfo` 和 Agent metrics 单元测试。示例必须处理 `total_tokens` 等字段为 `undefined` 的情况。

### 5. 补齐各平台选项和方法

#### Web

Puppeteer 和 Playwright 的页面选项缺少：

- `beforeInvokeAction`
- `afterInvokeAction`

需要说明回调的触发时机、参数和异常行为。当前公开类型是 `() => Promise<void>`，运行时却会额外传入 action name 和参数；如果要公开这些参数，应先修正 TypeScript 类型。

Puppeteer 和 Playwright 的 Browser Agent 还需要说明：

- Browser Agent 不接受 `forceSameTabNavigation`，运行时传入会报错。
- Browser Agent 会保留新标签页，并通过 `waitForNewPage()` 或 `setActivePage()` 切换活动页面。
- 当前片段缺少完整导入、浏览器或 context 初始化和销毁，应各补一份可运行示例。

#### Chrome Bridge

构造选项缺少：

- `serverListeningTimeout`
- `closeConflictServer`

连接选项缺少：

- `timeout`

公开方法缺少：

- `getBrowserTabList()`
- `setActiveTabId()`

`setDestroyOptionsAfterConnect()` 看起来更接近内部辅助方法，需要决定是否保持公开；如果不面向用户，应收紧公开边界。

还需要记录 tab 条目的返回结构，以及 `timeout` 的 30 秒默认值。

#### Android

`AndroidDeviceOpt` 缺少：

- `usePhysicalDisplayIdForScreenshot`
- `usePhysicalDisplayIdForDisplayLookup`

`getScrcpyStatus()` 和 `retryScrcpy()` 已在正文中提及，但缺少正式签名、返回类型和状态字段定义。

Android 章节还把 `customActions` 列为 `AndroidAgent` 构造选项，但它实际属于 `AndroidDeviceOpt`。`agentFromAdbDevice()` 因同时接收 Agent 和 Device 选项，可以直接接收该字段；直接构造 `AndroidAgent` 时不能这样使用。

#### iOS

`IOSDeviceOpt` 中以下有效配置尚未记录：

- `sessionId`
- `wdaMjpegPort`
- `wdaMjpegFrameSource`

需要特别说明复用外部 WDA session 时的所有权和清理行为，以及多设备并发时端口不能冲突。

iOS 章节还存在两处事实错误：

- `agent.runWdaRequest()` 实际接收一个对象 `{ method, endpoint, data? }`，文档却写成位置参数。位置参数签名属于 `IOSDevice.runWdaRequest()`。
- `customActions` 属于 `IOSDeviceOpt`，不属于 `IOSAgentOpt`。只有同时接收两类选项的 `agentFromWebDriverAgent()` 可以直接接收该字段。

`runWdaRequest()` 的 method 只支持 `GET`、`POST`、`DELETE` 和 `PUT`，不能用 “etc.” 扩大范围。

#### Desktop

Desktop 根入口公开导出、但 Reference 未覆盖的辅助 API 包括：

- `getConnectedDisplays`
- `checkAccessibilityPermission`
- `checkScreenRecordingPermission`
- `checkXvfbInstalled`
- `needsXvfb`

低层 RDP backend 和类型也从包入口公开导出。需要建立导出覆盖表，区分普通用户 API、Advanced API 和内部实现，不应继续处于“已公开但无稳定性说明”的状态。

#### 设备生命周期

Android、iOS、HarmonyOS 和 Desktop 的连接、断开与销毁 API 目前分散在示例中，需要统一说明：

- 何时调用 `connect()`。
- `agent.destroy()` 和 `device.destroy()` 分别释放什么资源。
- 哪些工厂方法自动连接或自动发现设备。
- 初始化失败和找不到设备时如何处理。

验收标准：

- 各平台文档逐项对照公开的 `*Opt` 类型和类方法。
- 参数类型、默认值、平台限制和资源所有权均有说明。
- `agent.runWdaRequest()`、`device.runWdaRequest()` 和 `customActions` 的签名通过 TypeScript 编译。
- 中英文平台章节保持相同顺序和覆盖范围。

## P1：让示例可复制、可验证

### 6. 修正当前示例

已知问题：

- Desktop 的一个示例使用 `ComputerDevice`，但没有导入。
- Desktop 的类型片段引用 `CacheConfig`，但没有定义或导入。
- Desktop 的 TypeScript 类型示例从根入口导入 `EnvironmentCheck`，但该类型当前没有从根入口导出。
- Playwright 配置示例调用 `defineConfig()`，但没有从 `@playwright/test` 导入；spec 示例使用 `test` 时也没有从本地 fixture 导入。
- 多个快速上手示例在结束前没有调用 `agent.destroy()`；部分示例只关闭浏览器或设备。
- Android 和 HarmonyOS 示例直接使用第一个设备，没有处理设备列表为空的情况。
- Desktop 的多显示器示例直接访问 `displays[0]` 或 `displays[1]`，没有检查显示器数量。

修改时还应统一：

- 导入名称与正文使用的类名。
- `try/finally` 中的资源释放顺序。
- 环境变量和外部服务前置条件。
- 返回值的空值检查。

Playwright fixture 会由框架负责 finalize Agent，不应要求用户手动调用 `destroy()`；普通 SDK 示例则应在 `finally` 中销毁 Agent，再关闭浏览器或设备。

验收标准：

- 从文档提取 TypeScript 代码块，并在最小 stub 或真实包类型下运行 `tsc --noEmit`。
- 需要外部设备的示例至少通过静态编译，并明确列出运行前置条件。
- 快速上手示例在成功和异常路径上都能释放资源。

### 7. 为代码片段增加自动检查

目前站点构建只能验证 MDX 语法，无法发现缺失导入、错误类型和失效 API。

建议增加一个轻量检查：

1. 为需要编译的代码块增加可识别的元数据或固定注释。
2. 从中英文文档抽取代码块。
3. 对完整示例运行 TypeScript 编译。
4. 对只展示局部签名的片段明确标记为不可独立运行，避免误报。

验收标准：

- CI 能发现缺失导入、未知类型和公开 API 改名。
- 文档只改文案时，不要求访问真实浏览器或移动设备。

## P1：稳定双语结构和链接

### 8. 对齐中英文结构

当前可见差异包括：

- 中文版额外包含 `overrideAIConfig` 章节。
- “属性”“深度定位”“使用图片作为提示词”等章节的顺序不同。
- 个别英文标题过于笼统，例如 `More APIs`；中文版对应标题也不利于检索。

验收标准：

- 两种语言的章节树顺序一致。
- 每个 API 位于同一语义分组中。
- 标题使用可检索的能力名称，避免“更多”“其他”等模糊分类。

### 9. 统一显式锚点

当前英文版有 47 个显式 `<a id>`，中文版有 49 个。大量示例锚点使用本地化 ID，例如：

- `web-quick-start` 与 `web-快速上手`
- `android-navigation-helpers` 与 `android-导航辅助`
- Desktop 动作锚点也混入了中文后缀

这会导致切换语言后保留的 URL hash 无法命中同一位置。

此外，部分标题使用 `{#...}`，其余标题依赖 Rspress 根据标题自动生成 slug。中英文标题不同，自动生成的 slug 也不会一致。中文版当前还有两处链接指向不存在的 `#通过图像提示`，实际图片章节使用的是 `#prompting-with-images`。

处理方式：

- 两种语言统一使用稳定、语言无关的英文 ID。
- 同一 API 或示例在两种语言中使用完全相同的显式锚点。
- 为所有需要公开深链的标题声明稳定 ID，不依赖本地化标题自动生成 slug。
- 修正现有 `#通过图像提示` 断链，并检查所有 `](#fragment)` 链接。
- 如果已有外部链接依赖旧锚点，保留兼容锚点或配置重定向，不能直接静默删除。

验收标准：

- 两个文件的标题层级和稳定 ID 序列完全一致。
- 两个文件的显式锚点集合完全相同，且单个文件内不存在重复 ID。
- 所有页内 fragment 都能解析到当前页面中的目标。
- 语言切换后，带 hash 的链接仍定位到同一内容。
- 站点构建通过，并抽查平台入口和常用方法的深链接。

## P1：消除容易过期的内容

### 10. 处理时间敏感声明

当前容易随版本变化的内容包括：

- `runGherkinScenario()` “仍处于 beta”。
- 文档内硬编码的模型名称、模型能力和推荐组合。
- Puppeteer、Playwright 的最低版本要求。
- Deep Locate 针对 Qwen、Doubao、Gemini 的效果描述。
- scrcpy 的耗时和性能倍数。

处理方式：

- 如果版本约束来自 `peerDependencies`、运行时检查或测试矩阵，文档应链接或自动读取该事实来源。
- 模型推荐应链接到统一的模型策略或配置页，Reference 只说明 API 行为。
- 性能数字需要注明测试环境和适用范围；无法持续验证时，改为定性描述。
- beta 状态必须由版本策略或公开注解支撑，并指定复查责任。

验收标准：

- 每项易变声明都有可追溯的事实来源。
- 删除无法验证的“当前”“仍然”“最佳”等绝对表述。
- 依赖版本升级时，CI 或发布流程能够提示同步文档。

### 11. 收敛重复的类型说明

同一组定位和提取参数目前在多个方法中重复书写，容易产生类型、默认值和措辞漂移。重点包括：

- `LocateOption`
- `ServiceExtractOption`
- 图片提示参数
- 通用等待、DOM 和截图选项

建议在同一篇文档中增加“共享类型”章节，各 API 链接到统一定义。页面仍保持单篇，不需要拆文件。

抽取时应直接核对源码公开类型。例如 `LocateOption` 还包含 `uiContext` 和 `fileChooserAccept`，不能只复制文档当前已经列出的字段。

`aiQuery()` 也需要使用正式类型，而不是停留在宽泛的 `object`：

```ts
function aiQuery<T = any>(
  dataDemand: string | Record<string, string>,
  options?: ServiceExtractOption,
): Promise<T>;
```

这样可以避免误导用户传入包含非字符串值的任意对象，也能让 `ServiceExtractOption` 成为可链接的权威定义。

验收标准：

- 共享字段只有一个权威定义。
- 各方法只补充自身特有的约束。
- 修改公共类型时，只需更新一处正文。

## P2：提升单页可检索性

当前两个文件均超过 3,400 行。继续保留单篇结构时，需要增加局部导航，而不是拆页。

建议增加：

- 通用方法索引：按交互、提取、断言、执行脚本、报告和生命周期分组。
- 平台内索引：列出构造器、选项、方法、动作空间和示例。
- 能力矩阵：说明 Web、Android、iOS、HarmonyOS 和 Desktop 对主要方法的支持情况。
- “共享类型”入口。

验收标准：

- 用户可以从页面顶部在两次点击内到达任一稳定公共 API。
- 平台差异可以从矩阵直接判断，不需要逐段搜索。
- 索引链接纳入锚点检查。

## P2：清理中文样式

中文版仍有系统性的格式债务：

- 约 147 处参数说明使用半角 ` - `，应统一为中文全角冒号 `：`。
- 部分参数列表使用半角 `:`，也应统一为全角冒号。
- 中文句子中仍有半角逗号。
- 数字和单位缺少空格，例如 `1000ms`、`5fps`、`1KB` 和 `500–2000ms`。
- `web`、`agent`、`xpath`、`http` 等术语的大小写不统一。
- 部分长句超过一个中心意思，部分列表项缺少句末标点。

处理时遵循：

- Midscene Agent 使用 `Agent`，不翻译为“代理”。
- `API Key` 保持原样。
- 产品名、协议名和技术缩写采用官方大小写，例如 Web、XPath、HTTP、DOM 和 JSON。
- 中文正文使用全角标点；代码、类型和值保持半角。
- 数字与英文单位之间留空格，例如 `1,000 ms`、`5 fps` 和 `1 KB`。

验收标准：

- 参数列表不再出现 `` `参数` - 说明 `` 格式。
- 中文正文中的半角标点经过人工复核。
- 中英文字符、数字和单位的空格风格一致。
- 对长句和无句末标点的列表项完成一次通读。

## 建议执行顺序

1. 先完成 `overrideAIConfig` 和高级公共 API 的产品决策。
2. 修正通用参数、报告 API 和各平台选项。
3. 修正示例，并加入代码片段编译检查。
4. 对齐双语章节和显式锚点。
5. 收敛易变声明和重复类型。
6. 增加单页索引、能力矩阵，最后统一中文样式。

## 最终验收

完成全部修改后，至少执行：

```bash
pnpm run lint
pnpm --dir apps/site run build
git diff --check
```

还需要执行或补充以下专项检查：

- 比较中英文标题层级和稳定 ID 序列。
- 比较中英文显式锚点集合，并检查单个文件内的重复锚点。
- 检查所有页内 fragment 是否可以解析。
- 编译标记为可运行的 TypeScript 示例。
- 将双语章节树和公共 API 覆盖表纳入评审。
