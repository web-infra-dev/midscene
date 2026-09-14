# Android 端侧执行产品化：调研结论与 MVP 取舍

- 日期：2026-09-13
- 范围：`packages/android-local` 与 `apps/android-host`
- 状态：本轮调研和讨论形成的目标方案；下文标为“待实现”的能力尚未完成。
- 代码基线：`a674c0d26`。历史验证结果引用仓库记录，本次整理没有重新进行设备实测。
- 文档性质：内部中文决策记录，供后续实现和评审使用；不是当前版本的安装操作手册。

## 1. 产品目标与最终决定

目标是在 Android 设备上完成“截图 → 模型判断 → 执行动作 → 再次截图验证”的自动化闭环，满足最小可用、安装部署方便、逻辑一致，以及权限使用明确、受限、可撤销。

首版只交付一款 Midscene Host APK，内嵌 `android-local` 执行引擎。唯一正式特权通道采用用户明确授权的 Shizuku UserService，限定为 shell UID 2000。用户仍需另行安装并启动官方 Shizuku。

| 项目 | 最终取舍 | 原因 |
| --- | --- | --- |
| `android-host` | 唯一产品入口 | 集中承载授权、配置、运行、停止和结果查看 |
| `android-local` | APK 内嵌的端侧引擎 | 复用 Agent/Device 能力，不再维护另一套用户安装和授权流程 |
| Shizuku UserService | 唯一正式特权执行后端 | 已有端到端验证基础，适合 APK 集成和结构化接口 |
| Termux、rish | 退出首版产品支持范围 | 不随 APK 部署，不作为运行 fallback；无需继续维护独立 Termux 产品形态 |
| ADB | 仅用于研发、安装测试和回归 | 正式任务执行不依赖外部 ADB Host，也不自动切换到 ADB |
| Node、JS bundle、yadb | 固定版本随 APK 交付并自动准备 | 用户不安装 Node、不管理依赖、不手动 push helper |
| Root、Sui、OEM 特权 | 首版不支持 | 不因检测到更高权限环境而自动接入或提升执行身份 |
| 多屏、远程控制、开机无人值守 | 延后 | 首版聚焦单设备、默认屏幕、单任务和用户主动运行 |

此决定收敛的是产品范围。旧实验代码是否删除可在实现时处理，但不得继续成为正式 APK 的依赖、配置选项或备用执行通道。

“端侧闭环”表示执行引擎、设备控制和任务状态在手机上。使用远端模型时，任务所需截图和上下文仍会发送到用户配置的模型服务；首次配置必须说明数据去向。首版不承诺完全离线或本地模型推理。

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
| Android 14 测试环境中，Host 调用 rish 返回 `Aborted` | 不继续维护这条 Host 执行路径 | 已观察失败，但没有足够证据确定底层根因或归因于 Shizuku 主动拒绝 |
| Android 14 Host + UserService + 本地桥完成端到端执行 | 产品收敛具有实现基础 | 记录含 UID 2000、AI 断言、报告生成和正常退出 |
| 大 PNG 通过 AIDL 返回导致连接/服务失败 | 大载荷与控制请求分离 | 当前改为 shell 写共享通道文件、App 读取并通过本地桥返回 |
| 通过 `pm grant API_V23` 未能完成 Shizuku 授权 | 安装脚本不能替代用户授权 | 项目 Android 14 / Shizuku 13.x 验证记录 |

Android 14 对 rish 所加载 DEX 的可写性有约束，官方脚本包含检查和处理逻辑。因此不能把本项目的 `Aborted` 结果写成“Android 14 全面禁止 rish”或“所有 App 都不能使用 rish”。产品选择 UserService 的理由是已验证的 Host 路径和维护成本收敛。[官方 rish 脚本](https://github.com/RikkaApps/Shizuku/blob/master/manager/src/main/assets/rish)

历史数据见 [roadmap.md](./roadmap.md) 的 Phase 0 实测结论，以及 [deployment.md](./deployment.md) 的 A14 系列记录。现有记录主要覆盖特定模拟器配置，发布前仍需完成真实设备验收；`minSdk`、`targetSdk` 和 APK 能安装都不等于功能已验证。

### 2.3 为什么此前共存多套方案

1. 最初用 Termux + rish 快速验证 Node 依赖和 AI 闭环，避免同时承担 APK、AIDL 和运行时移植成本。
2. APK 化后，宿主具有原生 API 和生命周期管理能力，逐步切换到 UserService。
3. 为复用设备命令实现，当前通过替换 `CommandRunner` 接入本地桥，类名和配置仍保留 `RishTransport` / `backend: rish`。
4. ADB 用于开发对照，OEM 特权曾作为车机方向预留。

这些路径解释了研发过程。当前目标已明确为同一个端侧产品，没有必要继续向用户提供相同任务的多种安装和授权方案。

## 3. 目标架构与职责

```text
用户在 Host 中配置模型、选择应用、启动任务
  → Host 创建本次运行的范围和会话
  → 内嵌 Node / android-local 执行 Agent，提交结构化动作
  → 本地桥校验会话并转交 UserService
  → UserService 校验动作、参数和执行范围
  → 使用 shell UID 2000 执行固定设备能力
  → 截图和动作结果返回 Agent，形成闭环
```

| 组件 | 职责 | 不允许接管的内容 |
| --- | --- | --- |
| Host App | 用户交互、官方授权、模型配置、任务范围、运行生命周期 | 不替用户批准系统权限，不自动修改调试/安全设置 |
| `android-local` | Agent、规划、声明式任务、Device 动作 | 不选择特权来源，不修改任务权限或 helper 路径 |
| 本地桥 | Node 与 Android 之间的通信、会话校验、结果传输 | 不提供任意 shell 或任意文件读取接口 |
| UserService | 最终动作校验、固定命令实现、有限资源访问 | 不信任 Node/模型传来的命令字符串或扩大范围请求 |

本地桥可先保留回环 HTTP 和随机 token，无需为首版另造 JNI 或新通信协议。但正式协议必须变为动作接口，不能继续把通用 shell 入口作为正式能力。

底层可以复用 `screencap`、`input`、`am` 等命令；命令由可信服务内部根据校验后的参数构造，优先使用固定可执行文件和参数数组。避免通过“命令前缀白名单 + 任意字符串”实现限制。

yadb 首版继续保留，以覆盖中文输入等现有能力。它属于固定的内部 helper，不是用户可替换的插件；版本、内容校验和部署位置由 App 管理。UserService 不会自动消除 yadb 的 `app_process` 成本，后续再评估直接集成输入能力。

## 4. 安装、部署与使用流程

### 4.1 首次使用

1. 用户安装 Midscene APK 和官方 Shizuku；应用缺失时提供官方获取入口。
2. 用户按 Shizuku 引导启动服务。
3. Midscene 获取 Binder，检查启动身份，并通过官方授权流程请求访问。
4. 用户配置模型服务；界面明确显示截图和上下文的接收方。
5. App 自动解包内置资源、准备 helper 并完成自检；失败显示具体原因和重试入口。
6. 用户选择任务允许操作的应用，点击运行；通知和 App 内提供停止入口。

不再设置单独的手动“安装 runtime”步骤。准备过程应幂等，并在资源缺失或 APK 版本变更时自动执行。用户不需要了解 backend、rish、DEX、Node 安装、yadb 路径或文件通道目录。

### 4.2 授权和运行状态

运行按钮必须由真实状态决定：Shizuku 可连接、身份为 shell UID 2000、用户已授权、UserService 已就绪、内置资源有效、模型配置完整。不能只检查文件存在或“已经走过引导”。

服务断开、授权撤销、用户停止时，立即拒绝新动作并终止或取消可取消的执行，清空待执行队列。已经完成的设备操作无法通过撤销授权自动回滚；中断时结果不明的动作不得自动重放。

Shizuku 恢复后可以重新检查状态和连接，但不自动恢复上一次任务。由用户决定重新运行或继续。

非 Root Shizuku 在设备重启后需要重新启动；Android 11 起可使用无线调试在设备上启动。产品接受这个明确的人工边界，不自动开启无线调试或改变系统安全设置。[官方启动说明](https://shizuku.rikka.app/guide/setup/)

### 4.3 可选权限与开发部署

- Overlay 不作为首版闭环前置条件；需要浮动进度时再由用户主动开启。
- 电池优化豁免不强制申请，不通过 shell 静默加入白名单。
- 通知权限按系统机制请求；不得通过 shell 代授。通知不可见时要如实说明，App 内仍保留停止入口。
- 不保证任务完成后强制把 App 拉回前台，用户通过通知或主动打开 App 查看结果。
- 发布 APK 内置所需产物；开发者准备 Node runtime、构建依赖等成本不能转交给用户。
- `adb-bootstrap.sh` 定位为开发工具。当前 `run-as`、debug 导出服务和固定等待不能作为 release 安装机制；移除错误的静默授权假设，以明确成功状态代替固定 sleep。

## 5. 安全边界：首版必须实现

### 5.1 固定权限来源

只接受通过 Shizuku 提供的 shell UID 2000。绑定前检查服务身份，执行侧校验实际 UID；root UID 0 不作为“更强且兼容”的成功状态。首版不自动启用 Sui、`su`、rish、ADB 或 OEM 后端。

授权必须由用户通过官方界面作出。缺少权限时停止并说明，不通过修改权限数据库、代点授权弹窗、安装额外特权组件或修改系统安全机制补齐。

Shizuku 的 shell 权限本身较宽，且能力受 Android 版本和 SELinux 等约束。固定 UID 只能限定权限来源，不能代替动作限制。[官方权限差异说明](https://github.com/RikkaApps/Shizuku-API/blob/master/README.md)

### 5.2 有限动作接口

正式接口只开放声明的设备动作，例如截图、点击、滑动、文本输入、有限按键、启动范围内应用和必要状态查询。每项校验坐标、长度、时限、目标包名等参数；不支持的能力返回明确错误。

移除正式协议中的任意 `exec(command)` / `exec-binary(command)`。仅关闭模型可见的 shell 动作不足以完成限制，因为同一个 Node 进程仍可直接调用底层桥。

首版只运行随 APK 交付的执行代码。导入任务采用受限的声明式格式，明确拒绝任意 JavaScript、shell、动态模块及指向任意本机文件的脚本引用。任务文件不能覆盖模型地址、权限后端、环境变量或运行范围；这些由 Host 单独管理。

### 5.3 用户任务范围

允许操作的应用和执行会话由用户在 Host 中确定，模型和任务内容只能在该范围内提出动作。跨应用需求必须在运行前纳入用户选择的范围。

系统授权、权限设置、安装器等界面默认排除，出现时暂停并交用户处理。截图和输入前需校验当前界面是否在范围内；对无法可靠判定的系统覆盖窗口或前台变化应停止，不能仅依赖提示词要求模型自律。

应用范围检查并非天然的跨应用沙箱。前台变化、窗口覆盖与动作之间存在竞争条件，需要在支持设备上验证；不能据此宣称能保证任意任务的业务结果安全。

### 5.4 通信、文件与凭据

- 回环地址和 token 用于认证本地请求，不把 token 描述为能隔离同 UID 恶意代码的安全沙箱。
- 会话绑定本次运行，结束后失效；任务不能创建新会话或修改会话范围。
- 截图和结果采用受限资源标识，读取范围限定本次运行的通道文件。不得允许读取整个 App 私有目录或由调用者指定任意路径。
- 大截图不直接通过单次 Binder `byte[]` 返回。初版可保留文件通道，但限制文件生命周期、访问范围、大小和完整性；受保护屏幕不可读时明确报错，不尝试绕过系统保护。
- helper 仅使用 APK 内固定版本，部署时校验内容和文件权限，不接受任务提供的 DEX 或可执行文件。
- 模型 API Key 在 App 私有存储中加密保存，使用 Keystore 保护加密密钥；运行时仅提供模型调用所需凭据，不记录在日志、报告或导出的任务文件中。
- 报告和截图保存在本地，沿用容量上限和清理机制；只有用户主动操作才导出或分享。报告中的网页或脚本不得获得本地执行桥的凭据或原生接口。

Host、随包交付的 Node 代码及 UserService 共同构成可信实现。上述设计用于约束任务和模型输出，并不承诺在 Host 本身或同 UID 代码被攻陷后仍能隔离特权；因此首版不提供第三方可执行插件机制。

## 6. 当前实现与目标的差距

以下项目是后续工作，不能作为当前版本已经具备的保证。

| 当前实现 | 目标变化 | 主要位置 |
| --- | --- | --- |
| Host 检测 bridge 环境后，仍创建 `RishTransport` | 使用明确的 Host 动作适配器；移除隐式后端选择及用户可覆盖字段 | [run.ts](../src/runner/run.ts)、[schema.ts](../src/config/schema.ts) |
| 本地桥接受任意命令并转发至 `sh -c` | 改为结构化动作，UserService 做最终参数和范围校验 | [ExecBridge.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ExecBridge.java)、[ExecUserService.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ExecUserService.java) |
| 能力探测将 UID 0 和 2000 均视为特权成功 | 正式 Host 仅接受 UID 2000，身份不符时拒绝运行 | [rish.ts](../src/transport/rish.ts)、[ShizukuExecBridge.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ShizukuExecBridge.java) |
| helper 准备失败时仍可能回退 rish | 唯一 UserService 路径，失败保持未就绪并显示原因 | [Provisioner.java](../../../apps/android-host/app/src/main/java/com/midscene/android/Provisioner.java) |
| 初始化可能记录 helper 失败后继续运行版本检查 | 准备结果反映所有必需资源状态，失败不得显示为可运行 | [AgentService.java](../../../apps/android-host/app/src/main/java/com/midscene/android/AgentService.java) |
| 引导可跳过，资源准备单独操作，模型另行配置 | 统一就绪检查、自动准备、按状态引导用户 | [ConsoleActivity.kt](../../../apps/android-host/app/src/main/java/com/midscene/android/ConsoleActivity.kt) |
| `/read-file` 允许读取较宽的 App 自有目录 | 限定本次运行资源，禁止任意路径访问 | [ExecBridge.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ExecBridge.java) |
| 凭据为 `model.env`，任务可携带模型/设备配置 | Host 管理加密凭据和可信配置，任务格式限制字段 | [ShellRunner.java](../../../apps/android-host/app/src/main/java/com/midscene/android/ShellRunner.java)、[schema.ts](../src/config/schema.ts) |
| 通用 YAML 引擎支持 JavaScript，shell 动作可配置暴露 | 在 Host 入口校验受限任务格式，正式包不开放通用执行 | [player.ts](../../core/src/yaml/player.ts)、[device.ts](../src/device.ts) |
| bootstrap 部署 rish/dex、尝试静默授权、使用固定等待 | 开发部署流程去除遗留路径；验证实际安装、连接和准备状态 | [adb-bootstrap.sh](../../../apps/android-host/scripts/adb-bootstrap.sh) |

优先实现顺序：确定唯一后端与协议 → 完成动作/任务/文件限制 → 收敛引导与准备流程 → 完成停止和断线处理 → 进行设备验收并更新用户文档。

历史调研保留为证据；后续更新 README 和部署指南中的现状描述，移除“Host 必须使用 rish”“可以完全静默授权”等过时说明。不要把历史实验说明继续当成产品安装要求。

## 7. MVP 验收标准

以下均为待执行的发布验收，不代表本次文档整理已通过这些测试。

| 类别 | 最小验收 |
| --- | --- |
| 全新安装 | 支持清单中的真实设备安装两个 App，经官方启动和授权流程后可运行；无需 Termux、手动 push 文件或 PC 常驻 |
| 资源准备 | 首次运行及 APK 升级自动准备；缺失、损坏、存储不足均明确失败，无需用户修改路径 |
| 闭环能力 | 默认屏幕截图、点击、滑动、返回、中文输入、启动范围内应用、AI 断言和报告生成通过 |
| 身份和授权 | 未授权、拒绝授权、UID 0、服务不可用均拒绝运行；不发生权限后端切换 |
| 协议限制 | 即使持有合法运行 token，任意 shell、未知动作、非法参数、越界应用和越界文件请求也被执行侧拒绝 |
| 任务限制 | 含 JavaScript、shell、动态代码、任意脚本路径或可信配置覆盖的任务在执行前被拒绝 |
| 系统界面 | 授权弹窗、权限设置、安装器及无法确认的窗口状态触发暂停；应用范围检测不依赖模型自律 |
| 生命周期 | 停止、授权撤销或断线后不再接受新动作，待执行队列清空；恢复连接不自动重放不确定操作 |
| 数据与凭据 | 日志、报告、导出文件不含 API Key 或桥凭据；文件接口不能读取配置；模型数据去向对用户可见 |
| 可选权限 | 不授予 Overlay 或电池豁免也能完成基本闭环；通知受限状态和停止入口有明确说明 |

适配范围以实际通过验收的 Android 版本、ROM 和 ABI 清单为准。现有 arm64 和 Android 12/14 实验记录可以作为起点，但不能直接承诺所有 Android 设备兼容。

完成上述 MVP 后，再评估截图 FD/LocalSocket 优化、把输入能力直接并入 UserService、移除 yadb、扩展设备矩阵及长时间运行能力。

## 8. 参考资料

- [原始调研与分阶段设计](./research-v0.1.md)：解释 rish POC、UserService 和 OEM 方向的历史选择。
- [Phase 0 验证与路线图](./roadmap.md)：Termux、环境变量、输出通道和性能记录。
- [部署与 Android 14 验证记录](./deployment.md)：A14-4、A14-5、A14-8、A14-14 至 A14-17 等。
- [Host 当前说明](../../../apps/android-host/README.md)：构建、部署和 UI；部分 rish 描述仍待同步。
- [Shizuku API 官方文档](https://github.com/RikkaApps/Shizuku-API/blob/master/README.md)：授权、shell/root 身份、UserService 能力与限制。
- [Shizuku 官方 rish 脚本](https://github.com/RikkaApps/Shizuku/blob/master/manager/src/main/assets/rish)：DEX 加载、Android 14 文件权限处理和调用应用标识。
- [Shizuku 官方使用手册](https://shizuku.rikka.app/guide/setup/)：用户启动流程与系统限制。

外部资料已在本轮调研中查阅；官方 master 文档会变化，实现和发布时应按选定依赖版本再次核对。
