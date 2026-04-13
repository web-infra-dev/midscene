# Studio Android-First Playground Integration

## Decision

这期只做 Android 跑通，不同时推进 iOS / Computer / HarmonyOS。

目标是让 `apps/studio` 在保持现有壳层样式不变的前提下，真正接入 Android playground 的两块能力：

- 左侧主区域显示真实 Android 预览
- 右侧栏显示真实对话 / Session Setup / 执行面板

这不是“把 `PlaygroundApp` 整页塞进 Studio”，而是：

1. Electron `main` 进程在本地启动 Android playground server
2. `packages/playground-app` 抽出可嵌入的 controller + 对话面板
3. `apps/studio` 用自己的壳层承载预览与对话能力

---

## Success Criteria

完成后，Studio 的 Android 路径要满足这 6 条：

1. 打开 Studio 时，主进程自动启动本地 Android playground server
2. 没连设备时，右栏能显示真实的 Android Session Setup 表单
3. 连上设备后，左侧主区域显示真实 scrcpy / screenshot 预览
4. 右栏能直接用 `UniversalPlayground` 发指令
5. 左侧顶部设备条和左侧 Android 设备列表反映真实连接状态
6. Studio 现有 shell 样式不被 `playground-app` 的整页布局污染

---

## Hard Constraints

### 保持不变

- [ShellLayout](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/ShellLayout/index.tsx#L5) 的三栏壳层
- 左 rail 宽度、主内容区圆角、右栏 400px 宽度
- 顶部设备条的视觉风格
- “设备总览”仍然是静态导航项，不改回手风琴

### 本期不做

- 不做多平台统一 server orchestration
- 不做 Electron 打包产物分发问题
- 不做 renderer 直连 ADB / scrcpy
- 不做整页 `PlaygroundApp` 嵌入
- 不做 portal / hidden mount 之类的过渡方案

### 明确假设

- 这是 repo 内本地开发运行方案，不是安装包分发方案
- 本机已安装 `adb`
- Android 设备已开启 USB debugging
- `packages/android-playground/bin/scrcpy-server` 由该包自己的 build 流程准备

---

## Why Android Needs Main-Process Hosting Now

Android-first 如果只在 renderer 里接一个 `serverUrl`，Studio 仍然依赖外部先手动起 server，这不算“跑通”。

Android 已经有现成的主机侧能力：

- [androidPlaygroundPlatform](/Users/bytedance/personal/midscene_4/packages/android-playground/src/platform.ts#L30)
- [ScrcpyServer](/Users/bytedance/personal/midscene_4/packages/android-playground/src/scrcpy-server.ts#L41)
- [launchPreparedPlaygroundPlatform](/Users/bytedance/personal/midscene_4/packages/playground/src/platform-launcher.ts#L13)

正确边界就是：

- `main` 进程负责 Node 能力、ADB、scrcpy、server 生命周期
- `preload` 只暴露 bootstrap 状态和重试命令
- `renderer` 只拿 `serverUrl`，其余都走 `PlaygroundSDK`

---

## Final Architecture

```text
apps/studio/main
  -> AndroidPlaygroundRuntimeService
    -> @midscene/android-playground
    -> @midscene/playground server
    -> ScrcpyServer

apps/studio/preload
  -> window.electronShell
  -> window.studioRuntime

apps/studio/renderer
  -> StudioPlaygroundProvider
    -> usePlaygroundController (from @midscene/playground-app)
    -> Sidebar (Android section only becomes live)
    -> MainContent (top device header + PlaygroundPreview)
    -> Playground (right rail + PlaygroundConversationPanel)
```

---

## Exact Implementation Plan

## Phase 1: Boot Android playground in Electron main

### New files

- `apps/studio/src/main/playground/android-runtime.ts`
- `apps/studio/src/main/playground/types.ts`

### Updated files

- [apps/studio/src/main/index.ts](/Users/bytedance/personal/midscene_4/apps/studio/src/main/index.ts#L1)
- [apps/studio/src/shared/electron-contract.ts](/Users/bytedance/personal/midscene_4/apps/studio/src/shared/electron-contract.ts#L1)
- [apps/studio/src/preload/index.ts](/Users/bytedance/personal/midscene_4/apps/studio/src/preload/index.ts#L1)
- [apps/studio/src/env.d.ts](/Users/bytedance/personal/midscene_4/apps/studio/src/env.d.ts#L1)
- [apps/studio/rsbuild.config.ts](/Users/bytedance/personal/midscene_4/apps/studio/rsbuild.config.ts#L1)
- [apps/studio/package.json](/Users/bytedance/personal/midscene_4/apps/studio/package.json#L1)

### Main-side service shape

`android-runtime.ts` 负责：

- 定位 `@midscene/android-playground` 包根目录
- 构造 `ScrcpyServer`
- 调用 `androidPlaygroundPlatform.prepare({ staticDir, scrcpyServer })`
- 调用 `launchPreparedPlaygroundPlatform(prepared, { openBrowser: false, verbose: false })`
- 缓存 `serverUrl` / `status` / `error`
- 在 app quit 时执行 `close()`

推荐返回结构：

```ts
export interface AndroidPlaygroundBootstrap {
  status: 'starting' | 'ready' | 'error';
  serverUrl: string | null;
  port: number | null;
  error: string | null;
}
```

### Preload contract

不要把这套能力继续塞进 `electronShell`。  
新增 `window.studioRuntime`：

```ts
export interface StudioRuntimeApi {
  getAndroidPlaygroundBootstrap: () => Promise<AndroidPlaygroundBootstrap>;
  restartAndroidPlayground: () => Promise<AndroidPlaygroundBootstrap>;
}
```

renderer 只知道：

- server 是否 ready
- url 是多少
- 如果出错，如何重试

### Build rule

`@midscene/android-playground` 必须在 Studio main 构建里 externalize。

原因不是性能，而是它依赖包内相对路径资源：

- `static/`
- `bin/scrcpy-server`

如果把整个包 bundling 进 `dist/main/main.cjs`，这些相对路径会漂。

### Dependencies to add

`apps/studio/package.json`：

- `@midscene/android-playground`
- `@midscene/playground`
- `@midscene/playground-app`

---

## Phase 2: Extract reusable controller and conversation panel

Android-first 不做“大重构版”双 panel 提取。

本期只抽：

1. 共享 controller
2. 可嵌入的 conversation panel
3. 主题 provider

左侧预览直接复用现成的 [PlaygroundPreview.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundPreview.tsx#L1)，不额外造 `PreviewPanel`。

### New files

- `packages/playground-app/src/controller/types.ts`
- `packages/playground-app/src/controller/usePlaygroundController.ts`
- `packages/playground-app/src/panels/PlaygroundConversationPanel.tsx`
- `packages/playground-app/src/PlaygroundThemeProvider.tsx`

### Updated files

- [packages/playground-app/src/PlaygroundApp.tsx](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundApp.tsx#L1)
- [packages/playground-app/src/index.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/index.ts#L1)

### `usePlaygroundController` responsibilities

- 创建单个 `PlaygroundSDK`
- 持有 `antd` form
- 复用 [useServerStatus.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/useServerStatus.ts#L1)
- 复用 [session-state.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/session-state.ts#L1)
- 复用 [session-setup.ts](/Users/bytedance/personal/midscene_4/packages/playground-app/src/session-setup.ts#L1)
- 管理 `sessionSetup`
- 管理 `createSession` / `destroySession`
- 管理 countdown hook

推荐导出：

```ts
export interface PlaygroundControllerResult {
  state: {
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
  };
  actions: {
    refreshServerState: () => Promise<void>;
    refreshSessionSetup: (input?: Record<string, unknown>) => Promise<void>;
    createSession: (
      input?: Record<string, unknown>,
      options?: { silent?: boolean },
    ) => Promise<boolean>;
    destroySession: () => Promise<void>;
    finishCountdown: () => void;
  };
}
```

### `PlaygroundConversationPanel`

职责只有两件事：

- connected 时渲染 `UniversalPlayground`
- disconnected / required / blocked 时渲染 `SessionSetupPanel`

它不再拥有整页 header、左右布局和 page shell。

### `PlaygroundThemeProvider`

把 `ConfigProvider + globalThemeConfig` 从 `PlaygroundApp` 里拿出来。

这样：

- `apps/playground` 继续复用原主题
- `apps/studio` 也能在嵌入态下复用相同主题
- Studio shell 本身不用感知 antd / visualizer 主题细节

---

## Phase 3: Wire controller into Studio shell

### New files

- `apps/studio/src/renderer/playground/StudioPlaygroundProvider.tsx`
- `apps/studio/src/renderer/playground/useStudioPlayground.ts`
- `apps/studio/src/renderer/playground/types.ts`

### Updated files

- [apps/studio/src/renderer/App.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/App.tsx#L1)
- [apps/studio/src/renderer/components/ShellLayout/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/ShellLayout/index.tsx#L1)
- [apps/studio/src/renderer/components/MainContent/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/MainContent/index.tsx#L1)
- [apps/studio/src/renderer/components/Playground/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/Playground/index.tsx#L1)
- [apps/studio/src/renderer/components/Sidebar/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/Sidebar/index.tsx#L1)

### Provider responsibilities

`StudioPlaygroundProvider` 只做三件事：

1. 从 `window.studioRuntime.getAndroidPlaygroundBootstrap()` 取 `serverUrl`
2. 当 bootstrap ready 后，创建 `usePlaygroundController({ serverUrl, defaultDeviceType: 'android' })`
3. 向 `Sidebar` / `MainContent` / `Playground` 提供统一状态

### Renderer state model

```ts
type StudioAndroidConnectionState =
  | { phase: 'booting' }
  | { phase: 'error'; error: string }
  | {
      phase: 'ready';
      serverUrl: string;
      controller: PlaygroundControllerResult;
    };
```

---

## Phase 4: Make the existing Studio chrome consume live Android state

### 4.1 Right rail: replace placeholder with real conversation panel

[apps/studio/src/renderer/components/Playground/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/Playground/index.tsx#L1)

保留：

- 右栏宽度 `w-[400px]`
- 顶部标题条高度和左右 padding

替换：

- 中间欢迎语占位
- 底部假输入框

接入：

- booting: 启动中提示
- bootstrap error: 错误态 + Retry
- runtime ready: `PlaygroundConversationPanel`

### 4.2 Main content: replace fake phone image with real preview

[apps/studio/src/renderer/components/MainContent/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/MainContent/index.tsx#L1)

保留：

- 顶部设备条视觉风格
- 白底主内容区和边框

替换：

- 静态手机图

接入：

- connected: `PlaygroundPreview`
- disconnected: Studio 空态
- booting / error: 对应状态面板

顶部设备条数据源改成真实状态：

- 设备名：`sessionViewState.displayName ?? 当前选中的 setup target`
- Live 徽标：`sessionViewState.connected`
- Disconnect：调用 `controller.actions.destroySession()`

### 4.3 Sidebar: make Android section live, keep others static

[apps/studio/src/renderer/components/Sidebar/index.tsx](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/Sidebar/index.tsx#L1)

这期只把 Android section 改成真实数据源：

- 数据来自 `controller.state.sessionSetup?.targets`
- connected 时，当前 session 对应 target 高亮
- disconnected 时，当前 form 里选中的 device 高亮

交互：

- 点击 Android 设备行：写入 controller form 的 `deviceId`
- 如果该设备就是唯一 target，可直接触发 `createSession`

其余平台：

- 样式不动
- 仍然展示占位
- 不接 runtime

这样能保证 Android 真可用，同时不把本期范围扩大成多平台改造。

---

## Data Flow

```text
main boots Android runtime
  -> preload exposes bootstrap state
    -> renderer provider reads serverUrl
      -> usePlaygroundController(serverUrl)
        -> PlaygroundSDK talks to local Android playground server
          -> Sidebar reads sessionSetup.targets
          -> MainContent reads runtimeInfo + sessionViewState
          -> Playground reads same controller for setup / chat / actions
```

关键点只有一个：  
左预览、右对话、左侧 Android 设备列表必须共享同一个 controller。

---

## Styling Boundary

### Studio owns

- 整体壳层布局
- panel 宽度和圆角
- 左 rail
- 顶部设备条
- 右栏标题条
- 空态容器边距与背景

### `playground-app` owns

- `UniversalPlayground`
- `SessionSetupPanel`
- `PlaygroundPreview`
- 与 playground 执行相关的内部样式
- antd / visualizer theme provider

### Explicitly forbidden

不能把 [PlaygroundApp.less](/Users/bytedance/personal/midscene_4/packages/playground-app/src/PlaygroundApp.less#L1) 的整页布局样式直接带进 Studio：

- `.app-container`
- `.app-panel`
- `.panel-content`
- `.panel-resize-handle`

Android-first 只允许把“内部内容样式”带进来，不允许整页 layout 反向控制 Studio。

---

## Risk And How To Handle It

### 1. Android package relative assets break after Studio bundling

处理：

- `@midscene/android-playground` externalize
- runtime service 显式解析 package root
- `staticDir` 显式传入

### 2. Renderer starts before Android runtime is ready

处理：

- bootstrap state 先走 `booting`
- provider 只在 `ready` 时创建 controller
- 错误态允许 `restartAndroidPlayground`

### 3. Sidebar / MainContent / Playground drift to different device state

处理：

- 三者只读同一个 controller
- 不允许在组件内部各自 new `PlaygroundSDK`

### 4. Session setup form and sidebar selected device diverge

处理：

- Sidebar 点击只改 controller form
- Session create 始终读 controller form 当前值

### 5. Antd theme leaks into Studio shell

处理：

- 用 `PlaygroundThemeProvider` 包裹嵌入内容
- Studio shell 本身不接 antd layout 样式

---

## Tests To Add

### `packages/playground-app`

- `tests/use-playground-controller.test.ts`
  - setup 拉取成功
  - create / destroy session 行为
  - countdown hook 注册 / 清理
- `tests/playground-conversation-panel.test.tsx`
  - connected 渲染 playground
  - disconnected 渲染 setup panel

### `apps/studio`

- `tests/android-playground-runtime.test.ts`
  - bootstrap success
  - bootstrap failure
  - restart flow
- `tests/electron-contract.test.ts`
  - `studioRuntime` contract shape

必要时把 [apps/studio/vitest.config.ts](/Users/bytedance/personal/midscene_4/apps/studio/vitest.config.ts#L1) 的 include 扩成 `tests/**/*.test.{mjs,ts}`，这样主进程服务测试不用硬写成 `.mjs`。

---

## Validation Commands

必须跑：

```bash
pnpm run lint
pnpm --dir packages/playground-app test
pnpm --dir packages/playground-app build
pnpm --dir packages/android-playground build
pnpm --dir apps/studio test
pnpm --dir apps/studio build
```

手工验证必须覆盖：

1. 打开 Studio，Android runtime 自动 ready
2. 未连设备时，右栏显示真实 Android setup
3. 插上 1 台设备时，setup 默认选中且可创建 session
4. 创建 session 后，左侧出现真实预览
5. 右栏能执行至少一条自然语言指令
6. Disconnect 后回到 setup 态
7. Sidebar Android 选中态、顶部设备条、右栏状态一致

---

## Final Recommendation

这一版就是应该直接实施的 Android-first 方案。

它比“先抽完全部 panel 再接 Studio”更小，但不是临时拼装：

- main 进程真正托管 Android runtime
- renderer 只接入真实 server
- Studio 壳层继续拥有布局
- 复用边界只抽到 controller + conversation panel + theme provider
- 预览直接复用现成 `PlaygroundPreview`

这样能最短路径把 Android 跑通，同时不给后面的多平台扩展埋坏边界。
