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

## 界面（M3 最小集）

| 元素 | 作用 |
| --- | --- |
| 状态行 | Node 路径是否存在、agent 是否已解包 |
| **Prepare runtime** | 解包 `agent-bundle.zip` 并打印 CLI 版本 |
| **doctor** | 打印能力矩阵、健康状态、显示信息、截图耗时 |
| **run config** | 运行 `files/config.yaml`（编辑器内容优先，未编辑则用磁盘上的文件） |
| 配置编辑器 | 直接编辑 YAML 配置并保存到应用私有目录 |
| 运行日志 | 界面实时输出，同时落盘 `files/run/last-run.log`（长时间运行可事后查看） |

首次点 **doctor** 会触发 Shizuku 授权弹窗（"Allow Midscene Local to access Shizuku?"），选择
**Allow all the time**。

## 已验证（Android 12 模拟器 / arm64）

| 步骤 | 结果 |
| --- | --- |
| APK 内 exec Node | ✅ `midscene-local v1.12.6 (node v24.18.0)`（Node 从 `lib/arm64/libnodebin.so` 执行） |
| Shizuku 授权本 App | ✅ 弹窗针对 `com.midscene.localagent`，授权后 rish 以 shell(2000) 工作 |
| `doctor` | ✅ `uid: 2000`、`privileged: true`、shell/screenshot/input/appManagement/multiDisplay/gestures 全 true |
| `run config`（aiAct + aiAssert） | ✅ 任务 1 完成真实点击（19.3s，ok）；任务 2 的断言由模型如实判失败（模拟器 launcher 未起来，非链路问题）；结果 JSON 落盘 `files/midscene_run/results/` |

## 已知限制（下一步）

1. **长任务没有守护**：目前在 Activity 的后台线程里跑，Activity 被系统回收时任务会中断 →
   需要一个前台 Service（部署文档 M5）。
2. **Node 运行时来自 Termux 包**：可用但不是产品形态；自编译 Node 22/24（NDK + libnode）是 Phase 2 主线，
   替换时只需换掉 `libnodebin.so` 与依赖库，应用与 transport 代码不变。
3. **依赖 yadb 提供中文输入与 pinch**：`/data/local/tmp/yadb` 需要预先 push（本 App 尚未自动分发，
   受 SELinux 限制：app 不能写 `/data/local/tmp`）。
4. **凭据明文**：`model.env` 目前是明文文件，生产版必须转 Keystore。
