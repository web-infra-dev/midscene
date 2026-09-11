# P0-1 依赖与运行时审计（设备实测版）

**审计对象**：`@midscene/core@1.12.6` + `@midscene/shared@1.12.6` + `@midscene/android-local`（分支构建产物）在 **Android 12 / arm64-v8a / Node v24.18.0 (Termux)** 上的运行可行性。

**方法**：不是静态阅读，而是在设备上真实安装并运行：
1. Termux (`nodejs-lts` 24.18.0) 内 `npm install @midscene/core@1.12.6 @midscene/shared@1.12.6`（69 包 / 76MB）；
2. 扫描设备侧 `node_modules` 的原生产物与平台限制；
3. 逐个调用关键 API 并记录结果（见 `roadmap.md` §9.2 的 C1–C4）。

## 1. 设备侧安装清单

| 指标 | 结果 |
| --- | --- |
| 顶层包数量 | 70（含 `@img`、`@midscene`、`@silvia-odwyer`、`@ui-tars`、`@emnapi`、`@types`） |
| 原生 addon（`.node` / `.so`） | **0**（android-arm64 无预编译产物） |
| WASM 载荷 | `@img/sharp-wasm32/lib/sharp-wasm32.node.wasm`、`@silvia-odwyer/photon/photon_rs_bg.wasm` |
| 平台限制包 | `@img/sharp-wasm32`（`cpu: wasm32`） |
| 带 install 脚本的包 | 仅 `sharp`（`--ignore-scripts` 跳过；wasm32 路径无需原生构建） |

## 2. 三分类结论

### ✅ 可用（已在设备上验证）

| 依赖 / 能力 | 证据 |
| --- | --- |
| `@midscene/core`（含 `agent`/`device`/`utils` 入口） | 55 / 29 / 41 / 17 exports 全部 import 成功（C1） |
| 纯 JS 依赖：`zod`、`dayjs`、`js-yaml`、`jsonrepair`、`@ui-tars/action-parser`、`uuid`、`debug`、`js-sha256` | 随 Core 加载即通过；AI 闭环实际用到其中多数 |
| 网络栈：`openai`、`undici`、TLS、JSON | **AI 闭环真实调用模型成功**（`aiAssert`/`aiTap` 返回正确判断，C11） |
| `fs` / `path` / `child_process` / `os` | 文件通道与 rish spawn 全程使用 |
| `sharp` 的 **WASM 实现** | metadata/jpeg/resize/extract/extend 全通过；`@midscene/shared` 四个图像函数全绿（C3） |

### ⚠️ 需回退 / 需替换（有明确替代路径）

| 依赖 / 能力 | 问题 | 替代 |
| --- | --- | --- |
| 原生 `sharp` | android-arm64 无预编译产物，`Could not load the "sharp" module using the android-arm64 runtime`（C2） | `npm install --cpu=wasm32 sharp` → `@img/sharp-wasm32`（8.9MB），API 不变，**调用点零改动** |
| `@silvia-odwyer/photon` | 0.3.3 缺 `main`/`exports`，纯 Node 无法解析；且 `getPhoton()` 在 Node 下被显式拒绝（browser/worker only）（C4） | 不再需要；Node 侧统一走 sharp（WASM） |
| 截图 `stdout`/管道 | rish 把大输出拆到 stdout+stderr 两条管道（C5） | 设备本地文件通道（C6/C14） |

### ⛔ 阻塞（已确认不可用）

| 依赖 / 能力 | 说明 |
| --- | --- |
| 原生 `sharp`（未回退时） | 直接导致 `convertImgBufferToJpeg` 抛错、`cropByRect` / `resizeImgBase64` / `paddingToMatchBlockByBase64` 全失败 |
| photon in Node | 如上；若未来要精简体积，需要改 `getPhoton()` 的 Node 分支并显式引入 `photon_rs.js` 子路径 + WASM 初始化 |
| `/data/local/tmp` 的 app 侧写/删 | SELinux 限制（C14）：app uid 只能读，不能创建/删除 → 通道清理必须由 shell 完成 |

## 3. 与设备无关的包（不在本机路径上）

`packages/android`（ADB 路径）携带的 `appium-adb`、`@yume-chan/*`、`@ffmpeg-installer/ffmpeg` 等**不属于** `android-local` 的依赖图，因此设备侧不需要它们。`android-local` 的依赖被刻意收敛为 `@midscene/core` + `@midscene/shared` + `zod`。

## 4. 部署约束（写进 Phase 2 打包要求）

1. **Node 运行时**：Node 24 可用（Termux `nodejs-lts` = v24.18.0，`process.platform === 'android'`）。
2. **安装方式**：Android/嵌入式镜像必须用 `npm install --cpu=wasm32 sharp`（等价于随包交付 `@img/sharp-wasm32`）；开发机仍用原生 sharp，互不影响。
3. **不得依赖原生 addon**：设备侧 70 个包中 0 个 `.node`；后续引入新依赖时必须保持该性质（否则需要 NDK 交叉编译，见 Phase 2 的 libnode 构建）。
4. **网络**：模型请求在车机网络/证书/代理下的可用性仍需在目标车机上验证（本机模拟器已通过）。

## 5. 待补

- 长稳（连续 100 次截图）与内存占用曲线：Phase 1（P1-5）。
- 车机目标设备上的模型网络策略（代理/证书）、Android 14+ 的 rish DEX 限制。
