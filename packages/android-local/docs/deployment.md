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
| **C. APK 内嵌 Agent** | Android Host App（Node 作为 native library + 最小 UI） | 随 APK 交付的 Node（当前取自 Termux 包，见 `android-host/`） | rish（Shizuku 授权给本 App）→ 后续换 UserService | ✅ **M3 切片已在模拟器验证** |
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
  exposeRunAdbShellAction: true                      # 是否暴露 RunAdbShell 动作

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
- 依赖安装必须用 `npm install --cpu=wasm32 sharp`（原生 sharp 无 android-arm64 产物）。

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

## 5.5 阶段 C 的实现要点（`android-host/`，已跑通）

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
| M3 | APK + 内嵌 Node + 精简 UI（配置/脚本/运行/日志） | ✅ **已验证**：`android-host/` 产物 48MB，APK 内 exec Node v24.18.0；`doctor` 输出 `uid: 2000` 能力全绿；`run config` 完成 aiAct 真实点击（19.3s ok）与 aiAssert 模型判定，结果 JSON 落盘。无 Termux、无 PC |
| M4 | Shizuku UserService 常驻通道（消除 rish spawn 开销与文件通道） | 截图/输入延迟显著下降，中文输入不再启动 ART |
| M4' ✅ | **守护与保活**：前台 Service（specialUse）+ WakeLock + 电池优化豁免入口；Activity 与运行解耦 | ✅ 实测：App 切后台后任务继续跑完；`isForeground=true`；服务日志落盘 `files/run/agent.log` |
| M4'' ✅ | **yadb 自动分发**：assets → App 外部目录 → rish cp 到 `/data/local/tmp`（无需 adb push） | ✅ 实测日志 `staged yadb → yadb-installed`，`/data/local/tmp/yadb` 就位 |
| M4''' ✅ | **生产版 UI**（参考 studio，无预览）：自然语言指令 / YAML 编辑运行 / 历史与报告查看 / 运行时与凭证设置 | ✅ 四页签可用；History → Report 在 WebView 内渲染 Midscene 交互报告（时间线 + 逐帧回放） |
| M5 | 长稳与恢复（崩溃拉起、权限失效重建、索引清理与导出） | 连续 8 小时任务不死、异常后自恢复 |
