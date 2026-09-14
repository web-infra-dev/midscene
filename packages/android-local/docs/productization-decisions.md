# Android 端侧自动化能力：范围、边界与 MVP 取舍

- 日期：2026-09-13（本次修订在原调研稿基础上重新界定范围，并移除 Termux + rish 现场）
- 范围：`packages/android-local` 与 `apps/android-host`
- 状态：目标方案。下文标为“待实现”“实测缺口”的能力尚未完成；**§9 的移除项已在代码与文档中执行完毕（未提交）**。
- 代码基线：`a674c0d26` + 本轮 rish 移除改动（未提交）。历史验证结果引用仓库记录，本次整理没有重新进行设备实测。
- 文档性质：内部中文决策记录，供实现和评审使用；不是安装操作手册。
- 上一版（按“用户产品”界定范围）：[productization-decisions-v1-product-scope.md](./productization-decisions-v1-product-scope.md)。本版取代其范围结论，事实与证据两节基本沿用。
- **2026-09-14 补记（§10）**：端侧特权通道由「唯一 Shizuku UserService」扩为**两条**，新增 **APK 内置 AOSP `adb` → 设备自身 adbd**（无线调试配对，同样落到 shell UID 2000）。触发原因是 ColorOS 16 移除了 shell 的 `GRANT_RUNTIME_PERMISSIONS`，Shizuku 在该 ROM 上无法给任何应用授权；现场证据见 [deployment.md](./deployment.md) §9（A16 系列）。**§1、§3、§9.1 中“唯一通道”的表述已被 §10 取代**，原文保留为历史取舍。

## 0. 定位：端侧自动化能力，不是 `@midscene/android` 的替代

`android-local` 的目标是给 Midscene 增加一种**执行位置**：把“截图 → 模型判断 → 执行动作 → 再次截图验证”的闭环放到 Android 设备本机上，用于**被测设备不接 PC** 的场景（封闭测试机、交付到他人手上的机器、车机等一线设备）。它是基于 Midscene 扩展性做的一个能力层，不改变既有 Android 包的任何职责。

| | `packages/android`（`@midscene/android`） | `packages/android-local`（本仓 `private`） |
| --- | --- | --- |
| 执行位置 | PC 上的 Node，经 ADB 驱动设备 | 设备本机的 Node |
| 状态 | v1.12.6，对外发布 | 未发布，端侧能力原型 |
| 通道 | ADB | 本地桥 + Shizuku（`adb-shell` 仅作契约对照） |
| CI | `.github/workflows/android-emulator.yml` 已覆盖单测与模拟器冒烟 | **未接入任何 workflow** |
| 适用场景 | 开发机、CI、设备农场 | 设备不接 PC 的现场 |

因此本文件讨论的所有边界都只约束 `android-local` 与 Host APK。**不得据此删减或改写 `@midscene/android` 的 ADB 能力**：PC + ADB 是既有正式路径，与端侧形态并存，不互相替代。

“端侧闭环”只表示执行引擎、设备控制和任务状态在手机上，**不表示任务和上下文不出设备**。使用远端模型时，截图和任务上下文仍会发送到用户配置的模型服务；这一点必须在配置界面说明。首版不承诺完全离线或本地模型推理。

## 1. 最终取舍

| 项目 | 取舍 | 原因 |
| --- | --- | --- |
| `android-local` | 端侧执行引擎，同时是主要开发者接口（CLI `doctor` / `run`） | 能力本身可组合、可脚本化，Host 只是其中一种入口 |
| `android-host` | 端侧形态的薄壳：授权、配置、运行、停止、看结果 | 不承担独立的产品策略、安全承诺或版本节奏 |
| 开发者接口 | 单一入口：`doctor` / `run`；端侧由 APK 承载，PC 在环时走 `adb-shell` | 只保留一条端侧现场，不为两处现场维护两套命令与两套行为预期 |
| Shizuku UserService | 端侧形态的**唯一**特权执行通道 | 已有端到端验证基础，绑定身份明确，适合 APK 集成 |
| Termux + rish 现场 | **移除**（见 §9） | 与桥通道同样依赖 Shizuku，并未提供“无 Shizuku”退路；保留只会多一套环境脆弱点与命名负担 |
| `RishTransport` | 保留实现（桥现场在复用），随 §9 更名为 `ShellTransport` | 它承载截图文件通道、显示缓存、输入与 yadb，与“谁负责 spawn”无关 |
| `adb-shell` transport | 保留，定位为契约对照与调试基线（PC 在环时） | 让 `transport-contract` 能用同一套测试约束多个后端；不作为端侧产品通道 |
| ADB | 不在本能力的端侧路径中出现；PC + ADB 的正式路径仍属 `@midscene/android` | 端侧形态的价值前提就是不需要 PC |
| Node、JS bundle、yadb | 固定版本随 APK 交付并自动准备 | 使用者不安装 Node、不管理依赖、不手动 push helper |
| Root、Sui、OEM 特权 | 首版不接入，也不因检测到更高权限而自动提权 | shell UID 2000 足够覆盖目标动作 |
| 多屏、远程控制、开机无人值守 | 延后 | 首版聚焦单设备、默认屏幕、单任务、用户主动运行 |
| 端侧特权通道（2026-09-14 修订，§10） | **两条**：① Shizuku UserService ② APK 内置 AOSP `adb` → 设备自身 adbd（无线调试回环端口）；App 内可切换，当前默认 phone adb（[`apps/android-host/README.md`](../../../apps/android-host/README.md)） | 两条都落到 shell UID 2000，都不引入 root/Sui/OEM 特权；当前提供者由 `channel` 如实上报 |

> **范围变更（2026-09-14，已执行，详见 §10）**：上表 2026-09-13 版把 Shizuku UserService 写成端侧「**唯一**特权执行通道」，并写明「ADB 不在本能力的端侧路径中出现」。**这两条已不再成立**：ColorOS 16（OnePlus 13T）移除了 shell 的 `GRANT_RUNTIME_PERMISSIONS`，Shizuku 在该 ROM 上无法授权，端侧因此新增第二条通道——APK 内置 AOSP `adb` 连接设备自身 adbd，同样拿到 shell UID 2000。它**不是 PC + ADB 路径**：adb 客户端跑在 APK 内、连的是 `127.0.0.1`。原有两行保留为 2026-09-13 的历史取舍，不再作为当前结论。

旧实验代码是否删除可在实现时处理；**保留哪些通道是配置问题，不该继续膨胀成多套用户安装流程。**

### 1.1 两个必须显式说明的负面范围

- **不是 `@midscene/android` 的替代品。** 不接管 ADB 后端，不改变其公开 API、发布节奏和 CI。
- **不是面向普通用户的消费级 App。** 使用前提包含 Shizuku + 手写任务，远超普通用户操作预期；因此本文件不为其承诺上架渠道、免授权安装或开箱即用体验。
- **不是 Termux 工具链。** 端侧现场只由 APK 承载；设备上没有 APK 时的执行路径不再支持（见 §9）。

## 2. 已确认的事实与证据边界

### 2.1 rish 与 Shizuku 的关系

Shizuku 提供特权服务和授权机制。rish 是其命令行入口，UserService 是其应用集成方式。两者均依赖 Shizuku，并不是两种独立的提权来源。

| 维度 | rish | UserService |
| --- | --- | --- |
| 接入方式 | 终端/Node 启动脚本，再由 `app_process` 加载 rish DEX | Android App 通过 Shizuku API 绑定自己的 Java/JNI 服务 |
| 授权对象 | 调用终端所属应用，例如 Termux | Midscene Host App |
| 权限来源 | Shizuku 的 shell/root 身份 | 同样取决于 Shizuku 的启动身份 |
| 集成成本 | 脚本、DEX、路径、文件权限、环境变量 | APK 内的 API、AIDL、服务和连接生命周期 |
| 当前调用成本 | 每次调用重新启动 rish 的 `app_process` | 可复用 UserService 进程；当前实现仍逐条启动 `sh -c` |
| 大载荷 | 本项目环境出现 stdout/stderr 分流问题，改用文件通道 | 当前 AIDL `byte[]` 方式不适合大截图，改用文件通道 |

Shizuku 还有远程 Binder 调用等 API。选择 UserService 是本项目的产品决策，不表示它是 Shizuku 唯一公开的能力。[官方 API 文档](https://github.com/RikkaApps/Shizuku-API/blob/master/README.md)

### 2.2 本项目验证结果

| 观察 | 对产品的影响 | 证据范围 |
| --- | --- | --- |
| Android 12 Termux + Node + rish 完成 AI 闭环 | 证明引擎可以迁移到设备本机 | 仓库 Phase 0 记录，不能外推为所有 ROM 均兼容 |
| rish 受 `LD_LIBRARY_PATH`、`LD_PRELOAD` 等环境影响 | 终端与内嵌 Node 环境需要额外适配 | 已记录系统 `app_process` 错误加载 Termux 库的失败 |
| rish 调用发生大输出分流、并发启动瞬时失败 | 截图改用文件通道，探测改为串行重试 | 属于本项目测试结果，不宣称所有 rish 用法都有相同缺陷 |
| Android 14 测试环境中，Host 调用 rish 返回 `Aborted` | APK 形态改走 UserService | 已观察失败，但没有足够证据确定底层根因或归因于 Shizuku 主动拒绝 |
| Android 14 Host + UserService + 本地桥完成端到端执行 | APK 形态具有实现基础 | 记录含 UID 2000、AI 断言、报告生成和正常退出 |
| 大 PNG 通过 AIDL 返回导致连接/服务失败 | 大载荷与控制请求分离 | 当前改为 shell 写共享通道文件、App 读取并通过本地桥返回 |
| 通过 `pm grant API_V23` 未能完成 Shizuku 授权 | 安装脚本不能替代用户授权 | 项目 Android 14 / Shizuku 13.x 验证记录 |
| **ColorOS 16 移除了 shell 的 `GRANT_RUNTIME_PERMISSIONS`**：`pm grant` / `pm revoke` 一律 `SecurityException`（exit 255），Shizuku 因此无法授权任何应用 | 端侧不再只有 Shizuku 一条通道：新增 APK 内置 adb 通道（§10）；也解释了此前「`pm grant` 看起来本该可行」的误解（`API_V23` 是 `dangerous` 而非 `signature`） | 2026-09-14 真机实测（OnePlus 13T），[deployment.md](./deployment.md) §9.1（A16-2 ~ A16-5） |

Android 14 对 rish 所加载 DEX 的可写性有约束，官方脚本包含检查和处理逻辑。因此不能把本项目的 `Aborted` 结果写成“Android 14 全面禁止 rish”或“所有 App 都不能使用 rish”。**这个观察只解释了一件事：APK 内的进程不适合经 rish 提权，所以 APK 形态用 UserService。** 它既不构成 Termux + rish 现场通道失效的证据，也不构成 PC + ADB 路径失效的证据——后者的正式实现在 `@midscene/android`，本文件无权评价。[官方 rish 脚本](https://github.com/RikkaApps/Shizuku/blob/master/manager/src/main/assets/rish)

历史数据见 [roadmap.md](./roadmap.md) 的 Phase 0 实测结论，以及 [deployment.md](./deployment.md) 的 A14 系列记录。现有记录主要覆盖特定模拟器配置，发布前仍需完成真实设备验收；`minSdk`、`targetSdk` 和 APK 能安装都不等于功能已验证。

**2026-09-14 补记**：首次主流零售机验收已完成（OnePlus 13T / ColorOS 16，[deployment.md](./deployment.md) §9）；该机的 Shizuku 通道不可用，端侧闭环由 adb 通道承担（§10）。

**其中前三条观察来自 Termux + rish 环境，该现场已决定移除（见 §9）。** 保留它们的原因不是继续支持该现场，而是这些测量直接决定了 transport 层的实现形态（文件通道、串行探测、环境隔离），换现场不会让结论失效。

### 2.3 为什么此前共存多套方案

1. 最初用 Termux + rish 快速验证 Node 依赖和 AI 闭环，避免同时承担 APK、AIDL 和运行时移植成本。
2. APK 化后，宿主具有原生 API 和生命周期管理能力，逐步切换到 UserService。
3. 为复用设备命令实现，当前通过替换 `CommandRunner` 接入本地桥，类名和配置仍保留 `RishTransport` / `backend: rish`。
4. ADB 用于开发对照，OEM 特权曾作为车机方向预留。

这些路径解释了研发过程。**当前不再要求收敛成“一种安装方式”，但端侧现场收敛为一种：APK + Shizuku。** Termux + rish 作为落地现场移除（见 §9），需要统一的仍是命令语义与状态判断（见 4.1），不是安装流程。

### 2.4 本次修订新增的核对结果（代码基线 `a674c0d26`）

修订过程中对仓库做了只读核对，以下为与上一版范围判断直接相关的新发现。它们改变的是“哪些条目属于首版必做”，不改变 2.2 的实测记录。

| 核对项 | 结果 | 对本文件的影响 |
| --- | --- | --- |
| `android-local` 的 CI 覆盖 | `.github/workflows/android-emulator.yml` 只构建并测试 `@midscene/android`；`android-local` 未接入任何 workflow | CI 接入从“后续工作”升为**首版第一优先** |
| `test:ai` 脚本 | `rstest.config.ts` 在 `AI_TEST_TYPE=android-local` 时选取 `tests/ai/**/*.test.ts`，而 `packages/android-local/tests/` 只有 `unit-test/` 一个目录 | 该脚本当前选中零个文件却算通过，属假绿，必须修 |
| YAML `javascript` 流程项 | `packages/core/src/yaml/player.ts:450` 支持 `javascript:`，但 `LocalAndroidDevice` 未实现 `evaluateJavaScript`，[`agent.ts:1617`](../../core/src/agent/agent.ts) 会先断言抛错 | 从“待封堵的风险”改判为**功能缺口**（见 5.2） |
| shell 动作暴露 | `exposeRunAdbShellAction` 默认 `false`（[schema.ts](../src/config/schema.ts)） | 基线已比上一版描述更严，无需重复加固 |
| Host 侧绑定身份校验 | 除 `Shizuku.checkSelfPermission()` 外，Java/Kotlin 侧没有比对 UID 的代码；`ExecUserService.uid()` 已实现但未被使用 | 升为首版必做（理由见 5.1） |
| 运行按钮的就绪判断 | [`ConsoleActivity.kt`](../../../apps/android-host/app/src/main/java/com/midscene/android/ConsoleActivity.kt) 的运行按钮仅判断 `prompt.isNotBlank() && !busy`，Shizuku 授权与 UserService 就绪不参与判断 | 升为首版必做（理由见 4.2） |
| 凭据存储 | `ModelEnvFile` 无任何加密代码，API Key 以明文存于 `filesDir/model.env` | 保留为交付模式的前置项，不阻塞内部工具 |
| 两包边界 | `packages/android-local/package.json` 为 `private: true`，且没有任何包依赖它（roadmap P1-7 的收敛未做） | 端侧能力与既有 Android 包无依赖耦合，可独立演进 |
| 契约测试归属 | `tests/unit-test/transport-contract.ts` 与 `AdbShellTransport` 均在 `android-local` 内；`packages/android/tests/unit-test/` 无对应文件 | 多后端一致性只在 `android-local` 内部被约束，表述时不要外推 |
| 文档引用有效性 | 上一版全部相对引用（含 `../../core/src/yaml/player.ts`、`../../../apps/android-host/...`）经逐个核对均指向真实文件 | 无需修正。但 YAML 引擎属 `packages/core`，不在 `android-local` 内，讨论“能否禁掉 javascript”时要意识到改动面在 core，不在本包 |

## 3. 目标架构与职责

端侧只有一个落地现场，PC 在环时另有调试基线：

```text
端侧（唯一正式现场）
  Host APK → 内嵌 Node / android-local → 本地桥 → Shizuku UserService → shell UID 2000

PC 在环（调试与契约对照，非端侧）
  PC 上的 Node → midscene-local doctor / run → adb-shell → shell UID 2000

共同的下半段
  android-local 执行 Agent，提交设备动作
  → 截图与动作结果返回 Agent，形成“截图 → 判断 → 动作 → 再截图”闭环
  → 报告与日志留在设备本机
```

> **2026-09-14 补记（§10）**：端侧现有**两条**通道。上面第一段（唯一正式现场）在 ColorOS 16 类 ROM 上把「Shizuku UserService」一段换成「APK 内置 adb → 设备自身 adbd」，其余不变；两条通道共用同一个 transport、同一套能力判定，当前提供者由 `channel` 读出。

| 组件 | 职责 | 边界 |
| --- | --- | --- |
| Host App | 授权、模型配置、运行生命周期、结果查看 | 不替用户批准系统权限，不自动修改调试/安全设置；不定义独立的产品策略 |
| `android-local` | Agent、声明式任务、Device 动作、transport 选择 | 不替使用者决定信任级别；不隐藏失败状态 |
| 本地桥 | Node 与 Android 之间的通信、会话校验、结果传输 | 只服务本次运行；不作为对外接口 |
| UserService | 固定设备能力的实现 | 与 `android-local` 同属可信实现，不假装能隔离同 UID 代码（见 5.1） |

本地桥保留回环 HTTP 和随机 token，首版不另造 JNI 或新通信协议。当前桥暴露 `/exec`、`/exec-binary`、`/read-file`、`/ready` 四个点位（[ExecBridge.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ExecBridge.java)），下半段由 `sh -c` 执行（[ExecUserService.java:66](../../../apps/android-host/app/src/main/java/com/midscene/android/ExecUserService.java)）。**在“任务由开发者自写”的前提下，这个形态可以接受**；何时需要改成结构化动作协议见 5.3。

底层复用 `screencap`、`input`、`am` 等命令。yadb 继续保留以覆盖中文输入等能力，属于固定的内部 helper，不是可替换插件；版本、校验和部署位置由 App 管理。UserService 不会消除 yadb 的 `app_process` 成本，后续再评估直接集成输入能力。

## 4. 部署与使用

### 4.1 单一入口，两种运行位置

`doctor` 与 `run` 是唯一的开发者接口。端侧由 APK 内的 Node 调用（桥通道），PC 在环时由开发者直接调用（`adb-shell`，用于调试与契约对照）。两者的**行为预期必须一致**：相同的 `doctor` 输出字段、相同的失败分类、相同的 `run` 参数与退出码；差异只在 transport 实现，不应泄漏为两套使用心智。

- **端侧（APK）**：App 内准备 Node runtime 与 helper，自动解包内置资源，幂等；资源缺失或 APK 版本变更时自动重跑。使用者不需要了解 backend、DEX、Node 安装、yadb 路径或文件通道目录。
- **PC 在环（`adb-shell`）**：`midscene-local doctor` / `run` 直接驱动设备，不经过桥，也不需要 Shizuku 授权；它不替代端侧现场，只用于开发与回归。

### 4.2 状态判断必须反映真实状态（首版必做）

**实测缺口**：当前 Host 的运行按钮只判断 `prompt.isNotBlank() && !busy`，Shizuku 授权、绑定身份、UserService 就绪、helper 有效性和模型配置都不参与判断；而 `ExecUserService.uid()` 已经实现却没有任何调用方。结果是身份不符或服务未就绪时，使用者会在运行中途拿到难解释的失败。

首版要求：运行入口由真实状态决定——Shizuku 可连接、绑定身份是 shell UID 2000、UserService 已就绪、内置资源有效、模型配置完整。**理由是可诊断性，不是防提权**：端侧工具最难排查的一类失败是“跑了一半才报错”。

服务断开、授权撤销、使用者停止时，立即拒绝新动作并清空待执行队列；已经发生且结果不明的设备操作不得自动重放。Shizuku 恢复后重新检查状态即可，不自动恢复上一次任务。

非 Root Shizuku 在设备重启后需要重新启动；Android 11 起可用无线调试在设备上启动。这是明确的人工边界，不自动开启无线调试或改变系统安全设置（[官方启动说明](https://shizuku.rikka.app/guide/setup/)）。对端侧工具而言，重启后需要重新启动是**已知成本**，首版只需给出清楚的现状说明，不承诺自动恢复。

### 4.3 可选权限

- Overlay 不是闭环前置条件。**注意：当前引导向导把它做成了第 3 步（[ConsoleActivity.kt](../../../apps/android-host/app/src/main/java/com/midscene/android/ConsoleActivity.kt)），与本节结论不一致，需择一。**
- 电池优化豁免不强制申请，不通过 shell 静默加入白名单。
- 通知权限按系统机制请求，不得通过 shell 代授；通知不可见时如实说明，App 内保留停止入口。
- 不保证任务完成后强制把 App 拉回前台。
- `adb-bootstrap.sh` 定位为开发工具。`run-as`、debug 导出服务和固定等待不能作为 release 安装机制；移除静默授权假设，以明确成功状态代替固定 sleep。

## 5. 信任模型与安全边界

### 5.1 威胁模型：先明确“谁在写任务”

上一版按“用户产品”设定边界，隐含假设是**任务和模型输出都不可信**，因此要求移除任意 shell、校验任务格式、隔离应用范围。本能力的实际使用方式是**开发者自写任务**，威胁模型因此不同：

| | 内部工具（首版） | 交付模式（尚未启用） |
| --- | --- | --- |
| 任务作者 | 开发者自己 / 本团队 | 外部使用者 |
| 主要风险 | 模型误操作、状态误判、难诊断的失败 | 任务本身是攻击载荷 |
| YAML `javascript` / shell 动作 | **视为正当能力，保留** | 需要限制 |
| 应用范围 | 不限制 | 需要限制 |
| 凭据加密 | 可延后 | 需要 |

**结论：首版按内部工具实现，不套用交付模式的限制。** 这不是“永远不做安全边界”，而是**不在没有对应风险时先付出限制能力的代价**——尤其不能用交付模式的限制去砍掉 Midscene 的扩展性，那与本节目标（基于 Midscene 扩展性做端侧能力）直接冲突。

同时必须诚实承认：**Host、随包交付的 Node 代码与 UserService 同属可信实现。** 本文件不承诺在 Host 或同 UID 代码被攻陷后仍能隔离特权。因此首版不提供第三方可执行插件机制。

### 5.2 首版仍然要做的两条

**① 绑定身份取真实值并用于判断。** 只接受 Shizuku 提供的 shell UID 2000；绑定前检查服务身份，执行侧校验实际 UID；root UID 0 不作为“更强且兼容”的成功状态。**不自动切换或接管特权来源**：不启用 Sui、`su` 或 OEM 特权通道，也不因检测到更高权限而提升执行身份。授权必须由用户通过官方界面作出，不通过修改权限数据库、代点授权弹窗或安装额外特权组件补齐。

理由是可诊断性：`rish.ts` 当前把 UID 0 和 2000 都算作特权成功（`privileged: uid === SHELL_UID || uid === ROOT_UID`），而 Host 侧完全没有比对 UID 的代码。使用者拿到 `uid=0` 或身份不符时，需要状态查询直接告诉他哪里不对。（该文件随 §9 更名为 `shell.ts` / `ShellTransport`，这条缺口不因改名消失。）

**② `javascript` 与 shell 能力保持可用，但必须显式。** YAML 的 `javascript:` 流程项是 Midscene 的既有能力，端侧路径要对齐而不是禁掉：`packages/core/src/yaml/player.ts:450` 支持它，但 `LocalAndroidDevice` 未实现 `evaluateJavaScript`，[`agent.ts:1617`](../../core/src/agent/agent.ts) 会先断言抛错。**首版应让它明确可用，或明确报“本路径不支持”，而不是抛出难以理解的断言**。同理，`exposeRunAdbShellAction` 默认 `false` 是合理基线，使用者要开就显式打开。

### 5.3 交付模式的前置项（现在不做，条件触发）

以下条目**在决定把 APK 或任务文件交给外部使用者时**成为前置条件。保留在此以便需要时直接取用，不要提前实现：

- **动作接口替代通用 shell**：把 `/exec` 改为结构化动作（截图、点击、滑动、输入、有限按键、启动范围内应用、状态查询），逐项校验坐标、长度、时限、包名；移除正式协议中的任意 `exec(command)` / `exec-binary(command)`。仅隐藏模型可见的 shell 动作不足以完成限制，因为同一个 Node 进程仍可直接调用底层桥。
- **任务格式限制**：导入任务采用受限声明式格式，拒绝任意 JavaScript、shell、动态模块和指向任意本机文件的脚本引用；任务文件不能覆盖模型地址、权限后端、环境变量。
- **应用范围与系统界面**：由用户确定允许操作的应用，系统授权、权限设置、安装器等界面暂停交用户处理；不依赖提示词让模型自律。
- **文件与凭据**：`/read-file` 当前允许 `Android/data/<pkg>`、`/data/data/<pkg>`、`/data/user/0/<pkg>` 三棵子树（含配置目录），交付模式下应限定到本次运行的通道资源；API Key 当前以明文存于 `filesDir/model.env`，交付模式下应使用 Keystore 加密，且运行时凭据不进入日志、报告或导出文件。
- **系统权限自证**：缺少权限时停止并说明，不通过修改权限数据库、代点授权弹窗或改系统安全机制补齐。授权撤销后立即拒绝新动作，中断时结果不明的动作不得自动重放。

以上每条都成立，但它们的代价是能力收窄与实现量倍增。**触发条件只有一个：任务作者从“自己人”变成“外部人”。**

## 6. 端侧能力工具的差距

分两类：**A 类是“端侧工具本身不成立”的缺口，属首版范围；B 类是交付模式的前置项，现在不做**（见 5.3）。

### 6.1 A 类：首版范围

| 当前实现 | 目标变化 | 主要位置 | 影响 |
| --- | --- | --- | --- |
| `android-local` 未接入任何 workflow；`test:ai` 选取不存在的 `tests/ai/**`，选不到文件却算通过 | 单测与 `transport-contract` 接入 CI；`test:ai` 要么补目录要么删除 | [`.github/workflows/android-emulator.yml`](../../../.github/workflows/android-emulator.yml)、[`rstest.config.ts`](../rstest.config.ts) | 12 个单测文件只在本地跑，“已通过”无外部保证 |
| 运行入口只判断 `prompt.isNotBlank() && !busy` | 由真实状态决定：Shizuku 可连接、UID 2000、UserService 就绪、资源有效、模型配置完整 | [ConsoleActivity.kt](../../../apps/android-host/app/src/main/java/com/midscene/android/ConsoleActivity.kt) | 失败点后移，最难诊断 |
| `ExecUserService.uid()` 已实现但无人调用；`rish.ts` 把 UID 0 与 2000 都算特权成功 | 绑定与执行两侧取真实 UID 并用于判断与报错 | [rish.ts](../src/transport/rish.ts)、[ExecUserService.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ExecUserService.java) | 身份不符时表现与预期不符，且无提示 |
| YAML `javascript:` 在端侧触发断言错误（`LocalAndroidDevice` 未实现 `evaluateJavaScript`） | 明确支持，或明确报“本路径不支持”并给出替代写法 | [player.ts](../../core/src/yaml/player.ts)、[device.ts](../src/device.ts) | 与“基于 Midscene 扩展性”的目标直接冲突 |
| 能力信息只存在于 `describe()` 字符串与文档叙述中 | `doctor` / `getCapabilities()` 输出机器可读的能力与降级原因，与实际行为一致 | [device.ts](../src/device.ts)、[cli.ts](../src/cli.ts) | 使用者无法程序化判断“该降级还是该失败” |
| 超时、重试与中断语义未定义 | 明确哪些失败可重试、哪些动作幂等、超时后设备状态是否已知 | [errors.ts](../src/transport/errors.ts)、[run.ts](../src/runner/run.ts) | 长时间或反复运行时的抖动无法归因 |
| 真机记录主要来自模拟器；`doctor` / `run` 在真机上的完整闭环无验收卡 | 至少一台真实设备跑通含中文输入与 `aiAssert` 的任务，并留下验收记录 | [deployment.md](./deployment.md)、[roadmap.md](./roadmap.md) | “端侧能力可用”目前缺少直接证据 |
| 引导向导把 Overlay 作为第 3 步，与 4.3 的结论不一致 | 择一：保留为可选项，或明确它确为前置 | [ConsoleActivity.kt](../../../apps/android-host/app/src/main/java/com/midscene/android/ConsoleActivity.kt) | 代码与决策记录不一致 |
| helper 准备失败时仍可能回退 rish；初始化记录失败后仍继续版本检查 | 准备结果反映全部必需资源，失败即保持未就绪并显示原因 | [Provisioner.java](../../../apps/android-host/app/src/main/java/com/midscene/android/Provisioner.java)、[AgentService.java](../../../apps/android-host/app/src/main/java/com/midscene/android/AgentService.java) | 状态显示“可运行”但实际会失败 |
| `adb-bootstrap.sh` 部署 rish/dex、尝试静默授权、使用固定等待 | 开发部署流程移除静默授权假设，以明确成功状态代替固定 sleep | [adb-bootstrap.sh](../../../apps/android-host/scripts/adb-bootstrap.sh) | 误导后续使用者 |
| `@midscene/android` 与 `android-local` 各有一份 ADB 实现（roadmap P1-7 未做） | 按需收敛为单向依赖：纯逻辑（display 解析、坐标/滚动数学）由一处提供 | [adb-shell.ts](../src/transport/adb-shell.ts)、[roadmap.md](./roadmap.md) | 同一件事两处维护，是持续的记忆与评审成本 |

### 6.2 B 类：交付模式的前置项

见 5.3。包括：结构化动作协议替代 `/exec`、任务格式限制、应用范围与系统界面处理、`/read-file` 收窄、凭据 Keystore 加密、权限与断线的严格处理。**这些不是首版事项**，列在 5.3 是为了在触发条件出现时可直接取用。

历史调研保留为证据。README 与部署指南中的现状描述需同步，移除“Host 必须使用 rish”这类过时说法。**注意方向**：不是把 Termux + rish 说成“不受支持的历史遗留”，而是明确它作为现场已被移除（§9）；`deployment.md` 的 A14 系列记录与 `research-v0.1.md` 仍是有效证据，只需标注其环境。

## 7. 验收标准与优先顺序

### 7.1 首版验收（端侧能力工具）

| 类别 | 最小验收 |
| --- | --- |
| CI | 单测与 `transport-contract` 在 CI 中强制运行；`test:ai` 不再假绿 |
| 真机闭环 | 一台真实设备：`doctor` 通过 → `run` 完成含中文输入、`aiAssert`、报告生成的 YAML |
| 能力自洽 | `getCapabilities()` / `doctor` 的输出与实际可用行为一致；不支持的能力给出明确错误而非静默降级 |
| 状态与身份 | 未授权、拒绝授权、UID 不符、服务未就绪、资源缺失、模型配置不全，均在运行前反映在状态查询中并阻止运行 |
| 特权通道 | 运行前的状态查询如实报出当前 `channel`（`shizuku` \| `adb`）及其就绪状态；某条通道不可用时给出可读原因与替代路径（如 Shizuku 不可授权 → 走 adb 配对），不把通道问题伪装成任务失败 |
| 可诊断性 | 上述每种失败都有可读原因，且不需要读日志才能定位 |
| 生命周期 | 停止、授权撤销、断线后不再接受新动作，待执行队列清空；恢复连接不自动重放不确定操作 |
| 扩展性 | YAML 的 `javascript:` 与 shell 动作在端侧路径上行为明确（可用或明确不支持），与 `@midscene/android` 的差异有文档说明 |
| 数据去向 | 截图与上下文发往远端模型这一事实在配置界面可见；报告与日志留在本机，仅使用者主动导出 |
| 接口一致性 | 端侧（桥）与 PC 在环（`adb-shell`）在同一任务的 `doctor` / `run` 语义一致 |

适配范围以实际通过验收的 Android 版本、ROM 和 ABI 清单为准。现有 arm64 与 Android 12/14 记录是起点，不直接承诺所有设备兼容。

### 7.2 实现顺序

| 顺序 | 事项 | 理由 |
| --- | --- | --- |
| 1 | CI 接入 + 修 `test:ai` 假绿 | 消除“测试没在跑”这个最大盲区，成本最低 |
| 2 | 真机验收卡（`doctor` → 含中文输入与 `aiAssert` 的 `run`）**并行开工** | “端侧能力可用”的唯一有效证明，且真机大概率暴露协议层需要改的事实，越早越好 |
| 3 | 绑定身份取真实 UID + 运行入口的真实状态判断 | 端侧工具最难排查的失败类别 |
| 4 | 能力矩阵机器可读 + 错误/超时语义 | 决定使用者能否程序化判断降级与重试 |
| 5 | YAML `javascript:` 对齐 + shell 动作显式开关 | 兑现“基于 Midscene 扩展性”的承诺 |
| 6 | 状态显示一致性（准备失败不得显示可运行）、引导与 Overlay 择一、bootstrap 清理 | 消除“说能跑其实不能跑” |
| 7 | 按需收敛重复的 ADB 逻辑（roadmap P1-7） | 降低长期维护与评审成本 |
| 后续 | 截图 FD/LocalSocket 优化、输入能力并入 UserService、移除 yadb、扩展设备矩阵、长时间运行 | 首版之后再评估 |

### 7.3 明确不做

- 不替代或改写 `@midscene/android` 的 ADB 能力与公开 API。
- 不追求消费级 App 的安装与授权体验，不承诺应用商店渠道。
- 不维护 Termux + rish 现场，也不为各通道分别提供安装流程（§9）。
- 不做开机无人值守、远程控制、多设备编排。
- 不承诺完全离线或本地模型推理。
- 不提供第三方可执行插件机制。
- **不把 5.3 的交付模式限制提前施加到首版**，尤其不以降低 Midscene 扩展性为代价。
- **不为 ColorOS 16 类 ROM 绕过 Shizuku 的授权限制**：不改权限数据库、不代点授权弹窗、不引入 root/Sui/OEM 特权；改用第二条通道（§10.1）。
- **不覆盖 Android 10 及以下的端侧配对流程**：该平台没有无线调试配对，只能手动连接一个已在监听的 adbd 端口（§10.2）。
- **不处理小米/Redmi 等 ROM 的 `input` 限制**（需用户额外打开「USB 调试（安全设置）」）：它同等影响任何基于 adb 的方案，与本实现无关（§10.4）。
- 两条通道的授权方式天然不同（Shizuku 授权弹窗 vs 无线调试配对码），这是权限来源的差异，**不构成两套安装流程**。

## 8. 参考资料

- [上一版（按“用户产品”界定范围）](./productization-decisions-v1-product-scope.md)：安全边界的完整论证来源；本版 5.3 由它收敛而来。
- [原始调研与分阶段设计](./research-v0.1.md)：解释 rish POC、UserService 和 OEM 方向的历史选择。**保留为证据**（见 9.4）。
- [Phase 0 验证与路线图](./roadmap.md)：Termux、环境变量、输出通道和性能记录。**保留为证据**（见 9.4）。
- [部署与 Android 14 验证记录](./deployment.md)：A14-4、A14-5、A14-8、A14-14 至 A14-17 等。**保留为证据**（见 9.4）。
- [Host 当前说明](../../../apps/android-host/README.md)：构建、部署和 UI；部分 rish 描述仍待同步（见 §9）。
- [Shizuku API 官方文档](https://github.com/RikkaApps/Shizuku-API/blob/master/README.md)：授权、shell/root 身份、UserService 能力与限制。注意其 shell 权限本身较宽，能力受 Android 版本与 SELinux 约束；固定 UID 只能限定权限来源，不能代替动作限制。
- [Shizuku 官方 rish 脚本](https://github.com/RikkaApps/Shizuku/blob/master/manager/src/main/assets/rish)：DEX 加载、Android 14 文件权限处理和调用应用标识。移除端侧 rish 现场后，本链接仅作 §9 的背景参考。
- [Shizuku 官方使用手册](https://shizuku.rikka.app/guide/setup/)：启动流程与系统限制。

外部资料已在调研阶段查阅；官方 master 文档会变化，实现和发布时应按选定依赖版本再次核对。

## 9. 已完成：移除 Termux + rish 现场与 `RishTransport` 的启动模式

**状态：已执行（未提交）。** 本节保留决定理由与执行记录，便于评审回溯。执行后的仓库不再包含 rish 作为能力：字符串 `rish` 只出现在历史文档与"为什么不用它"的注释里。

### 9.1 决定与理由

端侧现场收敛为**唯一一种：APK + Shizuku UserService**。Termux + rish 作为落地现场移除。

理由不是"rish 不好用"，而是**它没有提供不可替代的能力**：桥通道同样依赖 Shizuku，所以 rish 并不构成"无 Shizuku"的退路，它只提供"无 APK"的退路，而该场景不在目标内。保留它换来的是持续成本：

- 环境脆弱点：`LD_LIBRARY_PATH` / `LD_PRELOAD` 会污染 `app_process`（已实测踩坑），必须靠 `unsetEnv` 兜底；
- 输出通道异常：大输出在 stdout/stderr 之间分流，必须靠文件通道与兜底解析；
- 每次调用重开 `app_process`（实测 0.4–1.8s），并把 yadb 也变成子进程；
- 命名负担：端侧唯一在用的 transport 与配置项以已删除的通道命名。

执行阶段新增的一条硬证据：Host 里唯一真正 spawn rish 的地方是 `Provisioner.installYadb` 的回退分支，而它所在的调用路径（app 进程 spawn rish）正是在 Android 14 上被 `Aborted` 的那条。**这个回退不是容错，而是一个在目标平台上大概率无效、只会把清晰失败推迟的分支**——删除它同时消除了误导。

### 9.2 关键前提：删的是"启动模式"，不是 transport

`run.ts` 的桥分支复用的正是原 `RishTransport`，只是注入了 `ExecBridgeCommandRunner`。因此改动不是删除 1118 行，而是移除其自启模式。实际分工：

| 部件 | 处置 |
| --- | --- |
| `options.runner ?? new NodeCommandRunner()` 回退 | **删**；`runner` 改为必填 |
| `rishPath` / `shPath` / `rishArgs` / `useShLauncher` / `DEFAULT_RISH_PATH` | **删** |
| `unsetEnv` / `DEFAULT_UNSET_ENV` | **删**（桥现场本就传 `unsetEnv: []`；环境处理整体归 runner） |
| `combinedOutputText()` 中面向 rish 分流的部分 | 注释改写；`payload.ts` **保留**（`adb-shell` 与 `text-input` 在用） |
| `DEFAULT_FILE_CHANNEL_DIR = /data/local/tmp/midscene-channel` | **删**；`fileChannelDir` 改为必填并在构造时校验 |
| 截图文件通道、显示缓存、input keycode、yadb 输入、`Semaphore`、`ShellFileIo` | **保留**，桥现场依赖它们 |
| `NodeCommandRunner` | **保留**，`adb-shell` 用它 spawn `adb` |

transport 现在固定构造 `['sh', '-c', command]` 交给 runner：如何抵达 shell uid 由 runner 决定，transport 不再拼启动器 argv。

### 9.3 执行记录

| # | 事项 | 结果 |
| --- | --- | --- |
| 1 | `src/transport/rish.ts` → `src/transport/shell.ts`（`git mv`，保留历史） | 完成 |
| 2 | 删自启模式与 Termux 专属选项；`runner`、`fileChannelDir` 必填 | 完成 |
| 3 | `runner` / `fileChannelDir` 的运行时校验（`InvalidArgument`，非静默降级） | 完成 |
| 4 | `src/runner/run.ts`：删 rish 回退；无桥且未选 `adb-shell` 时给出可读错误 | 完成 |
| 5 | `src/config/schema.ts`：删 `rishPath`；`backend` 枚举改为 `shizuku-userservice` \| `adb-shell` | 完成 |
| 6 | `src/cli.ts`：删 `--backend rish` / `--rish-path`；默认 `shizuku-userservice`；新增 `--file-channel-dir` 与 `MIDSCENE_FILE_CHANNEL_DIR` | 完成 |
| 7 | `src/index.ts`：删 `DEFAULT_RISH_PATH`、`DEFAULT_UNSET_ENV`、`DEFAULT_FILE_CHANNEL_DIR` 导出 | 完成 |
| 8 | `TransportBackend`：删 `'rish'`；传输层标识改用既有的 `'shizuku-userservice'` | 完成 |
| 9 | **更名** `RishTransport` → `ShellTransport`（`ShellTransportOptions` 同步） | 完成 |
| 10 | **Host**：删 `Provisioner.installYadb` 的 rish 回退（改为明确报"user service 未就绪"）与 `ShellRunner.rish()`；删 `ShellRunner` 的 `RISH_APPLICATION_ID` | 完成 |
| 11 | **Host 模板**：`AgentService.deviceYaml()` 与 `SelfCheckScript` 的 `backend`/`rishPath` 死配置清除 | 完成 |
| 12 | **Host**：合并重复的 `AgentService.channelDir()` 到 `Provisioner.channelDir()`；给 CLI 注入 `MIDSCENE_FILE_CHANNEL_DIR` | 完成 |
| 13 | `adb-bootstrap.sh`：删 rish/dex 部署步骤（步骤编号重排） | 完成 |
| 14 | 测试：`rish-transport.test.ts` → `shell-transport.test.ts`；断言从启动 argv 改为 `sh -c` payload；删两条只描述自启行为的用例，新增"环境处理归 runner"与"fileChannelDir 必填" | 完成 |
| 15 | 文档：本文件、`README.md`、`docs/README.md`、`architecture.md`、`deployment.md`、`roadmap.md`、`baseline.md`、两个 example | 完成 |

验证：`tsc --noEmit` 通过；`rstest run` 200 项全通过；`rslib build` 通过（含类型检查）；`prettier`、`biome check` 通过。**未提交。**

### 9.4 明确保留的历史证据

`research-v0.1.md`（调研原文）、`roadmap.md` 的 Phase 0 结论、`deployment.md` 的 A14 记录、`baseline.md` 的两后端对比**不删除**。它们记录了 transport 层为何长成现在这样（文件通道、串行探测、环境隔离），是 9.1 判断的依据。删除现场不等于删除证据。

`ExecUserService.java`、`ShizukuExecBridge.java`、`IExecService.aidl` 中保留"这取代了 rish / rish 在 Android 14 上不可用"的注释：它们解释了为什么用 UserService，属设计依据而非过时描述。

### 9.5 未完成项

`apps/android-host/README.md` 仍有 rish 相关描述，需要同步（本次未改）。

2026-09-14 新增通道带来的未完成项见 **§10.4**（重新配对引导、运行前凭据校验、小米/华为 `input` 限制的范围外结论、OnePlus 13T 的登记条件）。

## 10. 范围变更：端侧新增第二条通道（APK 内置 adb → 设备自身 adbd）

- 日期：2026-09-14（真机实测：OnePlus 13T / ColorOS 16）
- 状态：已执行并验证（代码 + 实机端到端，未提交）
- 现场证据：[deployment.md](./deployment.md) §9（A16-1 ~ A16-20）

### 10.1 决定与理由

**变了什么。** 端侧特权通道从「唯一一种：APK + Shizuku UserService」（§9.1 的 2026-09-13 结论）改为**两条**：

1. **Shizuku UserService**——实现不变，保留；
2. **APK 内置 AOSP `adb` → 设备自身 adbd**——新增，经无线调试的回环端口配对连接，同样拿到 shell UID 2000。

**为什么变。** ColorOS 16（OnePlus 13T）移除了 shell UID 的 `GRANT_RUNTIME_PERMISSIONS`（[deployment.md](./deployment.md) A16-3）。Shizuku 记录客户端授权的方式正是**授予** `moe.shizuku.manager.permission.API_V23`（`protectionLevel=dangerous`，用 aapt2 在 Shizuku 13.6.0 上核对），这条路只能走 `pm grant`；而该 ROM 上 `pm grant` / `pm revoke` 一律 `SecurityException`（exit 255）。结果是在这台设备上 **Shizuku 永远无法授权任何人**，不是配置或操作问题。逐项探测还显示：ROM 只移除了这一个能力，agent 需要的 `appops`、`dumpsys`、`settings put`、`input keyevent`、`screencap`、`am start`、`app_process`（yadb）全部仍在（A16-4、A16-5）。**即：受限的是 Shizuku 的授权机制，不是本能力所需的 shell 权限。**

**为什么不做绕过。** 不修改权限数据库、不代点授权弹窗、不引入 root/Sui/OEM 特权——与 §5.2 的既有边界一致。第二条通道不是提权：它到达的仍是 shell UID 2000，`channel` 会如实说出当前是谁提供的 shell（A16-20）。

**代价与边界。** 用户需要在设备上开启无线调试并完成一次配对（6 位码）；配对与开关的时效性是这条通道的固有成本（§10.2）。**这不是 PC + ADB 路径**：adb 客户端随 APK 交付、以 app 身份运行、连的是 `127.0.0.1`，仍然满足 §0「被测设备不接 PC」的定位。

### 10.2 机制与边界

机制：AOSP `adb` 客户端（取自 Termux 的 `android-tools`）作为 native library 随 APK 交付——`libadbbin.so` 加 `jniLibs/arm64-v8a/` 里约 102 个依赖库——与设备自身 adbd 配对并连接。独立先例：LADB 就是同一套做法（AOSP adb 编入 `jniLibs`、`ProcessBuilder`、`HOME=filesDir`、`useLegacyPackaging=true`）。

三条来自现场的产品约束（A16-15 ~ A16-19）：

- **配对状态只能由设备侧证据确认**：一次确认过的 `adb pair`，或一次以 uid 2000 应答的连接。**「本地存在密钥文件」不算配对**——adb 客户端首次运行就会生成密钥对，包括设备拒绝了的那次配对。
- **配对会过期，但不需要重复配对**：无线调试在设备重启后、以及 Wi‑Fi/BSSID 变化后关闭（用户需重新打开开关）；配对密钥在 7 天无活动后失效（AOSP `ADB_ALLOWED_CONNECTION_TIME` 默认 604800000 ms）。UI 必须能区分「开关关了」和「密钥过期」。
- **adb server 的归属权**：adb 每个端口只有一个 server，第一个请求它的客户端拥有它（连同客户端 `HOME` 里的密钥对）。App 因此跑在自己的 server 端口上，且命令前只用幂等、等待就绪的 `start-server`，不做 kill/restart。

**组合兼容矩阵：**

| Android | 无线调试 | 配对 | 本方案 |
| --- | --- | --- | --- |
| 11+（API 30+） | 有 | 6 位配对码，服务类型 `_adb-tls-pairing._tcp` | 可用 |
| 10（API 29） | 无此功能 | — | 配对流程不可用；只能手动连接一个已在监听的 adbd 端口（如 `adb tcpip 5555` 之后，或 ROM 自带「网络 ADB」开关） |

APK 的 `minSdk` 是 29，因此 Android 10 上可以安装，但配对流程不可能工作。**唯一不需要配对码的情形**是**非 TLS** 的 adbd 端口（5555 族）：设备用经典的「允许 USB 调试吗？」RSA 弹窗授权未知密钥，用户在手机上确认即可；**TLS 端口（无线调试）上未知密钥拿不到弹窗，按平台设计必须先配对**。

### 10.3 执行记录

| # | 事项 | 结果 |
| --- | --- | --- |
| 1 | APK 内置 AOSP `adb` 客户端（`libadbbin.so` + 依赖库），`HOME` 与库路径隔离 | 完成 |
| 2 | 配对流程：`Start pairing` → 前台服务 + 通知内 `RemoteInput` 收 6 位码 → `adb pair` → mDNS 自动发现连接端口 → `adb connect` | 完成 |
| 3 | 配对通知与前台服务通知合并为同一条（分组会让 `RemoteInput` 不可达） | 完成 |
| 4 | `Start pairing` 先起前台服务（否则后台冻结会挂住 mDNS 回调及其超时） | 完成 |
| 5 | App 自带 adb server 端口 + 幂等 `start-server`（不做 kill/restart） | 完成 |
| 6 | 配对状态判定改为设备侧证据（`adb pair` 应答 / shell uid 2000 应答） | 完成 |
| 7 | `backend` 只表示路由（`device-bridge` \| `adb-shell`，`shizuku-userservice` 保留为 deprecated 别名），新增 `channel`（`shizuku` \| `adb`）；App 注入 `MIDSCENE_EXEC_CHANNEL` | 完成 |
| 8 | 实机验收：OnePlus 13T / ColorOS 16 上配对 → 就绪 → `aiAct "open the Settings app"` → `status ok` 18.5s + 报告；能力矩阵全绿 | 完成 |

验证：`rstest run` 200 项全通过；`AndroidLocalDevice(...)` 与能力矩阵均带 `channel`；实机端到端见 [deployment.md](./deployment.md) A16-13、A16-14。**未提交。**

### 10.4 未完成项

- **重新配对引导缺失**：设备必须保持已配对，但配对 7 天过期、或无线调试被关闭后，UI 还没有重新配对的引导（A16-12）。
- **Run 按钮只按通道就绪，不校验模型凭据**：缺少或无效的 API Key 要到运行时才暴露。这与 §4.2 是同一类问题——通道维度已解决，凭据维度没有。
- **小米/华为系 ROM 的 `input` 限制未验证，且本次明确不做**：部分 ROM 需用户额外打开「USB 调试（安全设置）」才允许 `adb shell input`；它同等影响任何基于 adb 的方案，与本实现无关，因此不作为缺陷跟踪（§7.3）。
- **设备登记待补**：OnePlus 13T / ColorOS 16 待上述未完成项（重新配对引导、运行前凭据校验）落定后写入受支持设备清单，登记时须注明 **Shizuku 在该机型不可用、工作通道是 adb**（[deployment.md](./deployment.md) A16-2 ~ A16-7）。
