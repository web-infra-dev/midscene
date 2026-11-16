# 滚动恢复评测

比较关闭恢复（`0`）与原生测量默认候选（`default`，省略选项）。两组均包含执行反馈修复。显式间隔 `2`、`3` 可用于允许视觉回退的对照。

| 集合 | 用例 | 轨道 | 判定 |
| --- | --- | --- | --- |
| `routine` | 登录、偏好、取消弹窗、搜索、收据、加载更多、可移动与边界精确滚动 | natural | 页面目标正确、无错误选择；精确滚动还检查次数、距离和停止条件 |
| `repository` | 仓库已有窄输入框、禁用与只读表单、原生下拉框、广告打断登录 | natural | 核对字段值与登录状态；禁止的按钮点击判失败 |
| `boundary` | 发票矩阵、物流看板、报销账本、发布轴、日历、权限、规格、媒体条带、仓库、时刻表、配置面板、客户分群 | controlled 或 natural | 点击正确目标，无错误选择 |

共 24 类本地布局（其中横向边界 12 类），不代表独立生产任务。受控轨道通过真实 Agent 管线向两组注入相同的三次向下 200 像素计划，再恢复真实模型规划，验证人为停滞后的恢复能力。普通集与仓库集不允许受控注入。无模型的页面测试单独验证判定脚本。

## 运行

在仓库 `.env` 配置模型与 API Key，加载时会覆盖环境变量。可通过 `PUPPETEER_EXECUTABLE_PATH` 指定 Chrome。受控注入依赖 `openai-chat` 客户端入口，这是评测脚本的限制，不是生产 API 的限制。

先构建，整轮对照期间保持构建不变：

```sh
pnpm exec nx build @midscene/web
pnpm --filter @midscene/core sync-report-template
pnpm exec nx test:evaluation @midscene/web
pnpm exec node --test packages/web-integration/tests/evaluation/scroll-recovery/{boundary-fixtures,routine-fixtures,repository-fixtures}.test.mjs
EVAL_SUITE=routine EVAL_REPETITIONS=5 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_SUITE=repository EVAL_REPETITIONS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_SUITE=boundary EVAL_TRACK=controlled EVAL_REPETITIONS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/summary.mjs <run-directory> [other-run-directory]
```

手动工作流 `scroll-recovery-evaluation.yml` 通过共享 AI CI action 执行并上传所有尝试。普通集与仓库集选 natural，边界确认选 controlled。

## 配置与证据

- `EVAL_SUITE`：默认 `routine`，也可选 `repository`、`boundary`。
- `EVAL_TRACK`：默认 `natural`；`controlled` 仅用于边界集。
- `EVAL_ARMS`：默认 `0,default`；`EVAL_REPETITIONS`：默认 1；`EVAL_WORKERS`：默认 3。组顺序可复现地轮换，并非完全随机。
- `EVAL_CASES`：可选用例 ID，以逗号分隔；`EVAL_PREFIX_SCROLLS`：注入次数，默认 3。
- `EVAL_RUN_ID`：新的输出目录名，拒绝覆盖已有目录；`MIDSCENE_RUN_DIR`：产物根目录。

每次使用新浏览器上下文与 Agent，关闭缓存，预算为 14 个动作、180 秒。成功要求 API 正常结束、页面目标达到、指令约束通过。失败、超时、服务错误均计入分母，不以重试成功替换。

产物位于 `midscene_run/test-results/scroll-recovery-evaluation/`。清单保留 HEAD、已跟踪补丁及哈希、渲染页面哈希、模型、视口和预算。逐次保留页面 HTML、动作截图、完整报告、模型用量和原生检查证据。中断保留记录，统计脚本拒绝不完整轮次与重复 ID。运行前冻结代码和构建；重复布局反映模型波动，不增加独立用例数。

历史观察器、私有截图回放和探索性回归工具保留在提交 `89ec2335f`。已有归档结果仍对应原始版本；当前维护入口为页面判定测试与 Agent 运行器。这些合成数据及固定输出回放均不能证明一个百分点不劣，也不代表原始 Chrome 扩展网站已验收。

扩展受控轮覆盖全部 12 个边界布局，每组各重复 3 次，共 72 次尝试，配置为 `EVAL_ARMS=0,default EVAL_PREFIX_SCROLLS=3`。目标在初始视口左侧和右侧各 6 个。新用例共用测量外壳，内容结构不同，仍属于合成布局。新旧用例分开汇报，不与旧版本轮次合并计数。
