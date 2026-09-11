# Midscene.js Android 本机化移植路线图与架构规划

> 从 ADB Host 模式演进为 Android 本机 Agent

> **规划主张**  
> 保留 Midscene Core/Agent/YAML 能力，抽象 AndroidTransport，优先用 Shizuku rish 快速验证；随后升级为 Shizuku UserService + AIDL/JNI，并最终支持 OEM Privileged Transport。产品架构不绑定 Shizuku，也不绑定 ADB。

**版本：** v0.1  
**日期：** 2026-09-11

# 1. 执行摘要

目标是把当前依赖 PC/服务器 ADB Host 的 Android 自动化能力，演进为可在 Android 设备本机运行的单机 Agent。核心原则是“Agent 核心不动、设备能力换 Transport”，避免重写 Midscene，也避免将产品架构绑定到某一种提权方式。

| **结论**       | **建议**                                                                                                                                          |
|----------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| 总体架构       | Midscene Core → LocalAndroidDevice → AndroidTransport → Rish / Shizuku UserService / OEM Privileged / ADB。                                       |
| 第一优先级     | 先验证 Node 22/24 + Midscene Core 能否稳定运行于 Android 环境，再验证截图/点击/滑动/按键/应用管理闭环。                                           |
| POC 权限方案   | Shizuku rish，优点是改造小、接近 adb shell 权限模型，适合快速验证。                                                                               |
| 产品化权限方案 | Shizuku UserService + AIDL/JNI；若车机可提供 platform signature/privileged 权限，则替换为 OEM Privileged Transport。                              |
| Node 运行时    | 现成 nodejs-mobile 最新正式二进制仍是 Node 18.20.4，而 Midscene 主仓库要求 Node ^20.19 / ^22.12 / >=24，因此产品化需自编译新版 Node 或裁剪兼容。 |
| 截图路径       | POC：screencap -p → pipe；产品化：UserService/系统接口 → FD/LocalSocket，避免落盘和大 Binder byte\[\]。                                           |
| 关键设计要求   | 禁止业务层直接拼 adb/rish 命令；所有设备能力统一经过 AndroidTransport，确保后续可切换权限实现。                                                   |

> **建议立项方式**  
> 以“可逆架构 + 分阶段 Gate”推进。第一阶段只证明本机闭环，不急于 APK 化；第二阶段才进入 embedded Node 与原生桥接；第三阶段再决定 Shizuku 或 OEM 系统权限作为量产/内部工具的最终权限模型。

# 2. 背景、目标与范围

## 2.1 当前模式的主要问题

- 当前 Android 自动化通常由外部 Node 进程通过 ADB 控制设备，天然依赖 USB/Wi-Fi ADB、5037 Server、设备连接状态和外部执行节点。

- 当 Agent、设备和模型调用希望收敛到车机/手机本机时，ADB Host 变成不必要的中间层，带来部署复杂度、断连恢复、端口冲突和额外时延。

- 直接在普通 APK 中执行 /system/bin/sh 并不会获得 shell(2000) 身份；子进程仍继承普通 app UID，因此无法等价替代 adb shell。

## 2.2 本次规划目标

- 在 Android 本机运行 Midscene 的 Agent/规划/YAML 执行核心。

- 提供截图、点击、滑动、按键、输入、应用启动/停止、系统信息读取等最小设备能力。

- 移除“必须存在外部 ADB Host”的依赖，同时保留 ADB Transport 作为调试和兼容路径。

- 建立权限无关的 Transport 抽象，使 Shizuku、系统签名、Root、ADB 均可作为后端实现。

- 为后续离线模型、本地推理和车机单机自动化预留资源管理、进程守护与日志接口。

## 2.3 非目标（当前阶段）

- 不在第一阶段迁移完整的多节点 Worker、RabbitMQ/BullMQ 任务调度与远程节点管理。

- 不在 POC 阶段追求完整系统应用能力，也不立即依赖隐藏 API 或 OEM 私有 Binder。

- 不在第一阶段重写 Midscene Core 为 Kotlin/Java。

# 3. 目标架构

## 3.1 分层架构

```text
┌──────────────────────────────────────────────────────────┐
│ Android Host App / Agent Runtime │
│ │
│ Midscene Core / Agent / YAML / Model Client │
│ │ │
│ LocalAndroidDevice │
│ │ │
│ AndroidTransport │
│ ┌────────────────┼──────────────────┐ │
│ │ │ │ │
│ RishTransport ShizukuTransport OemPrivilegedTransport│
│ (POC) (UserService) (长期可选) │
│ │ │ │ │
└────────┼────────────────┼──────────────────┼─────────────┘
│ │ │
rish / shell AIDL/JNI System/Binder API
│ │ │
└──────── Android system services / Input / Screen ┘

PC/服务器调试路径：AndroidDevice → AdbTransport → adb server → Device
```

**设计要点：**LocalAndroidDevice 只描述“设备能做什么”，Transport 才描述“通过什么权限和协议做到”。因此业务层完全不需要知道底层是 ADB、rish、Shizuku 还是系统签名。

## 3.2 建议 Transport 接口

```ts
export interface AndroidTransport {
getCapabilities(): Promise<AndroidCapabilities>;
screenshot(options?: ScreenshotOptions): Promise<Buffer>;
getDisplayInfo(): Promise<DisplayInfo>;

tap(x: number, y: number): Promise<void>;
swipe(from: Point, to: Point, durationMs?: number): Promise<void>;
keyEvent(keyCode: number): Promise<void>;
inputText(text: string): Promise<void>;

startActivity(target: ActivityTarget): Promise<void>;
forceStop(packageName: string): Promise<void>;
shell?(command: string, options?: ShellOptions): Promise<ShellResult>;

healthCheck(): Promise<TransportHealth>;
close(): Promise<void>;
}
```

| **实现**               | **运行身份/通道**                           | **定位**                          | **优先级** |
|------------------------|---------------------------------------------|-----------------------------------|------------|
| AdbTransport           | 外部 adb host → shell                       | 保留现有桌面/服务器模式、回归基线 | 长期保留   |
| RishTransport          | 普通 Node → rish → Shizuku shell            | POC、命令式能力验证               | P0         |
| ShizukuTransport       | App → Binder/AIDL → UserService(shell/root) | 产品化原型、性能与可靠性优化      | P1         |
| OemPrivilegedTransport | platform/priv-app/system service            | 车机内置方案，摆脱第三方提权组件  | P2/条件式  |
| AccessibilityTransport | Accessibility + MediaProjection             | 无法提权时的有限 fallback         | 可选       |

# 4. 本机执行与权限模型

## 4.1 为什么“Node 直接 shell”不等于 adb shell

```text
普通 APK：
Node (uid=u0_a123)
└─ /system/bin/sh (uid=u0_a123) ← 权限不变

ADB / Shizuku：
adbd / Shizuku server
└─ shell process (uid=2000) ← 具备 ADB shell 权限集合
```

**结论：**真正需要解决的是“执行身份/权限”，不是是否能启动 /system/bin/sh。普通 App 内 exec shell 只能覆盖无需特权的命令。

## 4.2 Shizuku 的价值与限制

- Shizuku 可通过 ADB 或 root 身份启动服务，并让应用经 Binder 使用更高权限；UserService 可运行 Java/JNI 代码为 shell UID 2000 或 root UID 0。

- rish 很适合 POC：直接复用 shell 命令语义，对现有 adb shell 逻辑改造最小。

- 长期不应把所有能力都维持为“启动子进程 + 解析文本”；Shizuku 项目本身也强调多进程创建和文本协议的性能/可靠性问题。

- 非 root 的 Shizuku 仍依赖 ADB/无线调试启动，重启后的可用性与车机策略需要单独验证。

- Android 14+ 的 rish DEX 加载还涉及可写 DEX 限制，部署方式必须纳入测试矩阵。

> **车机环境的长期最优解**  
> 如果内部车机应用能够拿到 platform signature、priv-app 白名单或 OEM 系统服务接口，则直接实现 OemPrivilegedTransport。Shizuku 仍可作为研发样机/非系统签名设备上的兼容后端，而不是最终架构前提。

# 5. Node.js 运行时策略

## 5.1 当前版本约束

截至本规划版本，Midscene 主仓库 package.json 要求 Node **^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0**；nodejs-mobile 官方最新正式 release 为 Node 18.20.4。两者存在直接版本缺口，因此不建议假设“现成 nodejs-mobile + npm install Midscene”可以直接成立。

| **路线**                         | **说明**                                | **优点**                        | **风险/限制**                      | **用途**   |
|----------------------------------|-----------------------------------------|---------------------------------|------------------------------------|------------|
| A. Termux/终端 Node 22/24        | 在 Android 终端环境先运行 Midscene Core | 最快验证 JS 依赖与 Agent 闭环   | 不代表最终 APK 运行时              | 首选 POC   |
| B. 自编译 Node 22/24 for Android | 基于 NDK 构建新版 Node/libnode          | 版本满足 Midscene，掌控构建参数 | 构建链、ABI、native addon 兼容成本 | 产品化主线 |
| C. 裁剪 Midscene 兼容 Node 18    | 降低 Node engine/依赖要求               | 可复用 nodejs-mobile            | 长期维护 fork，升级风险高          | 仅作为备选 |
| D. 非 Node JS 引擎               | QuickJS/Hermes 等                       | 体积可控                        | Node API、依赖生态改造巨大         | 不建议     |

## 5.2 APK 内嵌 Node 的产品化原则

- 优先以 APK 内置 native library（例如 libnode.so）+ JNI 启动 Node runtime，而不是运行时下载 node 可执行文件。

- Android 10/API 29+ 明确限制从可写 app home 目录 execve() 可执行文件；产品化应避免“下载 binary → chmod +x → exec”的模式。

- JS bundle、配置和模型资源可以是数据；可执行 native code 应随 APK/动态特性交付并遵循 Android 装载规则。

- 需要扫描 Midscene 及其依赖是否含 native addon、依赖 child_process/PTY/浏览器专属模块，并建立 Android 兼容清单。

# 6. 设备能力实现规划

| **能力**      | **POC 实现**                  | **产品化实现**                              | **关键指标/验证**                            |
|---------------|-------------------------------|---------------------------------------------|----------------------------------------------|
| 截图          | rish -c screencap -p → stdout | UserService/系统截图 → FD/pipe/local socket | 成功率、端到端耗时、分辨率、旋转、多 Display |
| 点击          | rish input tap                | InputManager/System API 或保留 shell 封装   | 坐标准确率、连续操作稳定性                   |
| 滑动          | rish input swipe              | InputManager/System API                     | 轨迹、duration、长滑/短滑                    |
| 按键          | rish input keyevent           | InputManager/System API                     | HOME/BACK/ENTER/DPAD 等                      |
| 文本输入      | input text / 自定义 IME       | 专用输入服务/IME/剪贴板桥                   | 中文、空格、特殊字符、密码框                 |
| 应用管理      | am start / am force-stop / pm | ActivityManager/PackageManager Binder       | 多用户、userId、前后台切换                   |
| 屏幕/窗口信息 | wm/dumpsys                    | DisplayManager/WindowManager/Binder         | 物理/逻辑尺寸、导航栏、安全区                |
| 系统查询      | getprop/dumpsys               | 按需封装系统服务                            | 版本差异和白名单能力                         |

> **截图优先级最高**  
> Midscene 的每一步感知都依赖视觉输入。POC 应优先证明“截图不落盘 + Buffer 直达 VLM”，产品化再进入持续帧源/压缩/共享内存优化。对车机多 Display 场景，需要把 displayId 作为一等参数，而不是默认 Display 0。

# 7. 分阶段路线图

| **阶段**                    | **目标**                         | **核心工作**                                                                                     | **Exit Gate**                                                        | **建议节奏** |
|-----------------------------|----------------------------------|--------------------------------------------------------------------------------------------------|----------------------------------------------------------------------|--------------|
| Phase 0 可行性 Spike        | 证明 Android 本机能跑 Agent 核心 | Node 22/24 环境；Midscene Core 最小启动；rish 权限；截图/tap/swipe/keyevent；模型调用            | 无外部 ADB Host 完成 screenshot → aiTap → screenshot → aiAssert 闭环 | 3–5 个工作日 |
| Phase 1 Local Transport MVP | 形成可维护的本机设备适配层       | AndroidTransport；LocalAndroidDevice；RishTransport；能力探测；日志/超时/错误码；多 Display 基础 | 核心 YAML 动作可运行；与 AdbTransport 回归结果一致                   | 1–2 周       |
| Phase 2 Native Host         | 从终端 POC 进入 APK 内运行       | 自编译 Node 22/24；libnode/JNI；Kotlin Bridge；Shizuku UserService+AIDL；生命周期/守护           | APK 独立启动 Agent；无 Termux 依赖；连续任务稳定运行                 | 2–4 周       |
| Phase 3 产品化/车机化       | 提高可靠性、性能与安全性         | 截图流；IME；权限恢复；崩溃拉起；资源限额；OTA；OEM Privileged Transport 可选                    | 达到内部工具发布标准；明确最终权限模型                               | 3–6 周       |

## 7.1 Phase 0：必须最先回答的五个问题

1.  Midscene Core 在 Android Node 22/24 环境中是否存在不可接受的 Node API / native dependency 阻塞？

2.  在目标车机/手机上，Shizuku shell 身份能否稳定完成 screencap、input、am/pm/dumpsys 等所需操作？

3.  截图是否能以 stdout/pipe 直接回到 Node Buffer，且无需临时文件？

4.  模型请求（云端或局域网）在车机网络/证书/代理环境下是否可用？

5.  在没有 PC/ADB host 的情况下，能否连续跑完一个包含感知、动作、断言的真实 Midscene 任务？

## 7.2 Gate 决策

| **Gate**              | **通过条件**                                | **未通过时的决策**                                             |
|-----------------------|---------------------------------------------|----------------------------------------------------------------|
| G0 Core Runtime       | Node 22/24 启动 Midscene Core，基础依赖完整 | 定位不可用依赖；评估 bundle/patch；必要时建立 Android 精简入口 |
| G1 Device Closed Loop | 截图 + 输入 + AI 动作闭环稳定               | 对比 Accessibility/MediaProjection 或目标设备 OEM 权限         |
| G2 Embedded Node      | APK 内 Node runtime 可稳定启动/停止/恢复    | 评估 sidecar/system daemon；不影响 Transport 接口              |
| G3 Privilege Model    | 确定 Shizuku 是否满足部署与重启要求         | 切换 OEM privileged/system app 路线                            |

# 8. 建议代码组织与模块边界

```text
midscene/
├─ packages/
│ ├─ core/ # 尽量保持上游
│ ├─ android/ # 现有 PC/ADB 设备实现
│ └─ android-local/ # 新增：LocalAndroidDevice
│ ├─ src/device/
│ ├─ src/transport/
│ │ ├─ types.ts
│ │ ├─ rish.ts
│ │ ├─ shizuku.ts
│ │ └─ oem-privileged.ts
│ └─ src/capabilities/
│
├─ android-host/
│ ├─ app/ # Kotlin Android Host App
│ ├─ bridge/ # AIDL / JNI bridge
│ ├─ shizuku-service/ # UserService implementation
│ └─ node-runtime/ # Node/libnode build & packaging
│
└─ examples/
└─ android-local-agent/ # 最小可运行样例 + 回归任务
```

**模块边界规则：**

- `@midscene/core` 不直接依赖 Android、Shizuku 或 JNI。

- `LocalAndroidDevice` 不直接执行 rish/adb；它只调用 AndroidTransport。

- 只有 transport 层允许知道 shell 命令、Binder、AIDL 或权限实现细节。

- 所有 transport 返回统一错误码（PermissionDenied、CommandFailed、ScreenshotFailed、Timeout、ServiceUnavailable 等），避免上层解析 stderr 文本。

# 9. 风险、对策与回退路线

| **风险**                          | **等级** | **影响**                             | **建议对策/回退**                                                                                      |
|-----------------------------------|----------|--------------------------------------|--------------------------------------------------------------------------------------------------------|
| Node 22/24 Android 构建与依赖兼容 | 高       | APK 产品化被阻塞                     | POC 先在 Termux/终端验证 Core；建立依赖扫描；必要时 Android bundle/fork；Embedded Node 作为独立 Gate。 |
| Shizuku 重启/授权生命周期         | 高       | 设备重启后 Agent 不可用              | POC 接受；产品阶段评估自动恢复；车机优先 OEM privileged/system service。                               |
| 隐藏 API / Binder 版本差异        | 高       | 不同 Android 版本行为不一致          | Transport capability negotiation；优先稳定 shell/API；隐藏 API 只封装在后端。                          |
| 截图性能与多 Display              | 高       | AI 感知延迟、抓错屏幕                | 先 pipe 后 stream；displayId 参数化；在真实车机矩阵做持续测试。                                        |
| 中文/特殊字符输入                 | 中高     | 业务任务大量失败                     | 专用 IME/ADB Keyboard 类方案；输入能力单独抽象；不要只依赖 input text。                                |
| 内存/CPU/温控                     | 中高     | Node + VLM client + 图像处理影响车机 | 限制并发、图片缩放、模型调用异步、资源监控；本地大模型另立容量预算。                                   |
| 普通 app shell 权限误判           | 中       | POC 看似可跑、真实命令失败           | 启动即记录 uid/capabilities；每类能力做 capability probe。                                             |
| Android 14+ rish/Dex 限制         | 中       | POC 部署失败                         | 遵循只读 DEX 要求；版本矩阵；尽早转 UserService。                                                      |

# 10. 验证矩阵与验收指标

## 10.1 功能矩阵

| **类别**     | **最小验收**                                                                |
|--------------|-----------------------------------------------------------------------------|
| 感知         | 指定 Display 截图；旋转/分辨率变化；连续 100 次截图无死锁/明显泄漏。        |
| 输入         | tap、long press、swipe、back/home/enter；连续操作；坐标与逻辑尺寸一致。     |
| 文本         | 英文、中文、空格、符号、Emoji（按业务需要）；焦点切换后输入。               |
| 应用生命周期 | 启动、切前台、force-stop、重启；多用户环境按目标 user 执行。                |
| Agent        | aiTap、aiQuery、aiAssert、aiWaitFor、scroll、keyboardPress 等核心动作闭环。 |
| 异常恢复     | Shizuku service 断开、Node runtime 异常、模型超时、截图失败后可恢复。       |
| 兼容性       | 至少覆盖目标车机实际系统版本/SoC；再增加 1–2 台 AOSP/消费设备作对照。       |

## 10.2 建议监控指标

- screenshot_latency_ms（P50/P95）、action_latency_ms、AI_roundtrip_ms。

- screenshot_success_rate、action_success_rate、transport_reconnect_count。

- RSS / PSS、CPU、温度、长任务持续时间、Node event-loop lag。

- 每条任务的模型 token/图片大小、重试次数、失败阶段。

# 11. 阶段交付物

| **阶段** | **交付物**                                                                                                |
|----------|-----------------------------------------------------------------------------------------------------------|
| Phase 0  | POC 脚本/样例；兼容性问题清单；Node/Midscene 依赖扫描；真实设备闭环录像/日志；G0/G1 结论。                |
| Phase 1  | `AndroidTransport` 接口；`RishTransport`；`LocalAndroidDevice`；核心 action 回归集；性能基线。      |
| Phase 2  | Android Host APK；Node 22/24 runtime 构建产物；JNI/AIDL Bridge；Shizuku UserService；生命周期与诊断工具。 |
| Phase 3  | 稳定版 APK/系统组件；权限模型结论；多 Display/IME/截图流优化；部署/升级/故障恢复文档；验收报告。          |

> **推荐的第一条实验任务**  
> 在目标 Android 设备上使用 Node 22/24 启动一个最小 Midscene Core 程序；通过 rish 获取指定屏幕截图并执行 input tap；完成“打开一个固定应用 → AI 找到指定控件 → 点击 → 截图 → AI Assert 成功”的端到端闭环。该实验通过后，再进入 APK 内嵌 Node。

# 12. 技术依据与参考

**\[R1\]** Midscene 主仓库 package.json：Node engine 当前为 ^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0  
<https://raw.githubusercontent.com/web-infra-dev/midscene/main/package.json>

**\[R2\]** Shizuku API README：UserService 可用 shell UID 2000 / root UID 0 运行 Java/JNI 代码  
<https://github.com/RikkaApps/Shizuku-API/blob/master/README.md>

**\[R3\]** Shizuku README：通过 Binder 以 ADB/root 权限访问系统 API；并说明频繁命令进程/文本处理的缺点  
<https://github.com/RikkaApps/Shizuku/blob/master/README.md>

**\[R4\]** Shizuku rish 入口实现/脚本（含 Android 14+ writable DEX 处理）  
<https://github.com/RikkaApps/Shizuku/blob/master/manager/src/main/assets/rish>

**\[R5\]** nodejs-mobile Releases：最新正式 core library release 为 Node 18.20.4  
<https://github.com/nodejs-mobile/nodejs-mobile/releases>

**\[R6\]** nodejs-mobile 当前 Node 22/24 升级相关 Pull Requests，可作为自编译/上游跟踪参考  
<https://github.com/nodejs-mobile/nodejs-mobile/pulls>

**\[R7\]** Android 10/API 29+ 行为变更：禁止从可写 app home 目录直接 execve() 可执行文件（W^X）  
<https://developer.android.com/about/versions/10/behavior-changes-10>

— End —
