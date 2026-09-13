# Midscene Android Host（移动版 Agent）

一个最小可用的 **on-device Agent APK**：APK 内自带 Node 运行时与 Midscene agent，通过 Shizuku（rish）以
shell 身份控制本机，**不依赖 Termux，也不依赖 PC**。它是 `docs/deployment.md` 里阶段 C 的第一个切片
（"移动版 studio" 的执行内核 + 最小界面）。

## 它是怎么工作的

```text
ConsoleActivity (Run / Scripts / History)
    │  ProcessBuilder
    ▼
lib/arm64/libnodebin.so            ← Node 运行时（作为 native library 随 APK 交付）
    │  agent/node_modules/@midscene/android-local/dist/lib/cli.js  (midscene-local)
    ▼
@midscene/android-local             ← 本仓库的 transport + device 层
    │  rish -c …                    （RISH_APPLICATION_ID = 本 App 包名）
    ▼
Shizuku server (shell uid 2000) → screencap / input / am / dumpsys / yadb
```

要点：

- **Node 作为 native library**：Android 10+ 禁止从应用私有目录 `execve`，但允许执行 APK 的 `lib/<abi>/`
  下的文件（Shizuku 自己也这么做）。因此 Node 二进制以 `libnodebin.so` 交付，并设置
  `android:extractNativeLibs="true"`（AGP 默认不从 APK 解出 so，而 exec 需要真实文件）。
- **依赖库重命名**：Android 链接器按**文件名**匹配 `DT_NEEDED`，而 AGP 只打包 `*.so`。
  `scripts/patch-elf-sonames.py` 在 `.dynstr` 中把所有旧 soname（`libssl.so.3`、`libicuuc.so.78`、
  `libz.so.1` 等）改写为 `.so` 结尾并把文件重命名；只改 `DT_NEEDED` 会与 `.gnu.version_r` 不一致，
  链接器会报 `cannot find X from verneed[0] in DT_NEEDED list`。
- **JS 侧按需解包**：`assets/agent-bundle.zip` 首次运行时解到 `filesDir/agent`；bundle 使用当前 workspace 的构建产物，
  根目录是 staging 安装本身（`node_modules/` + `examples/` + `package.json`），CLI 位于
  `node_modules/@midscene/android-local/dist/lib/cli.js`。该路径只由 `Provisioner.BUNDLE_CLI_PATH` 一处定义，
  解包校验、Diagnostics 与运行入口都读它——曾出现「解包成功但运行报 agent bundle not extracted yet」，
  就是解包侧改了布局、运行侧还在看旧路径（`BundleLayoutTest` 现在守着这条不变量）。
  解包完成后写入 `filesDir/agent/.bundle-info` 版本戳，APK 更新后自动重解，未变则跳过（`agent bundle up to date`）。
- **模型凭据不落在可见配置里**：`filesDir/model.env`（`KEY=VALUE` 行）被注入子进程环境；
  生产版本应改为 Android Keystore（见 `docs/deployment.md` §5）。

## 测试设备矩阵

本地已创建的 AVD（均使用已安装的 arm64-v8a 系统镜像，无需下载）：

| AVD | 镜像 | 形态 | 用途 |
| --- | --- | --- | --- |
| `Midscene_Phone_API34` | android-34 default | Pixel 7，1080×2400 竖屏 | **Android 14 基准**（rish/DEX 限制、竖屏、可用的 launcher） |
| `Midscene_Tablet_API34` | android-34 default | Pixel Tablet | `layout-sw600dp` 侧边导航与宽屏布局 |
| `Midscene_Fast_API32ATD` | android-32 google_atd | Pixel 5，精简 ATD | 快速冒烟回归 |
| `HaloCanvas_RemoteScreen_API31` | android-31 | 车机双屏 | 对照组（launcher 不可用，仅作参考） |

启动示例：

```bash
emulator -avd Midscene_Phone_API34 -no-audio -no-boot-anim -gpu swiftshader_indirect
```

## 无人化部署（adb）

```bash
scripts/adb-bootstrap.sh \
  --shizuku-apk <shizuku.apk> \
  --model-env <model.env> \
  --config <config.yaml>
```

完成：安装两个 APK → 启动 Shizuku server（走它自己的 `libshizuku.so`）→ 部署 `rish` 与 `rish_shizuku.dex`（Android 14 起 dex 需只读）→ 注入 `model.env`/`config.yaml` 到应用私有目录 → 电池白名单 + 通知授权 → 通过仅 Debug 导出的 `AgentService` action 触发 provisioning（agent bundle + yadb）。

幂等：可加 `--skip-install` 重复执行。

## Android 14 实测要点（重要）

- **Node v24.18.0 可正常运行**；bundle 版本戳会在 APK 更新后自动重新解包
- **授权**：必须走官方 API —— Setup → RUNTIME → `Authorize Shizuku`（`Shizuku.requestPermission()`）。rish 调用无法拉起授权弹窗；`pm grant API_V23` 也不能绕过（Shizuku 13.x 自建授权存储）
- **rish 在本机应用进程中不可用**：前台 Activity / 前台 Service / `run-as` 三种来源都只返回 `Aborted`。因此后续把提权执行改为 **Shizuku UserService**（`bindUserService` + AIDL），Node 侧经回环 HTTP 调 App 内的执行桥
- 手机布局必须用 `BottomNavigationView`（抽象类 `NavigationBarView` 会 inflate 崩溃）

## 构建

```bash
cd apps/android-host

# 1) Node 运行时（从已装 Termux 的设备拉取并改写 soname）
./scripts/fetch-node-runtime.sh                 # 或 --from <dir>（bin/node + lib/*.so）
# 2) JS 侧（wasm 版 sharp，保证 android-arm64 可用）
pnpm --filter @midscene/shared build
pnpm --filter @midscene/core build
pnpm --filter @midscene/android-local build
# 3) APK
pnpm assemble                            # 产物 app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` 需要指向 Android SDK（`sdk.dir=...`），`jniLibs/` 与 `agent-bundle.zip` 均为生成物，已在
`.gitignore` 中忽略（APK 大小随 Node 运行时与 bundle 内容变化）。

JVM 单测（`BundleLayoutTest` 会校验已生成的 `agent-bundle.zip`，资产缺失时跳过该条；`ModelEnvFileTest`
钉住模型凭据的解析/写回规则）：

```bash
cd apps/android-host && ./gradlew :app:testDebugUnitTest
```

App 图标与标题栏品牌标同源同比例（`drawable/ic_brand_mark.png`，mark 占蓝底约 0.75），改版式后重新生成：

```bash
pnpm --filter android-host icons        # 需要 Pillow；写出 ic_launcher_foreground.png 与 mipmap-*/ic_launcher.png
```

自适应图标上 mark 占画布的比例（`--mark-box`，当前 0.53）是**在设备上量出来的**：launcher 只露出画布中间约
0.67，所以 0.53 才让可见区域里的 mark 和标题栏一样占 0.75。换 launcher/换素材后按同样方法复核——装上去、
截应用抽屉、量 mark 外轮廓与蓝色方块的比例。

排查解包问题：`adb shell run-as com.midscene.localagent ls -l files/agent/node_modules/@midscene/android-local/dist/lib/cli.js`
（这就是运行入口读取的路径），以及 `adb shell run-as com.midscene.localagent tail files/run/agent.log`。

## 界面（Compose 控制台）

Jetpack Compose（Kotlin 2.0 + Compose BOM），令牌取自 desktop studio，三个主入口（设置与诊断从右上角进入），
标题左侧是品牌标（与 launcher 图标同一素材、同一比例：品牌蓝底 + mark 约占 0.75，明暗主题都可读）：

| 页签 | 功能 |
| --- | --- |
| **Run** | 自然语言指令、Run / Stop、最近一次结果；键盘弹出自动顶起内容 |
| **Scripts** | `config.yaml` 编辑与运行、Run / Save / Self-check / New template（模板自带正确的 `fileChannelDir`） |
| **History** | 运行记录卡片列表（状态点、任务名、时间·耗时·通过数）→ 手机弹窗 / **平板右栏详情** → **Log** 与 **Report** |
| **Settings → Diagnostics** | runtime 状态（node / agent bundle / yadb / shizuku user service / overlay permission）、Provision、Authorize、Battery / Shizuku / Overlay、服务日志 |
| **Settings** | 暗色主题、悬浮进度、运行结束返回 App、模型凭据（Form Style / .env Style） |

响应式：手机底部导航；宽度 ≥600dp 切 `NavigationRail`，History 变双栏。

## 模型凭据：Form 与 .env 两种风格

与 desktop studio 的 Config 弹窗同名同义，切换时编辑内容互相带过去（两者共用同一份文本）：

- **Form Style**（默认）：四个字段 `MIDSCENE_MODEL_BASE_URL` / `MIDSCENE_MODEL_API_KEY` /
  `MIDSCENE_MODEL_NAME` / `MIDSCENE_MODEL_FAMILY`，占位符与 studio 一致；API Key 默认掩码，右侧眼睛可临时显示。
  每次输入通过 `ModelEnvFile.setValue` 就地改写那一行，**注释、空行和其他自定义变量都原样保留**。
- **.env Style**：直接编辑 `KEY=VALUE` 文本，Paste 覆盖全文；Form 下的 Paste env 则是把剪贴板里的键值
  **合并**进文件（不会清掉它没提到的键）。
- 两者共用底部一行状态：必需项（API Key / Base URL / Model name，兼容 `OPENAI_*` 别名）齐全时显示绿色的
  Ready，缺哪项就红字点名——保存不会被拦住（允许先存一半），但不会让"半配置"看起来像配好了。
- 空值会**删掉该行**而不是留 `KEY=`；含空格、引号、`#`、`=` 的值会加引号，保证写回与 agent 读到的完全一致
  （解析与注入都在 `ModelEnvFile`，见 `ModelEnvFileTest`）。

## Agent 可视化浮层

一个全屏、不可触摸的 overlay surface 承载四种信息（**全部不进截图**，含 `adb screencap`）：

| 元素 | 说明 |
| --- | --- |
| 顶部状态卡 | 状态点（蓝=进行中 / 绿=完成 / 红=失败）、人类可读状态词、`Step 2/5` 步骤片、当前步骤、实时计时；画在**系统状态栏之下**、按内容宽度居中的深色玻璃卡 |
| 边框流光 | 运行中沿屏幕边缘流动的光条（3.6s/圈，demo 模式 2.2s 更亮更粗） |
| 元素框 | agent 定位到的元素：品牌蓝虚线 + 淡填充，动作后约 2.5s 淡出 |
| 点击涟漪 | 实际落点的扩散圆环（0.7s） |

状态卡的措辞与排版规则（`ProgressText`，纯逻辑、有单测）：

- **原始载荷不上屏**：yaml 任务的 `script:` YAML 概括成 `Script · 5 actions · first: tap "…"`，
  slug 步骤名（`open-the-settings-app`）还原成词，结构化事件不再以 JSON 形式出现；
- **数值带标签**：`Step 6.7s · Total 15s`。事件只按步骤到达，所以计时由浮层在帧循环里自己走，
  不会停在事件到达的那一刻（旧版一个 20s 的步骤里计时是冻住的）；
- **大小写与用词统一**：句首大写、去掉 runner 术语（`acting`→`Working`、`asserting`→`Checking`），
  文件名之类保持原样（`model.env: …` 不会被写成 `Model.env`）；
- **位置与宽度**：卡片画在系统状态栏之下——旧版固定在屏幕顶端 10.5dp，正好压在时钟/电量图标下面，
  这就是"看不见"的原因；宽度按内容自适应并居中（空闲时是一颗小胶囊），相位与计时先测量再落笔，
  长文本省略号截断，不会再互相压住或溢出屏幕。

Settings 只保留悬浮进度总开关；具体动效使用统一默认样式。

> 注意：应用级 overlay **无法覆盖系统 dock 与状态栏**（系统层级规则）；要让浮层常驻可见又不进截图，靠的是自有 surface 上的 `setSkipScreenshot`（隐藏 API，经 HiddenApiBypass；不可用时自动降级为"截图前后隐藏"）。

## 自检（自举）

App 内 **Scripts → Self-check**：一键写入 `self-check.yaml` 并立即运行——轮流 `aiTap` 三个主入口，再聚焦 Run 页的指令框 `aiInput` 一段文本。全程在 App 内、由 App 驱动自身界面，用于评估"定位→操作"的真实延迟；脚本同时保存在 `packages/android-local/examples/self-check.yaml`。

脚本措辞按**运行时的形态**生成（`SelfCheckScript`，有单测钉住）：

- 导航按机型只说一处：手机"应用内的**底部标签栏**"、平板"**左侧标签栏**"。不写成"左侧或底部"让模型去猜，也不用"导航栏"——Android 上"导航栏"还指系统那一条返回/主页/最近键。
- 指令框锚在页面**常显的 `INSTRUCTION` 标题**上，占位文案只作次级提示：该输入框会保留上次指令，多数时候根本没有占位文字（实测过一次按占位文字定位失败）。
- 不用"首页"称呼 Run 页：手机上"首页"会被理解成系统桌面，模型会去找 launcher 而不是眼前这个框。

## 悬浮窗进度

运行期间在系统状态栏下方显示一张居中的状态卡（状态点 + 当前动作 + 步骤计数 + 实时计时，详见上节
"顶部状态卡"）。**任何包含 `screencap` 的命令执行期间自动隐藏**，因此报告里的截图永远不会带上浮层。
运行结束后可自动把控制台拉回前台（Settings 可关）。

**动作级进度**：runner 只在任务边界上报 step，而自检这类 `yaml` 脚本整体只是一个 step——所以脚本跑 25s
的时候状态一直停在 `1/1`。现在 runner 把 agent 的每个设备动作转成 `action` 事件
（`packages/android-local/src/runner/run.ts`，走 `onTaskStartTip`，ScriptPlayer 会链式调用它），
状态卡/通知于是显示当前动作：脚本步骤是干净文本（`Tap "Scripts 标签"`），AI 规划的动作是参数里的 prompt
（`Tap "Settings app icon…"`，JSON 里可读的那部分，抽不出来就只留动词），并做了长度截断。

**通知**（`AgentService` → `ProgressText`）：标题 `Working · 1/1`、正文 `Tap "Wi-Fi" · 15s`，每个 step/action
事件都刷新——旧版只在 run 开始写一次（`running config / preparing`），通知栏里整轮都不动。

## 防呆（运行期间锁住会互相干扰的操作）

`rememberRunBusy()` 订阅服务状态，以下控件在运行中禁用并给出原因，避免"看起来生效其实没有"或直接把
运行中的文件改掉：

| 位置 | 运行中 | 原因 |
| --- | --- | --- |
| Scripts 编辑器 / Run / Save / Self-check / New template | 只读 + 禁用 | CLI 正在读 `config.yaml`；再起一个 run 会被服务忽略 |
| Settings 模型凭据 Save / Paste env | 禁用 | 运行中的进程用的是启动时的环境，改了也不会生效 |
| Diagnostics Provision / Re-authorize | 禁用 | 解包会删掉正在执行的 agent 目录；中途换授权会断掉 shell 通道 |
| Diagnostics Clean now | 禁用 | 会删掉当前 run 的结果/报告 |
| History Delete（含详情栏与确认框） | 禁用 | 同上，当前 run 正在写这些文件 |
| Run 页 Run / Stop | 已按 `isBusy()` 处理 | —— |

运行中的界面会用品牌蓝提示当前是锁定状态（例如 Scripts 页顶部："A run is in progress — the script and its
buttons are locked until it ends"）。

**报告查看**：History → Report 用 WebView 打开 Midscene 生成的单文件 HTML 报告（执行时间线、每一步耗时、
Record 逐帧回放与视频条、失败原因气泡），与桌面端一致。

## 守护与保活

- **前台 Service**（`AgentService`，`foregroundServiceType=specialUse`）持有所有运行；通知显示状态，
  运行期间持有 `PARTIAL_WAKE_LOCK`。
- **Activity 与运行解耦**：切后台、被系统回收都不影响任务（实测：App 切到后台后任务继续跑完 45s）。
- **电池优化豁免**：Setup 页提供系统对话框入口（`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`），
  属于用户可见、用户主动开启的通用合法方案，不依赖 adb 特权。
- 服务级日志落盘 `files/run/agent.log`，每次运行的完整输出落盘 `files/run/<runId>.log`。

## yadb 自动分发（无需 adb push）

yadb 需要落在 `/data/local/tmp`（shell 身份可读），但 **SELinux 不允许 app 写该目录**。方案：

```text
APK assets/yadb
   │  ① App 复制到自己的外部目录（shell 可读）
   ▼
/storage/emulated/0/Android/data/<pkg>/files/yadb
   │  ② rish（shell uid 2000）cp → /data/local/tmp/yadb && chmod 644
   ▼
/data/local/tmp/yadb   ← 中文输入 / pinch 即刻可用
```

实测日志：

```
[01:40:46] extracted agent bundle in 657 ms
[01:40:46] staged yadb at /storage/emulated/0/Android/data/.../files/yadb (14431 bytes)
[01:40:47] yadb-installed
[01:40:47] midscene-local v1.12.6 (node v24.18.0)
```

首次使用任何一个需要 Shizuku 的功能时会弹授权框（"Allow Midscene Local to access Shizuku?"），
选择 **Allow all the time**。

## 已验证（Android 12 模拟器 / arm64）

| 步骤 | 结果 |
| --- | --- |
| APK 内 exec Node | ✅ `midscene-local v1.12.6 (node v24.18.0)`（Node 从 `lib/arm64/libnodebin.so` 执行） |
| Shizuku 授权本 App | ✅ 弹窗针对 `com.midscene.localagent`，授权后 rish 以 shell(2000) 工作 |
| `doctor` | ✅ `uid: 2000`、`privileged: true`、shell/screenshot/input/appManagement/multiDisplay/gestures 全 true |
| `run config`（aiAct + aiAssert） | ✅ 任务 1 完成真实点击（19.3s，ok）；任务 2 的断言由模型如实判失败（模拟器 launcher 未起来，非链路问题）；结果 JSON 落盘 `files/midscene_run/results/` |

## 验证环境提示

模拟器（2 核 / 2GB）的 launcher 本身不稳定，经常停留在 "Pixel is starting..."，因此 `home` 相关断言
会由模型如实判失败——这是环境问题，不是链路问题。截图 → 模型 → 动作 → 结果落盘的链路在同一环境下是通的。

## 已知限制（下一步）

1. **Node 运行时来自 Termux 包**：可用但不是产品形态；自编译 Node 22/24（NDK + libnode）是 Phase 2 主线，
   替换时只需换掉 `libnodebin.so` 与依赖库，应用与 transport 代码不变。
2. **凭证仍是明文文件**：`model.env` 明文存于应用私有目录（Form 模式输入框已做掩码，`.env` 模式与 Settings
   粘贴仍是明文）；生产版需转 Android Keystore；`config.yaml` 不含密钥（这点已经做到）。
3. **历史条目只增不删**：详情对话框提供了日志删除；索引清理/导出（部署文档 M2）待补。
4. **模拟器环境**：2 核模拟器的 launcher 常驻 "Pixel is starting…"，`home`/launcher 相关断言会由模型
   如实判失败——链路正常，真机需复测。
