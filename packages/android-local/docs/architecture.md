# android-local 架构与契约

本文是 `packages/android-local` 的设计基线。契约一旦冻结（Phase 1 P1-1），任何后端实现（rish / Shizuku UserService / OEM Privileged / ADB shell）都必须满足同一份契约。

## 1. 分层

```text
Android Host App / Agent Runtime
        │
  Midscene Core / Agent / YAML / Model Client
        │
  LocalAndroidDevice          ← 只描述「设备能做什么」
        │
  AndroidTransport            ← 只描述「通过什么权限与协议做到」
        │
  ┌───────────────┬──────────────────┬─────────────────────┐
  │ RishTransport │ ShizukuTransport │ OemPrivileged/Adb   │
  │   (POC)       │  (UserService)   │ (长期/调试)          │
  └───────────────┴──────────────────┴─────────────────────┘
        │                │                    │
   rish / shell    AIDL + JNI        System/Binder 或 adb server

PC/服务器调试路径：AndroidDevice → AdbTransport → adb server → Device
```

设计要点：`LocalAndroidDevice` 只调用 `AndroidTransport`，业务层完全不知道底层是 ADB、rish、Shizuku 还是系统签名。

## 2. 本仓库现状证据（决定上述设计的事实）

| # | 发现 | 影响 |
| --- | --- | --- |
| E1 | `main` 与 `origin/main`、`upstream/main` 一致（0 提交差异），工作区干净；`android-remote-control` 分支与 `main` 相同 | 可直接从 `main` 拉分支 |
| E2 | `packages/android/src/device.ts` 2803 行，硬耦合 `appium-adb`（`connect(): Promise<ADB>`、`getAdb()`、adb proxy、scrcpy adapter、yadb、IME），并依赖 `@yume-chan/*`、`sharp`、可选 ffmpeg | 就地改造会与上游长期 rebase 冲突 → 新包并行，Phase 1 末单向收敛 |
| E3 | `packages/shared/src/img/*` 的 `ifInNode` 分支硬依赖原生 `sharp`（`get-sharp.ts`）；`convertImgBufferToJpeg` 在 Node 下**抛错而非回退**，photon(WASM) 只在浏览器/worker 分支 | G0 头号阻塞：Android Node 上 sharp 无 bionic 预编译产物 → 必须先做图片后端回退（P0-2） |
| E4 | Core 运行路径上 `cropByRect`（sharp 分支）被 `ai-model/workflows/grounding/search-area.ts`、`service/index.ts` 调用 | 回退不是可选项；需覆盖 `resizeImg` / `cropByRect` / `paddingToMatchBlock` / `convertImgBufferToJpeg` / `box-select` 调用点 |
| E5 | 实测：`adb shell 'screencap -p \| base64 -w0'` ≈ 290ms / 211KB 合法 PNG；`screencap`（不带 `-p`）输出原始 RGBA（2560×1600 头）；`input keyevent 3` ≈ 70ms；`id -u` = 2000 | 截图走 `-p` + base64 管道可行且不落盘；原始 RGBA 不能直接当作图片 Buffer |
| E6 | `dumpsys display` 含 `DisplayDeviceInfo{"Built-in Screen", 2560 x 1600, … density 320, rotation 0, type INTERNAL}`、`mBaseDisplayInfo=DisplayInfo{"Built-in Screen", displayId 0", … real 2560 x 1600 …}`；本机还有 `scrcpy` 虚拟屏 `displayId 10`（4032×284） | `displayId` 必须是一等参数；解析器需要 fixture 测试（含虚拟屏与 `displayId 0"` 脏格式） |
| E7 | 设备上无 Termux、无 Shizuku、无 rish；本机只有一个 API 31（Android 12）AVD | Phase 0 先解决「设备侧 Node 运行时 + Shizuku/rish 部署」；Android 14+ 结论暂缺 |
| E8 | `@midscene/core` 的 `Agent` 构造签名是 `(interfaceInstance, opts)`，core 只在报告命名与 `deviceType` 使用 `interfaceType`，不按 `'android'` 分支 | 骨架不需要 AndroidAgent 子类，`new Agent(localDevice, opts)` 即可 |
| E9 | Nx 自动从 pnpm workspace 推断项目与 `build`/`test` 目标；commitlint scope 由 `packages/*` 目录名自动生成 | 新包自动获得 `@midscene/android-local` 项目与 `android-local` scope，无需注册 |
| E10 | `ci.yml` 忽略 `docs/**`；`lint.yml` 只跑 `check-dependency-version` + biome；`check-dependency-version` 要求跨包依赖版本串一致 | 文档不影响 CI；新包依赖版本串必须与现有包逐字一致 |
| E11 | `scripts/check-tsconfig-references.mjs` 强制 workspace 依赖必须有 tsconfig `references`；`scripts/type-check-tests.mjs` 自动纳入含 `tests/` 的包 | 新包必须写 `references: [../core, ../shared]` |

## 3. `AndroidTransport` 契约

```ts
type TransportBackend =
  | 'rish'               // POC：普通 Node → rish → Shizuku shell
  | 'shizuku-userservice'// 产品化：App → Binder/AIDL → UserService
  | 'oem-privileged'     // 车机：platform/priv-app/system service
  | 'adb-shell'          // 调试/回归基线
  | 'local-shell';       // 无提权降级（仅无特权命令）

interface AndroidCapabilities {
  backend: TransportBackend;
  shell: boolean;
  screenshot: boolean;
  input: boolean;
  appManagement: boolean;
  multiDisplay: boolean;
  textInput: 'full' | 'ascii-only' | 'none';
  privileged: boolean;
  uid: number | null;
}

interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  density: number;
  rotation: 0 | 90 | 180 | 270;
  isDefault: boolean;
}

interface TransportHealth {
  ok: boolean;
  backend: TransportBackend;
  uid: number | null;
  latencyMs: number;
  checkedAt: number;
  details?: string;
  error?: AndroidTransportError;
}

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface AndroidTransport {
  readonly backend: TransportBackend;
  getCapabilities(): Promise<AndroidCapabilities>;
  screenshot(options?: { displayId?: number; timeoutMs?: number }): Promise<Buffer>;
  getDisplayInfo(options?: { displayId?: number }): Promise<DisplayInfo>;
  listDisplays(): Promise<DisplayInfo[]>;
  tap(x: number, y: number, options?: { durationMs?: number }): Promise<void>;
  swipe(from: Point, to: Point, options?: { durationMs?: number }): Promise<void>;
  keyEvent(keyCode: number): Promise<void>;
  inputText(text: string, options?: { timeoutMs?: number }): Promise<void>;
  startActivity(target: { packageName: string; activity?: string; uri?: string }): Promise<void>;
  forceStop(packageName: string): Promise<void>;
  runShell?(command: string, options?: { timeoutMs?: number }): Promise<ShellResult>;
  healthCheck(): Promise<TransportHealth>;
  close(): Promise<void>;
}
```

契约不变量：

1. `screenshot()` 返回**图片字节**（PNG/JPEG，调用方不需要知道来源），不返回 base64 字符串，不写临时文件。
2. `displayId` 在所有屏幕相关方法上都是一等参数，默认屏由 `DisplayInfo.isDefault` 表达，而不是硬编码 `0`（E6：本机存在 `displayId 10` 的虚拟屏）。
3. `tap`/`swipe` 使用**设备像素坐标**；坐标 → 逻辑坐标的换算属于 device 层，不属于 transport。
4. `keyEvent` 只接受 Android keycode 数字，键名映射属于 device 层（`src/keycodes.ts`）。
5. 传输层不缓存状态、不做隐式重试、不在失败时返回空值——一律抛 `AndroidTransportError`。

## 4. 错误模型与策略

```ts
type AndroidTransportErrorCode =
  | 'PermissionDenied'   // uid 不足、Shizuku 未授权、命令被 SELinux 拒绝
  | 'CommandFailed'      // 命令存在但非零退出
  | 'ScreenshotFailed'   // 截图获取/解码/magic 校验失败
  | 'Timeout'            // 超时（含 rish 拉起超时）
  | 'ServiceUnavailable' // rish/Shizuku 服务不可达，需要重新拉起
  | 'NotSupported'       // 该后端不具备此能力（如非 ASCII 文本输入）
  | 'InvalidArgument';   // 参数非法（坐标为 NaN、displayId 为负等）
```

`AndroidTransportError extends Error`，携带 `code`、`backend`、`command?`、`exitCode?`、`stdout?`、`stderr?`、`cause?`。**上层永不解析 stderr 文本做分支**，只读 `code`。

策略：

- **超时**：每次调用单次带超时（默认 15s，截图 20s），由 transport 强制；超时抛 `Timeout`。
- **重试**：transport 不自动重试；降级只允许出现在实现内部的**等价手段**（如截图先 `base64` 管道、再二进制直读），且必须记录 debug 日志。
- **并发**：命令并发上限默认 4（`maxConcurrentCommands`），避免车机上进程风暴；超限排队而非拒绝。
- **命令构造**：所有命令在 transport 内用 `quoteShellArg()`（POSIX 单引号转义）拼装。device 层与业务层只能传结构化参数或 argv，禁止传 shell 片段。

## 5. `LocalAndroidDevice`

- `class LocalAndroidDevice implements AbstractInterface`，**不继承** `AndroidDevice`（后者是 ADB 专属）。
- `interfaceType = 'android'`（与 `AndroidDevice` 一致，保证报告命名与 `deviceType` 语义一致）。
- `screenshotBase64()`：`transport.screenshot({ displayId })` → `createImgBase64ByFormat('png', …)`。
- `size()`：取自 `getDisplayInfo()`；逻辑尺寸口径必须与 `AndroidDevice` 对齐，Phase 1 P1-2 用回归任务核对。
- `inputPrimitives`（core `MobileInputPrimitives`）：`pointer` / `touch` / `keyboard` / `scroll` / `system` 全部由 transport 原语实现；`system` 映射到 `keyEvent(BACK 4 / HOME 3 / RECENT 187)`。
- `actionSpace()`：`createDefaultMobileActions({ input, size, sleep, systemActions })`，按钮名与 `AndroidDevice` 一致（`AndroidBackButton` / `AndroidHomeButton` / `AndroidRecentAppsButton`），并按 `getCapabilities()` 裁剪不支持的动作。
- 骨架阶段**不注册** shell / Launch / Terminate 类模型可见动作；`runShell` 仅保留在 transport，供 Phase 0 诊断脚本使用。是否与 `AndroidDevice` 的 `Launch` / `Terminate` / `RunAdbShell` 对齐，留到 Phase 1 P1-4 回归对照阶段决定。

## 6. `RishTransport` 实现要点

| 项 | 决定 |
| --- | --- |
| 启动方式 | 默认 `spawn('sh', [rishPath, '-c', cmd])`（`useShLauncher: true`），规避 `/sdcard` noexec 与直接 `execve` 的差异；P0-4 对比两种方式并记录结论 |
| `rishPath` | `MIDSCENE_RISH_PATH` → 默认 `/data/local/tmp/rish` |
| 截图 | `screencap -p [-d <displayId>] \| base64 -w0` → `Buffer.from(b64)` → PNG magic 校验 → 失败降级为二进制直读 `screencap -p` → 仍失败抛 `ScreenshotFailed`（附 stderr 截断） |
| 输入 | `input [-d <displayId>] tap/swipe/keyevent`；`input text` 仅支持 ASCII，非 ASCII 显式抛 `NotSupported`（中文/特殊字符留给 Phase 3 的专用输入服务，禁止静默半成功） |
| 应用管理 | `am start -W -n pkg/activity`、`am start -W -a android.intent.action.VIEW -d <uri>`、无 activity 时 `monkey -p <pkg> -c android.intent.category.LAUNCHER 1`、`am force-stop <pkg>` |
| 能力探测 | `id -u` 必须为 2000 或 0，否则 `PermissionDenied`；逐项探测 `screencap` / `input` / `am`；结果缓存并写 debug 日志 |
| 依赖注入 | 通过 `CommandRunner` 注入（`NodeCommandRunner` / `FakeCommandRunner`），保证单测与契约测试完全离线 |

## 7. 与 ADB 路径的收敛策略（Phase 1 末执行）

1. 纯逻辑（display 解析、坐标/滚动数学）下沉到 `packages/android-local` 并被 `packages/android` 消费。
2. 依赖方向固定为 `packages/android → packages/android-local`，**禁止反向**。
3. `@midscene/core` 永不依赖 Android / Shizuku / JNI。
4. 唯一需要改上游文件的地方是 P0-2 的图片后端回退（`packages/shared/src/img/*`），保持小而可上游化。
