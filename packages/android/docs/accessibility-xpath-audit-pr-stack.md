# Android Accessibility XPath Audit：堆叠 PR 技术说明

## 目标与拆分原则

这组改动为 Android Accessibility tree 提供离线审计和 Playground 实时审计能力，
但不修改生产 XPath 策略。审计结果必须区分以下三个事实：

1. 元素是否进入 Accessibility tree。
2. 元素是否能生成生产使用的安全缓存 XPath。
3. 该 XPath 是否能在 fresh 或 revisit tree 中唯一命中同一元素。

实现拆为三个堆叠 PR。每个 PR 都有单一职责，且其分支在自己的 base 上可以独立构建和
测试：

```text
fix/cache-xpath-replay
└── feat/android-xpath-audit-core
    └── feat/android-xpath-audit-cli
        └── feat/android-xpath-audit-playground
```

完整集成分支 `test/android-douyin-xpath-audit` 保留为对照，不改写其历史。

## PR 1：Android XPath 审计核心

分支：`feat/android-xpath-audit-core`

Base：`fix/cache-xpath-replay`

### 职责

这一层提供可复用、无文件系统和无 UI 依赖的 Android 审计能力。CLI 和 Playground
都只能调用这里的领域模型与算法，不能各自实现一套 XPath 判定逻辑。

### Accessibility 快照

`AndroidDevice.captureAccessibilitySnapshot()` 复用生产设备读取流程：

```text
YADB dump
  └── 失败后回退 UIAutomator dump
      └── uiautomatorXmlToUiNode()
          └── AndroidAccessibilitySnapshot
```

快照同时保留：

- 实际使用的原始 XML 和来源（`yadb` 或 `uiautomator`）。
- 归一化后的完整 `UiNode` root。
- capture ID、采集时间和耗时。
- logical size、DPR 和 rotation。

这样截图、tree bounds 和 XPath 都能明确绑定到同一个坐标系和采集来源。

### 共享元数据

`collectAndroidAuditEnvironment()` 通过 ADB 收集设备、分辨率、density、Android 版本、
前台 package/activity 和应用版本。CLI 与 Playground 共享 schema version 2，避免两套
报告元数据逐渐分叉。

### Tree 枚举与 XPath

`enumerateAndroidUiTree()` 深度优先遍历完整 `UiNode` tree，为每个节点记录稳定的审计
ID、父节点、深度、child index、同类型 sibling index 和绝对结构 XPath。

`buildAndroidAuditTree()` 对每个节点调用当前生产
`generateXpathCacheFeature()`，并使用 Android 现有候选配置。输出同时包含：

- `structuralXpath`：只用于诊断的绝对路径。
- `cacheFeatureXpaths`：生产生成器返回的安全候选。
- 每个候选的来源、命中数量和是否选择当前节点。
- 节点的完整 Accessibility 属性、bounds、可见性和交互证据。

结构 XPath 不会被提升为缓存候选；没有可验证身份的节点仍然交给 AI 路径兜底。

### 最小语义单元

实时覆盖层不是简单地画出所有 `clickable=true` 节点。核心算法先从 Accessibility 属性、
click action、Web role、target URL 等字段提取交互证据，再选择最小语义单元：

- 优先保留具备直接身份或直接交互语义的叶子/局部容器。
- 当父容器只是把多个语义子节点打包时，保留子节点，抑制重复大框。
- 当子节点只暴露碎片文本、图标或箭头时，合并到能表达完整操作的语义容器。
- 对 Lynx/WebView 的结构节点使用 bounds、子树覆盖率和语义字段共同判断，不能仅依赖
  `clickable` 标志。
- 系统状态栏、导航栏和不可见/无效 bounds 不进入交互覆盖层，但仍保留在完整 tree 中。

每个框仍来自 tree bounds；默认 tree 审计不使用 AI 矩形。

### Fresh 与 revisit 回放

`buildAndroidLiveTreeAudit()` 在下一次 tree 中逐个执行候选 XPath，并要求：

1. 候选在目标 tree 中只命中一个节点。
2. 命中节点与 source 节点身份一致。
3. 错误映射不能被记为成功。

`applyAndroidAuditReplayToSource()` 把验证结果写回 source 节点，使报告中的 source
截图、source tree、source bounds 与 replay 状态保持一致。

### 状态模型

- `cache-xpath-hit`：安全缓存 XPath 在后续 tree 唯一命中同一目标。
- `tree-only-positional`：节点有结构路径，但没有可缓存身份。
- `exposed-no-safe-xpath`：节点已暴露，但身份字段缺失或不安全。
- `not-exposed`：视觉清单中的元素没有对应 tree 节点。
- `point-selected-other`：坐标映射与生产选点选择了不同节点。
- `pending`：实时模式中尚未取得 fresh 验证。

### 主要文件

- `packages/android/src/accessibility-snapshot.ts`
- `packages/android/src/audit-metadata.ts`
- `packages/android/src/device.ts`
- `packages/android/src/xpath-audit.ts`
- `packages/android/src/index.ts`
- `packages/android/tests/unit-test/{page,audit-metadata,xpath-audit}.test.ts`

### Review 重点

- snapshot 是否严格复用 YADB-first / UIAutomator-fallback。
- 是否调用生产 XPath 生成器，而不是复制策略。
- 最小语义单元是否只影响审计展示，不改变生产点击和缓存逻辑。
- fresh/revisit 是否同时检查唯一性和目标身份。

## PR 2：CLI 与离线 HTML 报告

分支：`feat/android-xpath-audit-cli`

Base：`feat/android-xpath-audit-core`

### 职责

这一层把 PR 1 的纯审计能力接到 ADB、文件系统和静态 HTML。它负责采集和展示，不拥有
XPath 策略。

### 命令模型

入口为：

```bash
MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE=1 \
pnpm exec tsx packages/android/scripts/accessibility-xpath-audit.ts capture \
  --device <adb-serial> \
  --app com.ss.android.ugc.aweme \
  --page <page-id>
```

采集分为三个阶段：

1. `source`：保存截图、原始 XML、完整 tree，并生成元素与 XPath 映射。
2. `fresh`：停留在当前页面重新 dump，验证即时稳定性。
3. `revisit`：用户退出并重新进入页面后再次 dump，验证真实回放。

`render` 只读取已有数据重建报告，不连接设备。

### 视觉清单

CLI 会生成 `visual-elements.json` 模板。人工复核者必须枚举截图中可见的交互元素，并为
每项提供名称、描述、点和矩形；`treeNodeId` 可以是 tree 节点，也可以为 `null`。

这保证未进入 Accessibility tree 的 Lynx、Flutter 或 WebView 元素仍在统计分母中。
技术栈只记录声明和证据，并使用 `confirmed`、`strong`、`suspected`、`unknown` 表示
置信度；不能从 `android.view.View` 类名直接断言框架。

### 报告产物

每个 run 生成：

```text
run.json
summary.json
index.html
pages/<page-id>/
  metadata.json
  screenshot.png
  source-used.xml
  yadb.xml
  uiautomator.xml
  ui-tree.json
  visual-elements.json
  elements.json
  annotated.html
  fresh-replay.xml
  replay-results.json
```

`ui-tree.json` 保存完整归一化 tree；`elements.json` 保存全部节点的审计记录。HTML 顶部
展示可折叠的完整 tree，并支持在截图框、详情卡和 tree 节点之间联动。

原始真机数据只写入已忽略的 `midscene_run/`，不能提交到公开仓库。

### 主要文件

- `packages/android/scripts/accessibility-xpath-audit.ts`
- `packages/android/tests/unit-test/accessibility-xpath-audit.test.ts`
- `packages/android/tsconfig.json`

### Review 重点

- source 截图、XML、tree 和 bounds 是否来自同一 source 阶段。
- fresh/revisit 是否只验证 source 候选，没有用新 tree 重新生成结果冒充回放。
- HTML/JSON 是否完整转义并保留全部 tree 节点。
- 未人工复核的视觉清单是否明确标记为 incomplete。

## PR 3：Playground 实时审计

分支：`feat/android-xpath-audit-playground`

Base：`feat/android-xpath-audit-cli`

### 职责

这一层把共享审计能力接入现有 Android Playground。它包括实时 session、报告下载、
预览覆盖层和 Inspector，不新建第二套 Playground。

### 实时会话

`AndroidAuditSessionController` 与当前设备 session 绑定：

- tree dump 使用 single-flight，避免 YADB/UIAutomator 请求堆积。
- 默认按间隔采集 source/fresh，并用上一轮节点验证当前轮。
- 设备切换、activity/页面语义、rotation 或布局变化时清理过期框。
- 连续采集失败时暂停实时重试，保留原始错误供诊断。
- revisit baseline 和 verify 显式分开，避免把即时 fresh 当成回访结果。

页面身份使用 activity、root 结构、语义文本和 Accessibility 属性组合指纹；布局指纹还
包含 bounds。这样即使两个页面使用相同 Activity，也不会把上一页覆盖层留到下一页。

### HTTP 与 SSE

后端提供 state、events、start、pause、capture、revisit、export 和 visual-elements 等
接口。SSE 只通知 revision 变化，完整 tree 由 state 接口读取，避免反复推送大 JSON。

### 覆盖层与 Inspector

通用 Playground 只新增可选的 inspector 和 preview overlay 扩展槽。Android 逻辑保留在
Android app 中：

- 框按真实 scrcpy canvas 的逻辑尺寸投影，不按外层面板尺寸计算。
- 框使用 tree bounds；颜色来自 PR 1 的审计状态。
- 点击框会选中详情，并自动展开、滚动到完整 tree 中的对应节点。
- “仅看问题”模式使用扁平列表，避免无意义的层级缩进。
- 审计界面和 tooltip 使用英文，与当前 Playground UI 保持一致。
- 工具栏只保留必要的 `Recapture` 和 `Save Report` 等操作。

默认实时覆盖不依赖 AI。显式 visual scan 接口仍可作为人工视觉清单的辅助来源，其 AI
矩形会通过 `rectSource` 标记，不能冒充 tree bounds。

### 报告下载

`Save Report` 在内存中构建完整下载 bundle，由浏览器下载到用户选择的位置，不在服务端
静默写入报告目录。下载内容复用 schema version 2，并保留 source/fresh/revisit、完整
tree、元素、元数据和 HTML。

### 主要文件

- `packages/android-playground/src/android-audit-{session,export}.ts`
- `packages/android-playground/src/{platform,index}.ts`
- `packages/android-playground/tests/unit/android-audit-*.test.ts`
- `packages/playground-app/src/Preview{InspectorLayout,OverlayLayer}.tsx`
- `packages/playground-app/src/Playground{App,Preview}.tsx`
- `packages/playground-app/src/PreviewRenderer.tsx`
- `apps/android-playground/src/android-audit/**`
- `apps/android-playground/src/App.tsx`

### Review 重点

- 设备解绑、页面切换和失败暂停时是否彻底清理旧状态。
- scrcpy 视频是否保持挂载，切换审计模式不能触发视频重连。
- 覆盖层坐标是否只使用与当前 tree 对应的 logical size。
- 下载报告是否以 source 为基准，fresh 只提供验证结果。
- 通用 Playground 扩展是否保持可选，不影响其他平台现有行为。

## 分层验证

每层都先运行最接近的测试，并在提交或更新 PR 前运行仓库 lint：

```bash
# PR 1
pnpm exec nx test @midscene/android --skip-nx-cache -- \
  tests/unit-test/page.test.ts \
  tests/unit-test/audit-metadata.test.ts \
  tests/unit-test/xpath-audit.test.ts
pnpm exec nx build @midscene/android --skip-nx-cache

# PR 2
pnpm exec nx test @midscene/android --skip-nx-cache -- \
  tests/unit-test/accessibility-xpath-audit.test.ts
pnpm exec nx build @midscene/android --skip-nx-cache

# PR 3
pnpm exec nx test @midscene/android-playground --skip-nx-cache
pnpm exec nx test @midscene/playground-app --skip-nx-cache
pnpm exec nx build @midscene/android-playground --skip-nx-cache
pnpm exec nx build @midscene/playground-app --skip-nx-cache
pnpm exec nx build android-playground --skip-nx-cache

# 每个 PR
pnpm run lint
```

真机验证属于 PR 3 的运行时验收：两台设备必须各自绑定独立 serial，切页后旧框消失，
同一语义元素使用 tree bounds，并且 fresh/revisit 的错误映射数为 0。
