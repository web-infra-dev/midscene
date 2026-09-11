# android-local 开发路线图

阶段划分与 Gate 沿用调研文档（`research-v0.1.md` §7），此处细化到**可执行任务、产出物与验收方式**，并补上本仓库特有的风险（见 §6）。

## 1. 阶段总览

| 阶段 | 目标 | Exit Gate | 节奏 |
| --- | --- | --- | --- |
| Phase 0 可行性 Spike | 证明 Android 本机能跑 Agent 核心 | G0 + G1 | 3–5 个工作日 |
| Phase 1 Local Transport MVP | 形成可维护的本机设备适配层 | 核心 YAML 动作可运行，与 ADB 回归结果一致 | 1–2 周 |
| Phase 2 Native Host | 从终端 POC 进入 APK 内运行 | APK 独立启动 Agent，无 Termux 依赖 | 2–4 周 |
| Phase 3 产品化/车机化 | 可靠性、性能、安全 | 达到内部工具发布标准并确定权限模型 | 3–6 周 |

## 2. Phase 0：可行性 Spike

### 2.1 必须回答的五个问题（调研文档 §7.1）

1. Midscene Core 在 Android Node 22/24 是否存在不可接受的 Node API / native dependency 阻塞？
2. Shizuku shell 身份能否稳定完成 `screencap` / `input` / `am` / `pm` / `dumpsys`？
3. 截图能否以 stdout/pipe 直接回到 Node Buffer，且无需临时文件？
4. 模型请求（云端或局域网）在车机网络/证书/代理环境下是否可用？
5. 没有 PC/ADB Host 时，能否连续跑完一个包含感知、动作、断言的真实任务？

### 2.2 任务清单

| 编号 | 任务 | 产出物 | 验收 |
| --- | --- | --- | --- |
| P0-1 ⏳ | 依赖与运行时审计（图像链路已完成）：原生 addon（`sharp` 等）、`child_process`/PTY、`os.tmpdir`/`MIDSCENE_RUN_DIR` 写权限、`undici`/TLS 代理、photon(WASM) 可用性 | `packages/android-local/docs/dependency-audit.md`；审计脚本 `packages/android-local/scripts/dependency-audit.mjs` | 明确列出「Android Node 可用 / 需回退 / 阻塞」三分类，无未分类项 |
| P0-2 ✅（方案已改） | 结论：**不改调用点**，改用 sharp 官方 WASM 实现（`npm install --cpu=wasm32 sharp`） | 见 §9.2 C2/C3/C4 | ✅ `@midscene/shared` 四个图像函数在 android-arm64 上全绿；文档化部署约束即可 |
| P0-3 ✅ | 设备侧 Node（POC 形态）：Termux `nodejs-lts` = Node v24.18.0 | 取证：`process.platform=android`、`process.arch=arm64`；`npm install @midscene/core@1.12.6` 在设备内完成（69 包 / 76MB） | ✅ 已达成，见 §9.2 C1 |
| P0-4 ✅ | Shizuku + rish 部署（13.6.0 直接执行 `libshizuku.so`，rish 从 APK assets 提取） | 见 §9.1；已记录 LD_* 净化、`sh rish` vs 直接执行、Termux 授权步骤 | ✅ `rish -c 'id -u'` = 2000（以 Termux uid 调用），见 §9.2 C7 |
| P0-5 ✅ | `RishTransport` 真机验证（设备本机 Node + rish）：截图走**设备本地文件通道**、`input`、`dumpsys display` 解析 | 见 §9.2 C5/C6/C9/C10 | ✅ 连续 5 次截图全部成功、P50 2155ms（100 次连测留待 Phase 1） |
| P0-6 | 端到端闭环：`packages/android-local/examples/closed-loop.mjs` + YAML（打开固定应用 → `aiTap` → screenshot → `aiAssert`），用 core `Agent` 包 `LocalAndroidDevice` | 样例脚本 + 运行录像/日志 + 指标 | 无外部 ADB Host 依赖（Shizuku 已启动的前提下）完成闭环 |
| P0-7 | Gate 结论回填 | 更新本文档 §7 状态表与 README 进度 | G0/G1 明确「通过 / 未通过 + 证据」 |

### 2.3 指标记录模板（P0-5/P0-6）

| 指标 | 采集方式 | 记录值 |
| --- | --- | --- |
| `screenshot_latency_ms` (P50/P95) | 连续 N 次截图取分位 | 待填 |
| `action_latency_ms` (tap/swipe/keyevent) | 单次调用耗时 | 待填 |
| `AI_roundtrip_ms` | `aiTap`/`aiAssert` 端到端 | 待填 |
| `screenshot_success_rate` / `action_success_rate` | 成功数/总数 | 待填 |
| `transport_reconnect_count` | rish/Shizuku 断开次数 | 待填 |
| RSS / PSS、CPU、温度、event-loop lag | `/proc/self/status`、`process.memoryUsage()` | 待填 |

## 3. Phase 1：Local Transport MVP

| 编号 | 任务 | 验收 |
| --- | --- | --- |
| P1-1 | 契约冻结：`AndroidTransport` + 错误码表 + 能力模型 + `displayId` 一等参数；新增 `transport-contract.test.ts` | 任何后端实现跑同一份契约测试都通过 |
| P1-2 | `LocalAndroidDevice` 完整动作空间（能力驱动裁剪）、`size()` 逻辑尺寸口径与 `AndroidDevice` 对齐、滚动边界数学 | 与 ADB 路径在相同任务上的坐标/尺寸行为一致 |
| P1-3 | `AdbShellTransport`（对照与 CI 后端，复用现有 ADB 能力） | 在 `android-emulator.yml` 的模拟器上通过契约测试 |
| P1-4 | 同一 YAML 任务双路径对照（ADB `AndroidDevice` vs rish `LocalAndroidDevice`） | 结果一致性对照报告 |
| P1-5 | 性能基线：screenshot/action/AI 往返 | `packages/android-local/docs/baseline.md` |
| P1-6 | CI 接入：`android-emulator.yml` 增加 android-local 单测与可选 Shizuku 冒烟 job | PR 可见结果 |
| P1-7 | 收敛：`packages/android` 单向消费 android-local 的纯逻辑（display 解析、坐标/滚动数学） | 无反向依赖，`check:references` 通过 |

## 4. Phase 2：Native Host

- Node 22/24 for Android 自编译（NDK + `libnode.so`），JNI 启动，避免「下载 binary → chmod +x → exec」（Android 10+ W^X）。
- Kotlin Host App（`android-host/app`）+ `bridge`（AIDL/JNI）+ Shizuku UserService（shell UID 2000 / root UID 0）。
- 生命周期、守护、崩溃拉起、诊断与日志回传。
- **Gate G2**：APK 内 Node runtime 可稳定启动 / 停止 / 恢复 → 评估 sidecar / system daemon 回退方案。

## 5. Phase 3：产品化 / 车机化

- 截图流（UserService/系统接口 → FD/LocalSocket/共享内存），多 Display 与动态帧源。
- 中文/特殊字符输入（专用 IME 或输入服务、剪贴板桥）。
- 权限恢复（Shizuku 重启后自动恢复或系统服务方案）、资源限额与监控、OTA 与部署文档。
- OEM Privileged Transport（platform signature / priv-app / OEM 系统服务）可选实现。
- **Gate G3**：确定最终权限模型。

## 6. 风险与对策

| 风险 | 等级 | 影响 | 对策 / 回退 |
| --- | --- | --- | --- |
| `sharp` 无 Android 预编译，`ifInNode` 分支硬依赖（E3/E4） | 高 | G0 被阻塞，Core 无法在 Android 运行 | P0-2 图片后端回退到 photon(WASM)；在 Android Node 上实测 photon |
| Node 22/24 Android 构建与依赖兼容 | 高 | APK 产品化被阻塞 | POC 先在设备侧 Node 验证 Core；建立依赖审计；必要时精简入口/bundle；Embedded Node 独立 Gate |
| Shizuku 重启/授权生命周期 | 高 | 设备重启后 Agent 不可用 | POC 接受；产品阶段评估自动恢复；车机优先 OEM privileged/system service |
| 隐藏 API / Binder 版本差异 | 高 | 不同 Android 版本行为不一致 | Transport 能力协商；隐藏 API 只封装在后端 |
| 截图性能与多 Display | 高 | AI 感知延迟、抓错屏幕 | 先 pipe 后 stream；`displayId` 参数化（E6 的虚拟屏必须排除）；真实设备矩阵持续测试 |
| 中文/特殊字符输入 | 中高 | 业务任务大量失败 | POC 阶段显式 `NotSupported` 失败而非静默半成功；Phase 3 专用 IME |
| 内存/CPU/温控 | 中高 | Node + VLM client + 图像处理影响车机 | 限制并发（transport 并发上限）、图片缩放、异步模型调用、资源监控 |
| 普通 app shell 权限误判 | 中 | POC 看似可跑、真实命令失败 | 启动即记录 uid/capabilities；每类能力做 capability probe（`healthCheck`） |
| Android 14+ rish/DEX 限制 | 中 | POC 部署失败 | 遵循只读 DEX 要求；**本机只有 Android 12 AVD（E7），需补 14+ 设备/AVD** |
| 上游 rebase 成本 | 中 | 长期维护成本 | 新包零侵入；唯一上游改动（图片后端）保持最小、可上游化 |
| 无真机/车机访问 | 中 | 权限模型结论不成立 | Phase 0/1 结论标注为「模拟器结论」；G3 必须在目标车机复测 |
| 「本机化」语义误解 | 中 | 部署预期错误 | 文档明确：非 root 的 Shizuku 仍需 adb/无线调试启动，本机化 ≠ 无需 Shizuku 启动 |

## 7. Gate 状态表

| Gate | 通过条件 | 未通过时的决策 | 状态 |
| --- | --- | --- | --- |
| G0 Core Runtime | 设备侧 Node 22/24 能启动 Midscene Core，基础依赖完整（含图片后端回退） | 定位不可用依赖；评估 bundle/patch；必要时建立 Android 精简入口 | **通过**：Node v24.18.0 + Core 各入口 import 成功 + wasm sharp 覆盖图像链路（§9.2 C1–C3） |
| G1 Device Closed Loop | 截图 + 输入 + AI 动作闭环稳定 | 对比 Accessibility / MediaProjection 或目标设备 OEM 权限 | **设备侧已验证**（截图+输入+13 动作，§9.2 C10）；AI 闭环（P0-6）进行中 |
| G2 Embedded Node | APK 内 Node runtime 可稳定启动 / 停止 / 恢复 | 评估 sidecar / system daemon；不影响 Transport 接口 | 未开始 |
| G3 Privilege Model | 确定 Shizuku 是否满足部署与重启要求 | 切换 OEM privileged / system app 路线 | 未开始 |

## 8. 验证矩阵（调研文档 §10.1 落地）

| 类别 | 最小验收 |
| --- | --- |
| 感知 | 指定 Display 截图；旋转/分辨率变化；连续 100 次截图无死锁/明显泄漏 |
| 输入 | tap、long press、swipe、back/home/enter；连续操作；坐标与逻辑尺寸一致 |
| 文本 | 英文、中文、空格、符号；焦点切换后输入（POC 阶段中文允许显式 `NotSupported`） |
| 应用生命周期 | 启动、切前台、force-stop、重启 |
| Agent | `aiTap`、`aiQuery`、`aiAssert`、`aiWaitFor`、scroll、keyboardPress 闭环 |
| 异常恢复 | rish/Shizuku 断开、Node runtime 异常、模型超时、截图失败后可恢复 |
| 兼容性 | 目标车机系统版本/SoC + 1–2 台 AOSP/消费设备对照（当前仅有 Android 12 AVD） |

## 9. Phase 0 执行手册与实测结论（本机 Android 12 模拟器）

> 前置事实（E5/E6/E7）：`emulator-5554` 为 Android 12 / SDK 31 / arm64-v8a / 2560×1600 / density 320。

### 9.1 环境搭建（已执行，可复现）

1. **Shizuku**：安装 `shizuku-v13.6.0.r1086` → 启动 Shizuku 应用 → 用 `dumpsys package` 取真实 `codePath`（应用弹窗里显示的原生库路径在截图里易被误读）→
   `adb shell "exec <codePath>/lib/arm64/libshizuku.so"` 启动 server（`shizuku_server` 以 shell uid 运行）。13.6.0 **不再需要 `start.sh`**，直接执行 `libshizuku.so` 即可。
2. **rish 部署**：`rish`(882B) 与 `rish_shizuku.dex`(58KB) 可直接从 APK 的 `assets/` 提取，无需在应用内导出：
   `unzip -o <apk> assets/rish assets/rish_shizuku.dex` → `adb push` 到 `/data/local/tmp/` → `chmod 755 rish`。
3. **授权**：以 Termux 身份首次执行 rish 时，Shizuku 会弹出「Allow Termux to access Shizuku?」→ 选择 **Allow all the time**（自动化场景无法跳过此步，需要一次性人工确认）。
   运行方式：`run-as com.termux env RISH_APPLICATION_ID=com.termux sh /data/local/tmp/rish -c 'id -u'` → **2000 (shell)** ✔
4. **Termux + Node**：Termux v0.118.3 (arm64) → `apt install nodejs-lts` → **Node v24.18.0 / npm 11.19.1**，`process.platform === 'android'`，`process.arch === 'arm64'`。
   - 注意：`run-as` 执行脚本时 **TMPDIR 必须指向可写目录**（默认 `/data/local` 不可写），否则 heredoc/临时文件失败。

### 9.2 实测结论（本轮 Phase 0 的硬结论）

| # | 结论 | 证据 / 影响 |
| --- | --- | --- |
| C1 | **Core 可在 Android Node 上加载** | `@midscene/core` 55 exports/825ms、`core/agent` 29、`core/device` 41、`core/utils` 17，全部 import 成功 → G0 前半通过 |
| C2 | **原生 sharp 在 android-arm64 不可用** | `Could not load the "sharp" module using the android-arm64 runtime`；`convertImgBufferToJpeg` / `cropByRect` / `resizeImgBase64` / `paddingToMatchBlockByBase64` 全部失败 |
| C3 | **sharp 官方 WASM 实现可用（P0-2 的解法）** | `npm install --cpu=wasm32 sharp@0.34.3` → `@img/sharp-wasm32` 8.9MB；metadata/jpeg/resize/extract/extend 全部通过；`@midscene/shared` 四个图像函数全绿（crop 56ms / resize 386ms / pad 241ms / jpeg 1365ms），**无需修改任何调用点** |
| C4 | **photon 不能作为 Node 回退** | `@silvia-odwyer/photon@0.3.3` 只有 `module` 字段、没有 `main`/`exports`，纯 Node 解析失败；且 `getPhoton()` 在 Node 下被显式拒绝（browser/worker only） |
| C5 | **rish 不能承载大 payload** | 674KB PNG 被拆到两条管道（stdout 346KB + stderr 328KB）；base64 同理（445KB + 454KB）；小输出也可能整段跑到 stderr（`id -u` → stdout 空、stderr `2000`） |
| C6 | **设备本地文件通道是可靠替代** | `screencap -p <file>` → **674263B 完整 PNG**；`dumpsys display > <file>` → 21196B 完整（含 2 条 `DisplayDeviceInfo`）；文件 `shell:shell -rw-rw-r--`，Termux uid 可读 → 本机化相对 ADB 的独有优势 |
| C7 | **Termux 的 `LD_LIBRARY_PATH` 会破坏 rish** | 子进程继承后 `app_process` 去链 Termux 的 lib：`cannot locate symbol "Xzs_Construct" referenced by /system/lib64/libunwindstack.so` → transport 必须净化环境 |
| C8 | **并发 rish spawn 会造成瞬时失败** | 6 个并发 app_process 下 `command -v input` 返回非零（单独执行 445ms 成功）→ 探测必须串行 + 重试一次：串行化后动作空间 13 个动作全部就绪 |
| C9 | **性能基线（2 核模拟器）** | 单次 rish spawn `id -u` 1.6–1.8s；`command -v` 0.4–1.0s；`dumpsys display` 0.4s；截图（文件通道 + 读取）**P50 2155ms**（2087–2276，5 次稳定，673KB）；输入（keyevent）470ms；healthCheck 3.75s |
| C10 | **本机闭环成立** | 设备本机 Node（Termux uid 10149）→ rish → shell(2000)：能力探测全绿、`LocalAndroidDevice` 13 个动作、连续 5 次截图全部成功且校验为合法 PNG → **P0-5 通过** |

### 9.3 待补项

- P0-1 依赖审计：把「可用 / 需回退 / 阻塞」三分类整理成表（本轮已覆盖图像链路，其余依赖待补）。
- P0-6：接入模型跑 `screenshot → aiTap → aiAssert`（G1）。
- Android 14+ 的 rish/DEX 限制、多 Display 车机场景、车机网络/证书策略，均需目标设备补充验证。
- 临时文件：POC 的截图/大文本走 `/data/local/tmp` 瞬时文件（读完即删），Phase 2 用 Shizuku UserService + FD/LocalSocket 消除。
