# Studio Playground Panel Integration

## Decision

在 `apps/studio` 现有壳层不变的前提下，接入现有 playground 的两块真实能力：

- 右侧栏接入对话 / 执行面板
- 左侧主区域接入预览面板

**不直接嵌入整页 `PlaygroundApp`，也不复制 UI 代码到 Studio。**

采用方案：

1. 在 `packages/playground-app` 内抽出一个共享 controller
2. 抽出两个可嵌入的面板组件
3. `apps/playground` 继续用整页 `PlaygroundApp`
4. `apps/studio` 用自己的 `ShellLayout` 组合这两个面板

这是这次工作的最终推荐方案，也是后续实现应直接遵循的方案。

---

## Why This Is The Right Boundary

### 已确认的事实

1. `apps/studio` 已经有正确的外壳布局：
   - 左侧 rail
   - 中间主内容区
   - 右侧固定宽度面板

   见 [ShellLayout/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/ShellLayout/index.tsx#L5)。

2. `packages/playground` 不是 UI 包，真正可复用的 React UI 在
   `packages/playground-app`。

3. 现有 [PlaygroundApp.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundApp.tsx#L58)
   同时承担了：
   - SDK 创建
   - 轮询 server/runtime
   - session setup/create/destroy
   - countdown UX
   - ConfigProvider
   - 整页双栏布局
   - 左右 panel 自己的壳层 header/toolbar

4. 现有 `apps/studio` 左右两块只是静态占位：
   - [MainContent/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/MainContent/index.tsx#L1)
   - [Playground/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/Playground/index.tsx#L1)

### 为什么不能直接把 `PlaygroundApp` 塞进 Studio

因为它会同时带来这几个问题：

1. 左右内容方向不对  
   `PlaygroundApp` 当前是左对话、右预览，Studio 需要左预览、右对话。

2. 样式污染  
   [PlaygroundApp.less](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundApp.less#L1)
   里有整页布局假设：`100vh`、`app-panel`、`panel-content`、
   `panel-resize-handle` 等。

3. 壳层所有权错误  
   Studio 的 window、圆角、留白、header、panel 宽度应该由 Studio 自己控制，
   不是由 `playground-app` 控制。

4. 复用粒度过粗  
   你需要的是“真实面板能力”，不是“完整 playground 页面”。

---

## Final Architecture

### 目标形态

#### `packages/playground-app` 负责

- 共享 controller
- 对话面板
- 预览面板
- 现有整页 `PlaygroundApp` 的向后兼容组合

#### `apps/studio` 负责

- 外壳布局
- 左 rail
- 顶部设备信息行
- 右侧栏标题区
- 预览和对话面板在壳中的放置
- renderer 侧 runtime config 的接线

### 最终组件关系

```text
apps/studio/App
  -> ShellLayout
    -> StudioPlaygroundProvider
      -> Sidebar
      -> MainContent
        -> StudioMainHeader
        -> PlaygroundPreviewPanel
      -> Playground
        -> StudioConversationHeader
        -> PlaygroundConversationPanel
```

`apps/playground` 仍然保持：

```text
PlaygroundApp
  -> PlaygroundConfigProvider
  -> PanelGroup
    -> PlaygroundConversationPanel
    -> PlaygroundPreviewPanel
```

---

## Exact Extraction Plan

## Phase 1: 在 `packages/playground-app` 抽共享 controller

### 新增文件

- `packages/playground-app/src/controller/usePlaygroundController.ts`
- `packages/playground-app/src/controller/types.ts`

### 保留并复用的现有逻辑

- [useServerStatus.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/useServerStatus.ts#L1)
- [session-state.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/session-state.ts#L1)
- [session-setup.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/session-setup.ts#L1)

### `usePlaygroundController` 的职责

- 创建并持有单个 `PlaygroundSDK`
- 持有 `antd` `Form` 实例
- 复用 `useServerStatus`
- 计算 `sessionViewState`
- 加载 `sessionSetup`
- 执行 `createSession`
- 执行 `destroySession`
- 管理 `autoCreate`
- 管理 `countdown`
- 暴露统一状态和 actions

### 推荐返回类型

```ts
export interface PlaygroundControllerState {
  playgroundSDK: PlaygroundSDK;
  form: FormInstance<Record<string, unknown>>;
  serverOnline: boolean;
  isUserOperating: boolean;
  deviceType: DeviceType;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  executionUxHints: ExecutionUxHint[];
  sessionViewState: PlaygroundSessionViewState;
  sessionSetup: PlaygroundSessionSetup | null;
  sessionSetupError: string | null;
  sessionLoading: boolean;
  sessionMutating: boolean;
  countdown: number | string | null;
}

export interface PlaygroundControllerActions {
  refreshServerState: () => Promise<void>;
  refreshSessionSetup: (input?: Record<string, unknown>) => Promise<void>;
  createSession: (
    input?: Record<string, unknown>,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  destroySession: () => Promise<void>;
  finishCountdown: () => void;
}

export interface PlaygroundControllerResult {
  state: PlaygroundControllerState;
  actions: PlaygroundControllerActions;
}
```

### 为什么先抽 controller

因为 Studio 左右两块必须共享一份 session/runtime 状态。  
如果不先把状态抽出来，最后不是 props 乱穿，就是左右各自建一个 SDK，
而后者一定会坏。

---

## Phase 2: 抽对话与预览面板

### 新增文件

- `packages/playground-app/src/panels/PlaygroundConversationPanel.tsx`
- `packages/playground-app/src/panels/PlaygroundPreviewPanel.tsx`
- `packages/playground-app/src/panels/PlaygroundConversationPanel.less`
- `packages/playground-app/src/panels/PlaygroundPreviewPanel.less`

### 继续保留并复用的现有文件

- [SessionSetupPanel.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/SessionSetupPanel.tsx#L107)
- [PlaygroundPreview.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundPreview.tsx#L1)
- [PreviewRenderer.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PreviewRenderer.tsx#L31)

### 2.1 `PlaygroundConversationPanel`

#### 职责

- 在 connected 时渲染 `UniversalPlayground`
- 在 disconnected 时渲染 `SessionSetupPanel`
- 接受 header slot，而不是自己硬编码整页 header
- 不拥有页面级布局

#### 推荐 props

```ts
export interface PlaygroundConversationPanelProps {
  controller: PlaygroundControllerResult;
  appVersion: string;
  title?: string;
  branding?: Partial<PlaygroundBranding>;
  playgroundConfig?: Partial<UniversalPlaygroundConfig>;
  header?: ReactNode;
  className?: string;
}
```

#### 具体实现约束

- 内部仍然允许使用 `SessionSetupPanel`
- `UniversalPlayground` 相关配置沿用 `PlaygroundApp` 当前逻辑
- `showContextPreview: false`
- `layout: 'vertical'`
- 不带 `Logo + NavActions` 那套默认头部

### 2.2 `PlaygroundPreviewPanel`

#### 职责

- connected 时渲染 `PlaygroundPreview`
- disconnected / blocked / required 时渲染统一空态
- 接受 toolbar slot，但不强制渲染整页 toolbar

#### 推荐 props

```ts
export interface PlaygroundPreviewPanelProps {
  controller: PlaygroundControllerResult;
  serverUrl: string;
  header?: ReactNode;
  className?: string;
  emptyState?: ReactNode;
}
```

#### 说明

这里**不需要重写预览内核**。  
已有 [PlaygroundPreview.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundPreview.tsx#L1)
已经是对 `PreviewRenderer` 的薄包装，可以直接作为底层复用。

---

## Phase 3: 把 `PlaygroundApp` 变成新的组合壳

### 变更文件

- `packages/playground-app/src/PlaygroundApp.tsx`
- `packages/playground-app/src/index.ts`

### 目标

让 `PlaygroundApp` 不再直接持有大段业务状态和左右区域细节，而是：

1. 创建 controller
2. 套 `ConfigProvider`
3. 保留 `PanelGroup`
4. 左侧挂 `PlaygroundConversationPanel`
5. 右侧挂 `PlaygroundPreviewPanel`

### 约束

- `apps/playground` 行为必须保持不变
- `PlaygroundApp.less` 只保留整页布局壳相关选择器
- 面板内部样式迁移到 panel 各自的 less 文件

### `index.ts` 需要新增导出

```ts
export { PlaygroundApp } from './PlaygroundApp';
export { PlaygroundPreview } from './PlaygroundPreview';
export { PlaygroundConversationPanel } from './panels/PlaygroundConversationPanel';
export { PlaygroundPreviewPanel } from './panels/PlaygroundPreviewPanel';
export { usePlaygroundController } from './controller/usePlaygroundController';
export type {
  PlaygroundControllerResult,
  PlaygroundControllerState,
  PlaygroundControllerActions,
} from './controller/types';
```

---

## Phase 4: Studio 侧接线

## 4.1 依赖接入

### 变更文件

- `apps/studio/package.json`
- `pnpm-lock.yaml`

### 新增依赖

最小依赖只加：

- `@midscene/playground-app`

不需要让 Studio 直接依赖 `@midscene/playground`，因为 controller 封装在
`playground-app` 内部。

## 4.2 renderer 侧共享 provider

### 新增文件

- `apps/studio/src/renderer/playground/StudioPlaygroundProvider.tsx`
- `apps/studio/src/renderer/playground/useStudioPlayground.ts`
- `apps/studio/src/renderer/playground/types.ts`

### 职责

- 在 Studio renderer 中只创建一次 controller
- 通过 React context 暴露给 `MainContent` 与 `Playground`
- 集中处理 `serverUrl` 和 `appVersion`

### 推荐实现

`ShellLayout` 包住它：

```tsx
<StudioPlaygroundProvider>
  <Sidebar />
  <MainContent />
  <Playground />
</StudioPlaygroundProvider>
```

### 为什么不用 props 一路传

因为最终会同时给：

- `MainContent`
- `Playground`
- 可能的顶部工具条
- 后续连接/切换目标动作

Context 比大规模 props drilling 更稳。

## 4.3 runtime config 接入顺序

### 第一版：先用 renderer 侧静态配置

第一版不要先上 Electron preload bridge。  
先通过 `rsbuild.config.ts` 注入：

```ts
define: {
  __APP_VERSION__: JSON.stringify(appVersion),
  __PLAYGROUND_SERVER_URL__: JSON.stringify(process.env.MIDSCENE_PLAYGROUND_SERVER_URL ?? 'http://127.0.0.1:3000'),
}
```

这样可以先完成真实 UI 集成与样式验证。

### 第二版：再补 typed preload bridge

如果后续要让 Electron `main` 自己托管或发现 playground server，
再新增：

- `apps/studio/src/shared/electron-contract.ts`
- `apps/studio/src/preload/index.ts`
- `apps/studio/src/main/index.ts`

加入：

```ts
getPlaygroundRuntimeConfig(): Promise<{
  serverUrl: string;
  defaultDeviceType?: string;
}>
```

这条 bridge 放在第二阶段更合理，因为它不是当前 UI 集成的阻塞项。

---

## Phase 5: 替换 Studio 占位内容

## 5.1 替换 `MainContent`

### 变更文件

- `apps/studio/src/renderer/components/MainContent/index.tsx`

### 替换策略

保留：

- 当前顶部设备条
- 左侧主区域的圆角、边框、背景
- `Disconnect` / `Chat` 按钮位置

替换：

- 原来静态 `phone-screen` 图片区域

为：

```tsx
<PlaygroundPreviewPanel
  controller={controller}
  serverUrl={serverUrl}
  className="studio-preview-panel"
/>
```

### Studio 样式要求

- 预览区域继续贴合当前白色主卡片
- 不改变顶部条高度
- 不改变左侧主区圆角
- 预览内部如果需要 padding，由 Studio 容器控制，不能反向撑坏主区

## 5.2 替换 `Playground`

### 变更文件

- `apps/studio/src/renderer/components/Playground/index.tsx`

### 替换策略

保留：

- 右侧固定 `w-[400px]`
- 右栏圆角
- 顶部 56px 标题区

替换：

- 欢迎插画
- 静态描述文案
- 假输入框

为：

```tsx
<PlaygroundConversationPanel
  controller={controller}
  appVersion={__APP_VERSION__}
  title="Playground"
  header={<StudioConversationHeader />}
  className="studio-conversation-panel"
/>
```

### Studio 样式要求

- 对话模块必须服从 400px 宽度
- 面板内部滚动不能把外层撑开
- 右栏 header 继续由 Studio 控制，不复用 playground 页头

---

## Exact File Change List

### `packages/playground-app`

- `src/PlaygroundApp.tsx`
- `src/index.ts`
- `src/PlaygroundApp.less`
- `src/controller/usePlaygroundController.ts` new
- `src/controller/types.ts` new
- `src/panels/PlaygroundConversationPanel.tsx` new
- `src/panels/PlaygroundPreviewPanel.tsx` new
- `src/panels/PlaygroundConversationPanel.less` new
- `src/panels/PlaygroundPreviewPanel.less` new

### `apps/studio`

- `package.json`
- `rsbuild.config.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/ShellLayout/index.tsx`
- `src/renderer/components/MainContent/index.tsx`
- `src/renderer/components/Playground/index.tsx`
- `src/renderer/playground/StudioPlaygroundProvider.tsx` new
- `src/renderer/playground/useStudioPlayground.ts` new
- `src/renderer/playground/types.ts` new

### 仅第二阶段再动

- `apps/studio/src/shared/electron-contract.ts`
- `apps/studio/src/preload/index.ts`
- `apps/studio/src/main/index.ts`

---

## Concrete Execution Order

按这个顺序做，风险最低：

1. `packages/playground-app` 抽 controller
2. `packages/playground-app` 抽 `PlaygroundConversationPanel`
3. `packages/playground-app` 抽 `PlaygroundPreviewPanel`
4. `packages/playground-app` 让 `PlaygroundApp` 重用这两块
5. `apps/studio` 引入 `@midscene/playground-app`
6. `apps/studio` 加 `StudioPlaygroundProvider`
7. `MainContent` 接 preview
8. `Playground` 接 conversation
9. 手工对齐 Studio 样式
10. 删除不用的占位素材
11. 只有在确实需要由 Electron 主进程提供 serverUrl 时，再补 preload bridge

---

## Styling Rules

### 必须保留 Studio 的部分

- 外层 `ShellLayout`
- 左 rail 宽度与位置
- 主内容区与右侧栏的圆角
- 主内容区顶部设备条
- 右侧栏顶部标题区
- 整体背景 `#F6F6F6`

### 可调整的部分

- `packages/playground-app` 内部 spacing
- `SessionSetupPanel` 卡片样式
- `UniversalPlayground` 外围容器样式
- preview 空态/警告态样式

### 明确禁止

- 不允许把 `PlaygroundApp.less` 的 `.app-container/.app-panel/.app-content`
  直接用到 Studio
- 不允许让面板组件在 Studio 内部再创建左右分栏
- 不允许让面板组件控制 Studio 的外层圆角、白底卡片和 panel 宽度

---

## Risks And Their Concrete Mitigations

### 风险 1：左右两块状态不同步

**原因**：各自创建 SDK / controller。  
**规避**：只允许 `StudioPlaygroundProvider` 创建 controller，一份状态供两边消费。

### 风险 2：样式污染 Studio

**原因**：直接导入 `PlaygroundApp.less`。  
**规避**：把整页壳层 less 和面板 less 分离，Studio 只消费 panel 级样式。

### 风险 3：`apps/playground` 被重构打坏

**原因**：抽组件时顺手改了现有行为。  
**规避**：必须先让 `PlaygroundApp` 用新 panel 重组完成，再跑它自己的 build/test。

### 风险 4：Modal / Dropdown / message 层级问题

**原因**：嵌入 Studio 后 portal 行为变化。  
**规避**：手工验证 Session setup、message、countdown modal。

### 风险 5：Studio 先被 server 配置阻塞

**原因**：过早绑定 Electron bridge。  
**规避**：第一版先用 `__PLAYGROUND_SERVER_URL__`，bridge 后置。

---

## Validation

## 必跑命令

- `pnpm run lint`
- `pnpm --dir packages/playground-app test`
- `pnpm --dir packages/playground-app build`
- `pnpm --dir apps/studio test`
- `pnpm --dir apps/studio build`

## 必做手工验证

### `apps/playground`

- 启动后整页布局与当前版本一致
- 创建 session、切换 target、disconnect 正常
- 预览与对话联动正常

### `apps/studio`

- 左 rail 完全不变
- 主内容区顶部设备条完全不变
- 右侧栏 400px 宽度不变
- 左预览区域替换后仍在主白卡片内
- 右对话区域替换后不撑破右栏
- server offline 时不崩溃
- session 未创建、已连接、blocked 三种状态都正确
- disconnect 后左右区域同步回到未连接态

---

## What I Would Actually Implement Next

如果现在开始做，我会按下面这组原子提交推进：

1. `refactor(playground-app): extract shared playground controller`
2. `refactor(playground-app): add embeddable conversation and preview panels`
3. `refactor(playground-app): recompose PlaygroundApp from reusable panels`
4. `feat(studio): add shared playground provider and server url config`
5. `feat(studio): replace preview placeholder with playground preview`
6. `feat(studio): replace right panel placeholder with playground conversation`
7. `chore(studio): remove obsolete placeholder assets`

这就是完整可执行方案。没有再留抽象空白。
