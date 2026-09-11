# Midscene Android 本机化（android-local）

把 Android 自动化从「PC/服务器侧 ADB Host 驱动」演进为「设备本机 Agent」：**Agent 核心不动、设备能力换 Transport**。

| 文档 | 内容 |
| --- | --- |
| [research-v0.1.md](./research-v0.1.md) | 前期调研原文（v0.1，逐字归档，含技术依据 R1–R7） |
| [architecture.md](./architecture.md) | 分层、`AndroidTransport` 契约、错误码、模块边界、与 ADB 路径的收敛策略 |
| [roadmap.md](./roadmap.md) | Phase 0–3 任务表、Gate G0–G3、Phase 0 执行手册、风险表、验收矩阵 |

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
| Phase 0 验证设备 | 本机 Android 12 模拟器（AVD `HaloCanvas_RemoteScreen_API31`，`emulator-5554`），Shizuku 经 adb 启动 | Android 14+ 的 rish/DEX 限制尚未覆盖 |
| 内部文档语言 | 中文 | 非 `apps/site` 用户文档，不触发双语规则 |

## 当前进度

- [x] 勘察本仓库现状并形成证据表（见 `architecture.md` §2）
- [x] 归档调研原文（`research-v0.1.md`，sha256 `0bed707e…`）
- [x] `packages/android-local` 骨架：transport 契约、`RishTransport`、`LocalAndroidDevice`、离线单元测试
- [ ] **P0-1** 依赖/运行时审计（图像链路已完成，其余依赖待补）
- [x] **P0-2** 图片链路：原生 sharp 在 android-arm64 不可用 → 改用 sharp 官方 WASM（`--cpu=wasm32`），`@midscene/shared` 图像函数全绿且**无需改调用点**
- [x] **P0-3** 设备侧 Node 运行时：Termux `nodejs-lts` = Node **v24.18.0**（`process.platform=android`）
- [x] **P0-4** Shizuku + rish 部署：Termux uid(10149) → rish → shell(**2000**) 验证通过
- [x] **P0-5** 设备本机闭环：13 个动作 + 截图 P50 **2155ms**（5/5 成功，合法 PNG）
- [ ] **P0-6** AI 端到端样例（`screenshot → aiTap → aiAssert`）
- [x] **G0** 通过（Core 可在设备 Node 加载 + wasm sharp 覆盖图像链路）；**G1** 设备侧已验证，AI 闭环进行中

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
