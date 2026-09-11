# Midscene Android 本机化（android-local）

把 Android 自动化从「PC/服务器侧 ADB Host 驱动」演进为「设备本机 Agent」：**Agent 核心不动、设备能力换 Transport**。

| 文档 | 内容 |
| --- | --- |
| [research-v0.1.md](./research-v0.1.md) | 前期调研原文（v0.1，逐字归档，含技术依据 R1–R7） |
| [architecture.md](./architecture.md) | 分层、`AndroidTransport` 契约、错误码、模块边界、与 ADB 路径的收敛策略 |
| [roadmap.md](./roadmap.md) | Phase 0–3 任务表、Gate G0–G3、Phase 0 执行手册与**实测结论**、风险表、验收矩阵 |
| [dependency-audit.md](./dependency-audit.md) | P0-1 依赖/运行时审计（设备实测版）：可用 / 需回退 / 阻塞 三分类 + 部署约束 |
| [baseline.md](./baseline.md) | P1-5 性能基线：rish vs adb 两后端对比、AI 闭环耗时分解、优化线索 |

## 目标

- 在 Android 本机运行 Midscene 的 Agent/规划/YAML 执行核心。
- 提供截图、点击、滑动、按键、输入、应用启动/停止、显示信息读取等最小设备能力。
- 移除「必须存在外部 ADB Host」的依赖，同时保留 ADB Transport 作为调试与兼容路径。
- 建立权限无关的 Transport 抽象（rish / Shizuku UserService / OEM Privileged / ADB）。

## 非目标（当前阶段）

- 不迁移多节点 Worker、任务调度与远程节点管理。
- 不在 POC 阶段依赖隐藏 API 或 OEM 私有 Binder。
- 不重写 Midscene Core 为 Kotlin/Java。

## 已确认决策

| 项 | 决定 | 说明 |
| --- | --- | --- |
| 开发分支 | `feat/android-local-agent`（从 `main` 新建，本地开发） | `main` 与 `origin/upstream` 的 `main` 一致 |
| 新包位置 | `packages/android-local`（`@midscene/android-local`） | 沿用调研文档 §8 的模块划分 |
| 包发布状态 | `private: true`（孵化期不发 npm） | Phase 1 出口再评估是否作为独立包发布 |
| 依赖边界 | 只依赖 `@midscene/core`、`@midscene/shared`、`zod` | 不继承 `packages/android` 的 `appium-adb` / `@yume-chan/*` / `sharp` |
| 与 ADB 路径的关系 | 单向：`packages/android` 可消费 `android-local` 的纯逻辑 | 禁止反向依赖，最小化上游 rebase 面 |
| **平台优先级** | **普通安卓手机优先**（理想假设：标准 AOSP/主流 ROM、网络可用、可装 Shizuku/Termux）；车机/OEM 特权通道降级为 Phase 3 可选项 | 2026-09 调整：先证明手机平台可用，再评估车机约束 |
| Phase 0 验证设备 | 本机 Android 12 模拟器（AVD `HaloCanvas_RemoteScreen_API31`，`emulator-5554`），Shizuku 经 adb 启动 | Android 14+ 的 rish/DEX 限制、真机竖屏旋转待补 |
| 内部文档语言 | 中文 | 非 `apps/site` 用户文档，不触发双语规则 |

## 当前进度

- [x] 勘察本仓库现状并形成证据表（见 `architecture.md` §2）
- [x] 归档调研原文（`research-v0.1.md`，sha256 `0bed707e…`）
- [x] `packages/android-local` 骨架：transport 契约、`RishTransport`、`LocalAndroidDevice`、离线单元测试
- [x] **P0-1** 依赖/运行时审计（设备实测版）：`dependency-audit.md`，设备侧 70 包 0 原生 addon
- [x] **P0-2** 图片链路：原生 sharp 在 android-arm64 不可用 → 改用 sharp 官方 WASM（`--cpu=wasm32`），`@midscene/shared` 图像函数全绿且**无需改调用点**
- [x] **P0-3** 设备侧 Node 运行时：Termux `nodejs-lts` = Node **v24.18.0**（`process.platform=android`）
- [x] **P0-4** Shizuku + rish 部署：Termux uid(10149) → rish → shell(**2000**) 验证通过
- [x] **P0-5** 设备本机闭环：13 个动作 + 截图 P50 **2155ms**（5/5 成功，合法 PNG）
- [x] **P0-6** AI 端到端闭环（`startActivity → aiAssert → aiTap → aiAssert`，复现 2 次）
- [x] **G0** 通过（Core 可在设备 Node 加载 + wasm sharp 覆盖图像链路）；**G1** 通过（设备本机 AI 闭环复现 2 次）

### Phase 1（手机优先）

- [x] **P1-1** 传输契约测试：`tests/unit-test/transport-contract.ts` 一套契约跑所有后端
- [x] **P1-3** `AdbShellTransport`：host/USB 后端（`exec-out` 直读截图、无临时文件），真机实测通过
- [x] **P1-2（部分）** `Launch` / `Terminate` 动作 + `appNameMapping`（手机 YAML 平价），能力驱动裁剪
- [x] **P1-5** 性能基线：[`baseline.md`](./baseline.md)
- [ ] **P1-2（余）** 竖屏/旋转语义与截图坐标一致性验证（需要竖屏设备或手机 AVD）
- [ ] **P1-4** 同一 YAML 任务双后端对照（adb vs rish）
- [ ] **P1-6** CI 接入：`android-emulator.yml` 增加 android-local 单测 + adb 后端冒烟
- [ ] **P1-7** 收敛：`packages/android` 消费 android-local 的纯逻辑（含 app 名映射表迁移）
- [ ] **手机专项**：中文/Unicode 输入（IME 通道）、后台存活（电池优化）、真机矩阵验证

## 使用（骨架阶段）

```bash
# 构建 / 单元测试（不需要真机）
npx nx build @midscene/android-local
npx nx test @midscene/android-local
```

```ts
import { RishTransport, LocalAndroidDevice } from '@midscene/android-local';

const transport = new RishTransport({ rishPath: process.env.MIDSCENE_RISH_PATH });

// create() 会先探测能力；未 connect 的设备调用 actionSpace() 会直接报错，
// 避免注册底层并不支持的动作。
const device = await LocalAndroidDevice.create(transport, { displayId: 0 });
const png = await transport.screenshot(); // Buffer（经设备本地瞬时文件通道）
```

> 实测要点（Phase 0）：截图**不能**走 rish 管道——674KB 的 PNG 会被拆到 stdout 与 stderr 两条管道而截断；transport 因此让 shell 把文件写到设备上、由本机 Node 直接读取后立即删除。这也是本机化相对 ADB 的独有优势。详见 `roadmap.md` §9.2。

> 硬规则：只有 `src/transport/**` 允许知道 shell 命令、Binder、AIDL 或权限实现细节；`LocalAndroidDevice` 只调用 transport；业务层禁止拼接 `adb`/`rish` 命令。详见 `architecture.md` §4。
