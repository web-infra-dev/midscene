# Midscene Android Host（移动版 Agent）

一个最小可用的 **on-device Agent APK**：APK 内自带 Node 运行时与 Midscene agent，通过 Shizuku（rish）以
shell 身份控制本机，**不依赖 Termux，也不依赖 PC**。它是 `docs/deployment.md` 里阶段 C 的第一个切片
（"移动版 studio" 的执行内核 + 最小界面）。

## 它是怎么工作的

```text
MainActivity (config/status/log)
    │  ProcessBuilder
    ▼
lib/arm64/libnodebin.so            ← Node 运行时（作为 native library 随 APK 交付）
    │  dist/lib/cli.js  (midscene-local)
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
- **JS 侧按需解包**：`assets/agent-bundle.zip` 首次运行时解到 `filesDir/agent`（本机 2.9s / 14MB）。
- **模型凭据不落在可见配置里**：`filesDir/model.env`（`KEY=VALUE` 行）被注入子进程环境；
  生产版本应改为 Android Keystore（见 `docs/deployment.md` §5）。

## 构建

```bash
cd android-host

# 1) Node 运行时（从已装 Termux 的设备拉取并改写 soname）
./scripts/fetch-node-runtime.sh                 # 或 --from <dir>（bin/node + lib/*.so）
# 2) JS 侧（wasm 版 sharp，保证 android-arm64 可用）
node ./scripts/bundle-agent.mjs
# 3) APK
gradle assembleDebug                            # 产物 app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` 需要指向 Android SDK（`sdk.dir=...`），`jniLibs/` 与 `agent-bundle.zip` 均为生成物，已在
`.gitignore` 中忽略（APK 约 48MB）。

## 界面（生产版四页签）

参考 desktop studio 的信息架构（去掉实时预览），四个页签：

| 页签 | 功能 |
| --- | --- |
| **Run** | 自然语言指令输入 + `Run instruction` / `Stop` / `Clear log`；状态行显示 state / node / agent / yadb；实时日志流 |
| **Scripts** | `config.yaml` 编辑器（YAML，支持 `yaml` 任务引用 `files/scripts` 下的脚本）+ Save / Run config / Reload（未编辑时以磁盘文件为准，便于外部配置推送） |
| **History** | 运行记录列表（OK/ERR、时间、耗时、任务通过数）→ 详情对话框（逐任务类型/状态/耗时/错误）→ **Log** 与 **Report** |
| **Setup** | Provision runtime（解包 agent + 安装 yadb）、Check state、Battery exemption、Open Shizuku、`model.env` 编辑保存、Run doctor |

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
2. **凭证仍是明文文件**：`model.env` 在 Setup 页可见且为明文，生产版需转 Android Keystore +
   输入框掩码；`config.yaml` 不含密钥（这点已经做到）。
3. **历史条目只增不删**：详情对话框提供了日志删除；索引清理/导出（部署文档 M2）待补。
4. **模拟器环境**：2 核模拟器的 launcher 常驻 "Pixel is starting…"，`home`/launcher 相关断言会由模型
   如实判失败——链路正常，真机需复测。
