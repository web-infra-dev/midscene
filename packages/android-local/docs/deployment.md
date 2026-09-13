# 部署与配置方式

目标形态（按调研文档）：**APK 植入的移动版 Agent 管理器** —— 简单版"移动 studio"，
即"脚本 + 配置管理器"：在手机上管理配置、跑脚本、看结果，不依赖 PC。

本文给出部署模型、配置格式、目录布局与演进路径。当前已落地的是**阶段 A（Termux/Node CLI）**，
阶段 B 的 APK 内嵌 Node 是 Phase 2 的主体工作。

## 1. 部署模型

| 阶段 | 形态 | 运行时 | 权限通道 | 状态 |
| --- | --- | --- | --- | --- |
| **A. 设备本机 CLI** | Termux 内 `midscene-local` | Termux `nodejs-lts` (24.x) | Shizuku → rish（shell 2000） | ✅ 可用 |
| **B. 宿主调试** | PC + USB 上的 `midscene-local` | 开发机 Node | adb（shell 2000） | ✅ 可用 |
| **C. APK 内嵌 Agent** | Android Host App（Node 作为 native library + 最小 UI） | 随 APK 交付的 Node（当前取自 Termux 包，见 `apps/android-host/`） | rish（Shizuku 授权给本 App）→ 后续换 UserService | ✅ **M3 切片已在模拟器验证** |
| **D. 车机/系统应用** | priv-app / 系统服务 | 同上 | platform signature / OEM 服务 | Phase 3（条件式） |

阶段 A 与 C **共用同一个配置与脚本模型**：`midscene-local run config.yaml` 这条命令既是
今天的 CLI 入口，也是将来 App 内部"运行"按钮调用的地方。

## 2. 命令面（当前）

```bash
# 体检：能力、健康、显示信息、截图耗时
midscene-local doctor --backend rish
midscene-local doctor --backend adb-shell --serial emulator-5554

# 运行配置：逐任务执行并输出 JSON 结果（任务失败会记录但不中断后续任务）
midscene-local run examples/local-agent.config.yaml
```

退出码：`0` 全部成功 / `1` 有任务失败或设备不可用 / `2` 用法或配置错误。

## 3. 配置文件

YAML 或 JSON，schema 定义在 `packages/android-local/src/config/schema.ts`（zod 校验，错误信息带字段路径）。

```yaml
name: phone-smoke

device:
  backend: rish            # rish | adb-shell
  displayId: 0             # 省略则用默认屏
  rishPath: /data/local/tmp/rish
  fileChannelDir: /data/local/tmp/midscene-channel   # 大 payload 通道目录
  yadbPath: /data/local/tmp/yadb                     # 中文输入 / pinch
  appNameMapping: { 设置: com.android.settings }      # Launch/Terminate 友好名
  exposeRunAdbShellAction: true                      # 显式开启模型可见 shell 动作；默认关闭

model:                     # 省略则读环境变量 MIDSCENE_MODEL_*
  apiKey: sk-...
  baseUrl: https://...
  name: gemini-3-flash
  family: gemini

agent:
  generateReport: true
  reportDir: ./midscene_run/agent-results   # 每次运行落一份 JSON 结果
  screenshotShrinkFactor: 1
  aiContexts: { default: 设备是中文系统 }

tasks:
  - name: settings-search
    type: yaml             # yaml | aiAct | aiAssert | aiQuery
    script: ./scripts/settings-search.yaml     # 支持文件路径或内联 YAML
  - name: back-home
    type: aiAct
    prompt: go back to the home screen
```

任务语义：

| type | 行为 |
| --- | --- |
| `aiAct` | `agent.aiAct(prompt)`：感知 + 规划 + 动作 |
| `aiAssert` | `agent.aiAssert(prompt)`：断言，不成立即该任务失败 |
| `aiQuery` | `agent.aiQuery(prompt)`：返回结构化结果并写入结果文件 |
| `yaml` | `agent.runYaml(script)`：跑标准 Midscene YAML 脚本（`tasks[].flow[]`） |

结果文件（`agent.reportDir` 配置后）：

```json
{
  "name": "phone-smoke",
  "startedAt": 1789146000000,
  "durationMs": 42123,
  "ok": true,
  "device": "AndroidLocalDevice(backend=rish, uid=2000, displayId=0)",
  "capabilities": { "textInput": "full", "gestures": true, "uid": 2000 },
  "tasks": [{ "name": "back-home", "type": "aiAct", "status": "ok", "ms": 8123 }],
  "resultFile": "./midscene_run/agent-results/phone-smoke-....json"
}
```

## 4. 设备侧文件布局（阶段 A）

```text
/data/local/tmp/
├── rish                      # Shizuku shell 入口（882B 脚本，从 APK assets 提取）
├── rish_shizuku.dex          # rish 的 dex（58KB；Android 14+ 需 chmod 400）
├── yadb                      # 可选：中文输入 / pinch（14KB dex）
└── midscene-channel/         # 大 payload 通道（截图/大文本），固定文件名，shell 侧清理
    ├── shot.png
    └── shell.txt

/data/data/com.termux/files/home/midscene-poc/   # 阶段 A 的工程目录
├── package.json / node_modules/                 # 依赖（含 wasm 版 sharp）
├── agent.config.yaml + scripts/                 # 配置与脚本
└── midscene_run/                                # 报告与结果
```

要点（Phase 0 实测）：

- 截图**不能**走 rish 管道（大输出会被拆到 stdout/stderr 两条管道）；必须走设备本地文件通道。
- app uid 无法写/删 `/data/local/tmp`（SELinux），通道清理由 shell 在写入命令内完成。
- APK bundle 使用 pnpm deploy 从当前 workspace/lockfile 安装依赖，并配置 wasm32 可选依赖（原生 sharp 无 android-arm64 产物）。

> 阶段 A 实测（2026-09，Android 12 / arm64 / Termux Node 24）：`doctor` 与 `run` 均在设备本机跑通；
> 注意模拟器（2 核）上 AI 任务耗时会显著放大（单个 `aiAct` 112s），真机需复测。

## 5. 配置与密钥管理

| 项 | 阶段 A（现在） | 阶段 C（APK） |
| --- | --- | --- |
| 配置文件 | 明文 YAML（应用私有目录或 Termux home） | 应用私有目录 + 导入/导出 |
| 模型密钥 | 环境变量优先，其次配置文件 | Android Keystore 加密存储，UI 内录入 |
| Shizuku 授权 | 首次人工点确认（Allow all the time） | 同上，App 内引导 |
| 结果与报告 | `reportDir` 下的 JSON + HTML 报告 | 应用内列表 + 报告查看器 |

**不要在共享设备上把密钥写进配置文件再分发**：阶段 C 的计划是密钥只进 Keystore，
配置文件本身可导出/导入以复用任务。

## 5.5 阶段 C 的实现要点（`apps/android-host/`，已跑通）

1. **Node 作为 native library**：Android 10+ 禁止从应用私有目录 execve，但允许执行 APK 的 `lib/<abi>/`
   （Shizuku 同款做法）→ Node 二进制以 `libnodebin.so` 交付，`android:extractNativeLibs="true"`
   保证它被解成真实文件（AGP 默认 `false`）。
2. **依赖库 soname 改写**：链接器按文件名匹配 `DT_NEEDED`，AGP 只打包 `*.so` →
   `scripts/patch-elf-sonames.py` 在 `.dynstr` 内把所有旧 soname 改成 `.so` 结尾并重命名文件。
   **只改 DT_NEEDED 会与 `.gnu.version_r` 冲突**，链接器报
   `cannot find X from verneed[0] in DT_NEEDED list`（实测踩过）。
3. **JS 侧随 APK 交付**：`assets/agent-bundle.zip`（wasm 版 sharp）首次运行解包到私有目录（14MB / 2.9s）。
4. **凭据隔离**：模型密钥放 `filesDir/model.env`（`KEY=VALUE`），注入子进程环境，不出现在可见配置里。
5. **配置覆盖语义**：只有用户真正编辑过编辑器内容才回写 `config.yaml`，否则以磁盘文件为准
   （便于外部配置管理/推送；`setText()` 触发 dirty 的坑已修）。
6. **已知限制**：长任务暂无前台 Service 守护（M5）；Node 运行时暂取自 Termux 包，Phase 2 换自编译
   libnode；yadb 仍需外部 push。

## 5.6 Android 14 实测结论（手机 AVD，2026-09）

被测设备：`Midscene_Phone_API34`（Pixel 7，1080×2400 竖屏，Android 14）。

| # | 结论 |
| --- | --- |
| A14-1 | **Node v24.18.0 在 Android 14 上正常运行**（`midscene-local v1.12.6 (node v24.18.0)`），G1 最大未知项解除 |
| A14-2 | 设备侧部署可完全无人化：`adb-bootstrap.sh` 完成安装 APK/Shizuku、起 server、部署 rish（Android 14 需 `chmod 400` dex）、注入 `model.env`、电池白名单（`dumpsys deviceidle whitelist`）、通知授权、服务触发 provisioning |
| A14-3 | agent bundle 版本戳生效：更新 APK 后自动重新解包（此前"存在即跳过"会让设备一直跑旧 agent） |
| A14-4 | **rish 在本机应用进程中一律 `Aborted`**（前台 Activity、前台 Service、`run-as` 三种来源都试过），Shizuku 只回这一句、无更多信息 |
| A14-5 | `pm grant moe.shizuku.manager.permission.API_V23` **不能**免人工授权：Shizuku 13.x 的授权在它自己的存储里（包名+签名），系统权限绕不过去 |
| A14-6 | `Shizuku.newProcess` 在 API 13.1.5 中是 **private**；公开的提权执行路径只有 **`Shizuku.bindUserService` + UserService**（即本路线图的 Phase 2 方案） |
| A14-7 | 客户端崩溃修复：手机布局不能用抽象类 `NavigationBarView`（平板用的 `NavigationRailView` 是具体类，问题只在手机暴露），须用 `BottomNavigationView`（该 View 布局后来整体换成 Compose 控制台 `NavigationBar`/`NavigationRail`，此条仅存档） |

**执行器方案已落地（A14-8 起为实测结果）：**

| # | 结论 |
| --- | --- |
| A14-8 | ✅ **Shizuku UserService 方案在 Android 14 上验证通过**：`Shizuku.bindUserService` + AIDL（`IExecService.exec/execBinary/uid`）成功绑定，服务进程以 shell(2000) 执行命令；yadb 经该通道安装成功：`shizuku user service: -rw-r--r-- 1 shell shell 14431 /data/local/tmp/yadb` |
| A14-9 | 绑定实现的坑：`Shizuku.addBinderReceivedListenerSticky` 在 binder 已就绪时**同步回调**，守卫若在注册之后设置会无限递归（`StackOverflowError`）；必须先置 `binding` 再注册，并在回调里复位后重入 |
| A14-10 | Android 14 禁止**从后台启动前台服务**：`am start-foreground-service` 需先让 App 到前台（或已有电池优化豁免），否则服务动作静默不执行 |

**第 5 步进展（A14-11 ~ A14-13）：**

| # | 结论 |
| --- | --- |
| A14-11 | ✅ 回环执行桥落地：App 内 `ExecBridge`（仅绑定 127.0.0.1 + 每进程随机 token）转发到 UserService；Node 子进程通过 env `MIDSCENE_EXEC_BRIDGE_URL/TOKEN` 获得地址 |
| A14-12 | ✅ TS 侧 `ExecBridgeCommandRunner` 作为 drop-in 替换：`RishTransport` 仍照旧拼 `sh <rish> -c <cmd>`，runner 直接执行 payload 元素（无需改 transport）；文件通道改为经 `/exec-binary` + `cat` 取**原始字节**（不再依赖 `base64`，AOSP 镜像不保证有） |
| A14-13 | ⏳ 设备验收中：run 已能走到 transport（rish `Aborted` 已消失），当前卡在 `probeUid`：「Unable to determine the uid of the rish shell channel」——下一步打印该探针的实际命令与返回，定位是命令形态还是解析问题 |

**第 5 步完成（A14-14 ~ A14-17，Android 14 手机端到端跑通）：**

| # | 结论 |
| --- | --- |
| A14-14 | ✅ **端到端成功**：`aiAssert` 通过（7.4s）、报告与结果文件生成、CLI `exit=0`（16.9s）。能力矩阵 `uid 2000 / privileged / textInput full / gestures` —— **无 rish、无 Termux、无 PC** |
| A14-15 | 截图失败根因之一：本机 `screencap -p -d 0 <file>` 返回 1 且 0 字节，`screencap -p`（不带 `-d`）正常。设备 `displayId` 不应默认写 0，transport 需要能回退到不带 `-d` 的调用 |
| A14-16 | 截图失败根因之二：**大载荷不能走 Binder**。1.3MB PNG 经 AIDL `byte[]` 返回触发 `DeadObjectException`（事务缓冲上限）并打死 UserService 进程。改为：shell 写到 App 外部目录 → **App 主进程读文件** → 回环 HTTP 原始字节返回（`/read-file`，路径白名单限制在 App 沙箱内） |
| A14-17 | 文件通道目录必须同时满足「shell 可写 + App 可读」，因此用 App 外部目录 `/storage/emulated/0/Android/data/<pkg>/files/channel`，并需由 runner 把配置里的 `fileChannelDir` 透传给 transport（否则仍用 `/data/local/tmp`，App 沙箱读不到 → HTTP 404） |

**阶段 C 产品化收尾（A14-18 ~ A14-22）：**

| # | 结论 |
| --- | --- |
| A14-18 | ✅ **Compose 控制台**（`ConsoleActivity`）：Run / Scripts / History / Diagnostics / Settings 五页签；classic 的 widget 界面已删除。设计令牌取自 desktop studio（品牌蓝 #1979ff + 双色板 + 圆角/字重体系），不套用原生默认样式 |
| A14-19 | ✅ **响应式**：宽度 ≥600dp 用 `NavigationRail`（否则底部导航），History 在大屏变列表/详情双栏 |
| A14-20 | ✅ **悬浮窗进度胶囊**：`TYPE_APPLICATION_OVERLAY`，可拖拽吸附边缘、宽度受屏宽约束（两行内完整显示），文案由服务日志流驱动；**含 `screencap` 的命令执行期间自动隐藏**，保证报告截图不含悬浮窗 |
| A14-21 | ✅ **运行结束回到 App**：前台服务 + 悬浮窗权限构成系统允许的后台启动豁免；Settings 提供「Open app after a run」开关（默认开） |
| A14-22 | ✅ **输入体验**：`enableEdgeToEdge` + `imePadding` 解决键盘遮挡；指令/脚本/凭据三处提供显式 **Paste/Clear**（模拟器剪贴板与长按菜单都不可靠） |

**仓库结构（与应用规范对齐）：**

`android-host` 已迁至 **`apps/android-host/`**（应用放 `apps/`、commit scope 取目录名），并补上 `package.json` 以进入 Nx/pnpm 生态：

```
apps/android-host/
├── app/                  # Gradle 模块（Java + Kotlin/Compose）
│   ├── src/main/aidl/    # IExecService（Shizuku UserService）
│   ├── src/main/java/    # 执行桥 / 服务 / 控制台
│   ├── src/main/res/     # studio 令牌、图标、布局
│   ├── src/main/assets/  # agent-bundle.zip、yadb（生成物，gitignore）
│   └── src/main/jniLibs/ # Node 运行时（生成物，gitignore）
├── scripts/              # bundle-agent.mjs / fetch-node-runtime.sh / adb-bootstrap.sh
└── package.json          # pnpm scripts: bundle | runtime | assemble | install | bootstrap
```

**控制台产品化与真机修复（A14-23 ~ A14-31）：**

| # | 结论 |
| --- | --- |
| A14-23 | 中文等非 ASCII 指令曾生成非法 YAML（`safeName` 清洗后只剩 `-`，`- name: -` 被解析成序列符号）→ 清洗后去首尾连字符、空则回退固定名，`name`/`prompt` 统一加引号并转义换行 |
| A14-24 | `model.env` 解析过于严格：只认 `=`，`KEY: VALUE`、`export ` 前缀、引号、CRLF、值内 `#` 都会丢行 → 改为宽容解析并**显式记录被跳过的行**（丢 base URL 会在很久以后表现为 `Invalid URL`，指错层） |
| A14-25 | 文件通道目录准备在 FUSE（`/sdcard`）上失败：`chmod` 不被支持导致整条命令非零 → `chmod`/`touch` 改为尽力而为，末尾用 `ls -d` 确认目录可用 |
| A14-26 | **浮层不进截图（方案 B 落地）**：胶囊内容画在自有 `SurfaceView` 上 → 通过 `HiddenApiBypass` 调 `setSkipScreenshot`（两种签名都试）；报告已验证干净，日志可观测 `hiddenFromCapture=true`。API < 29 / 绕过失败 / 方法缺失 → 自动降级为 A（截图前后隐藏） |
| A14-27 | 胶囊体验：宽度自适应（上限 240dp、单行省略）、距顶 44dp；surface 可能被系统拆掉 → `onVisibilityChanged`/`onAttachedToWindow` 重绘 + 服务每 1.5s `refresh()` 保活 |
| A14-28 | 首页状态：完成后回前台头部曾停在运行态 → 页面可见期间轮询 `AgentService.isBusy()`；点 Run 自动收键盘 |
| A14-29 | 历史页：卡片重设计（状态条 + Success/Failed 胶囊 + 相对时间 + Review/Log/Delete）、支持**删除记录**（索引 + 日志 + 结果 + 报告一并清理） |
| A14-30 | 平板**内嵌报告**：右栏 WebView 渲染，点卡片=选中（不再跳窗口）；手机仍走全屏查看页 |
| A14-31 | 内嵌报告的两个真问题：①WebView 在 Column 中量到 0 高 → 白屏（改 `weight(1f)`）；②每次进 History 重建 WebView 重新解析 3.9MB 报告 → **复用后 18s → ~400ms**。复用引入的两次崩溃（`The specified child already has a parent`）最终修法：**容器承载**（Compose 只持有一次性 `FrameLayout`）+ factory 内无条件 `removeView` + **每次进入重绑 `WebViewClient`**（否则回调指向已废弃的组合，"Rendering…"遮罩不消失） |

**可视化、自检与运维教训（A14-32 ~ A14-40）：**

| # | 结论 |
| --- | --- |
| A14-32 | **浮层常驻且不进截图**：内容画在自有 `SurfaceView` 上，经 `HiddenApiBypass` 调 `setSkipScreenshot`（两种签名都试）；API < 29 / 绕过失败自动降级为「截图前后隐藏」。注意：`adb screencap` **也**拍不到浮层，外观只能目视确认，机制用日志 `hiddenFromCapture=true` 证明 |
| A14-33 | overlay 窗口默认被系统按状态栏/任务栏**内缩**（`MATCH_PARENT` 解析到内缩后的 frame）→ 需 `FLAG_LAYOUT_IN_SCREEN | FLAG_LAYOUT_NO_LIMITS` 并**按显示器 bounds 显式设尺寸**；但**应用级 overlay 永远低于 dock/状态栏**（系统规则），要盖住只能改用无障碍浮层 |
| A14-34 | 边框流光：`Path` + `PathMeasure` 彗尾、**恒定线宽**（宽度渐变会让细段离开边缘，看起来"时贴时不贴"）、直角贴边、路径偏移 = 描边半宽 |
| A14-35 | 顶部状态栏四槽（阶段 / 步骤计数 / 当前指令 / 计时）来自 runner 的**结构化事件** `[event] {json}`（run.start、step.start、step.end、run.end），不再从日志文本猜 |
| A14-36 | 元素框数据源：`Agent.onDumpUpdate` 的签名是 **`(tag: string, executionDump?)`**——按第一个参数遍历只会拿到字符串下标（诊断输出形如 `keys:["0","1",…]`）；运行时 dump 也拿不到矩形。正解是 **`Agent.addProgressListener`**（进度总线），其 aiAct action 自带 `point` + `bbox`；无 point 时用 bbox 中心发 `tap` |
| A14-37 | 运行结果是**多行美化 JSON**，必须从顶部找"单独一行的 `{`"并按 `tasks` 判定根对象，否则历史记录丢掉 `reportFile` 与成功标志（表现为"成功却报失败、且没报告"） |
| A14-38 | `model.env` 解析需容错：`=` 与 `:` 均可、`export ` 前缀、引号、CRLF、值内 `#`；非法行要**显式记录**（丢 base URL 会在很久以后表现为 `Invalid URL`） |
| A14-39 | 中文指令经清洗后只剩 `-`，生成 `- name: -` 被 YAML 当成序列符号 → 任务名需去首尾连字符并在为空时回退 |
| A14-40 | **安装静默失败**（重要运维教训）：模拟器 `/data` 达 91% 时 `adb install` 报 `INSTALL_FAILED_INSUFFICIENT_STORAGE`，而命令输出被 `| tail -1` 吞掉 → 设备长期运行**旧构建**（表现为"改了却看不到"）。清理历史报告/缓存后恢复；此后**每轮安装必须显式校验 `Success`** |

**可视化能力（阶段 C 收尾）**：一个全屏 surface 承载四种信息——顶部状态卡（状态点 + 人类可读状态词 + `Step 2/5` + 当前步骤 + 实时计时，画在系统状态栏下方、按内容宽度居中，措辞由 `ProgressText` 统一生成：yaml 任务概括成 `Script · 5 actions · first: tap "…"`、slug 还原成词、数值带标签、句首大写）、边框流光（`aiAct` 运行中 3.6s/圈，demo 2.2s）、定位元素虚线框（2.5s 淡出）、点击涟漪（0.7s）；全部不进截图。Settings 只保留悬浮进度总开关。

**运行中的人机互斥（防呆）**：服务持有 run 状态，App 侧 `rememberRunBusy()` 在运行期间禁用会互相干扰的控件并说明原因——Scripts 的编辑器 / Run / Save / Self-check / New template、Settings 的凭据保存、Diagnostics 的 Provision 与 Clean now、History 的 Delete；Run 页的 Run / Stop 早已按 `isBusy()` 处理。前台通知也从「只在 run 开始时写一次」改成按 step/action 事件刷新（标题 `Working · 1/1`、正文 `Tap "Wi-Fi" · 15s`）。

**动作级进度**：runner 只在任务边界上报 step，而 `yaml` 脚本整体只是一个 step，于是脚本跑 25s 时状态一直停在 `1/1`。runner 现在把 agent 的每个设备动作转成 `action` 事件（`onTaskStartTip`，ScriptPlayer 会链式调用），状态卡与通知因此显示当前动作。

**自检 demo（自举）**：App 内 **Scripts → Self-check** 一键写入并运行 `self-check.yaml`——轮流 `aiTap` 三个主入口，再聚焦 Run 页的指令框 `aiInput` 一段文本。全流程在 App 内、由 App 驱动自身界面，用于评估"定位→操作"的真实延迟。措辞按运行时形态生成（`SelfCheckScript`）：导航只说该机型上真实存在的那一条（手机底部标签栏 / 平板左侧标签栏，不用"导航栏"以免与系统返回/主页那一条混淆），指令框锚在常显的 `INSTRUCTION` 标题上（该框会保留上次指令，占位文字常常不在），也不用"首页"称呼它——手机上"首页"会被理解成系统桌面。YAML 能力边界：`aiTap` / `aiInput` / `aiKeyboardPress` / `aiScroll` / `sleep` / 任意 action 的 alias（如 `runAdbShell`，**零模型调用**）；**没有坐标版 tap**。

原始设计（1–5 步全部落地并验证）：

```text
Node (@midscene/android-local) → HttpShizukuRunner (CommandRunner)
      → App 主进程 ExecBridge（回环 HTTP + token）
      → Shizuku.bindUserService → UserService 进程（shell 2000，byte[] 往返）
```

好处：一次性消除 `Aborted`（前后台限制）、`LD_LIBRARY_PATH` 污染、rish 大输出跨管道拆分、yadb 部署依赖；截图与输入预计进一步提速，中文输入不再依赖 yadb 启动 ART。

## 6. 移动版 Studio 的功能切分（阶段 C）

最小可用界面（一个 Activity + 一个前台 Service）：

1. **状态页**：后端（rish / UserService）、uid、能力矩阵（截图/输入/中文/pinch）、`doctor` 耗时。
2. **配置页**：模型配置（密钥入 Keystore）、设备选项（displayId、yadb 路径、app 名映射）。
3. **脚本页**：列出脚本/配置，支持导入 YAML、编辑、单跑。
4. **运行页**：任务列表 + 实时日志（截图缩略图 + 每步耗时）、失败原因、结果 JSON 导出。
5. **守护**：前台服务保活（规避电池优化杀进程）；崩溃后恢复上次运行。

内部实现建议：

- 复用本包的 `runLocalAgentConfig()`：App 只需要提供配置对象与事件回调（进度/日志）。
- Node 侧通过 JNI（libnode）在同一进程内启动，或用 `app_process` 托管一个 sidecar 进程；
  两种方式都只是"谁来跑 Node"，不影响 Transport 接口。
- 输出统一走结构化 JSON（`LocalAgentRunResult`），UI 只做展示，不解析日志文本。

## 7. 演进路径与验收

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M1（当前） | Termux CLI + 配置 + YAML 脚本 + 结果文件 | ✅ **已在 Android 12 模拟器验证**：`doctor` 全绿（capabilities 含 `gestures: true`/`textInput: full`、截图 125KB/1.77s）；`run` 三个任务（aiAct 112s / aiAssert 25s / YAML 脚本 92s）全部 ok，退出码 0，结果 JSON 落盘 `midscene_run/agent-results/` |
| M2 | 配置/脚本导入导出、结果汇总、失败重试策略 | 一条配置在 2 台手机上可复现 |
| M3 | APK + 内嵌 Node + 精简 UI（配置/脚本/运行/日志） | ✅ **已验证**：`apps/android-host/` 产物 48MB，APK 内 exec Node v24.18.0；`doctor` 输出 `uid: 2000` 能力全绿；`run config` 完成 aiAct 真实点击（19.3s ok）与 aiAssert 模型判定，结果 JSON 落盘。无 Termux、无 PC |
| M4 ✅ | Shizuku UserService 常驻通道（替代 rish；大载荷由 App 进程直读，不经 Binder） | ✅ Android 14 实测：能力矩阵全绿、`aiAssert` ok、报告/结果文件生成、`exit=0` |
| M4-pre ✅ | **授权通道**：`Shizuku.requestPermission()`（官方 API）+ Setup 页 `Authorize Shizuku` 按钮 → Shizuku 里本 App 授权开关 ON | ✅ 已授权；rish 仍 `Aborted` → 见 §5.6 结论 |
| M5-a ✅ | **adb 无感安装与配置**：`scripts/adb-bootstrap.sh` 一条命令完成安装/起 Shizuku/部署 rish/注入 model.env/电池与通知白名单/触发 provisioning | ✅ Android 14 手机实测（Node v24.18.0 正常） |
| M4' ✅ | **守护与保活**：前台 Service（specialUse）+ WakeLock + 电池优化豁免入口；Activity 与运行解耦 | ✅ 实测：App 切后台后任务继续跑完；`isForeground=true`；服务日志落盘 `files/run/agent.log` |
| M4'' ✅ | **yadb 自动分发**：assets → App 外部目录 → rish cp 到 `/data/local/tmp`（无需 adb push） | ✅ 实测日志 `staged yadb → yadb-installed`，`/data/local/tmp/yadb` 就位 |
| M4''' ✅ | **生产版 UI**（参考 studio，无预览）：自然语言指令 / YAML 编辑运行 / 历史与报告查看 / 运行时与凭证设置 | ✅ 四页签可用；History → Report 在 WebView 内渲染 Midscene 交互报告（时间线 + 逐帧回放） |
| M5 | 长稳与恢复（崩溃拉起、权限失效重建、索引清理与导出） | 连续 8 小时任务不死、异常后自恢复 |
