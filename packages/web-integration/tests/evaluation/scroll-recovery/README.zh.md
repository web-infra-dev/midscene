# 滚动恢复评测

> 优化轮更新：当前恢复逻辑已保留历史，不再提供历史改写消融开关。用 `EVAL_ARMS=0,3` 选择关闭恢复与三次阈值；默认仍为 `0,2,3`。旧 `EVAL_FEEDBACK_ONLY` 参数会明确报错。复现旧消融实验请检出 `52932c425`，不要将当前同一策略标为两个实验组。当前私有截图回放比较 off 与 feedback 两组。浏览器执行证据保存在 `scrollEvidence`，运行目录同时保存源码 diff 及其 SHA；构建必须在运行前冻结。
这是可运行的试跑评测，不代表当前解法已经通过验收。英文版本见 [README.md](./README.md)。

已有六个浏览器用例只能证明启用后能完成任务，没有关闭恢复的对照。原始截图已经参与提示词调整，只能作为开发回归，不能当作独立验收集。

## 运行

先构建，再启动评测。生成报告期间不要同时重建共享包。

```bash
pnpm exec nx build @midscene/web
pnpm --filter @midscene/core sync-report-template
pnpm exec nx test:evaluation @midscene/web --output-style=static
EVAL_TRACK=oracle pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_TRACK=natural EVAL_REPETITIONS=1 EVAL_WORKERS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_TRACK=controlled EVAL_REPETITIONS=1 EVAL_WORKERS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/observe.mjs
```

本地运行器会以覆盖方式加载仓库 `.env`，需事先配置模型及认证信息。使用已有 Chrome 时设置 `PUPPETEER_EXECUTABLE_PATH`。CI 通过手动触发的 `scroll-recovery-evaluation.yml` 运行模型评测，统一使用共享 AI CI action。统计单测和无模型的页面判定检查进入普通 CI。

每轮打印独立产物目录。完整任务轮次可这样汇总：

```bash
pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/summary.mjs <自然任务目录> <受控停滞目录>
```

汇总器拒绝未完成的运行清单、重复或不匹配的尝试。超时和服务错误保留在主要成功率的分母里。脚本执行结束不等于解法通过验收。

`EVAL_CASES` 按逗号分隔的场景 ID 筛选，例如 `right-workspace,left-workspace`。`EVAL_RUN_ID` 指定新产物目录，已有目录不会被覆盖。`EVAL_REPETITIONS` 默认一次，用于试跑；修复评测自身的问题后，再用五次或根据试跑波动确定的次数做确认。各组顺序按固定规则轮换，保证可复现；当前并非完全随机调度。

## 对照方式

自然任务比较关闭恢复、每两次检查、每三次检查。初始页面、动作预算和超时一致，每次使用新的页面、浏览器上下文和 Agent，禁用缓存。首次失败不会被重试后的成功替换。

受控停滞只用于适合注入错误动作的八类场景，不用于明确次数、阅读或正常进展任务。测试客户端先返回两次固定的向下滚动计划，由真实 Agent 执行；观察和后续规划仍调用真实模型。两次阈值可以在第三个动作前检查，三次阈值需要再执行一个真实规划动作。因此，受控样本也不保证一定触发恢复，必须同时报告触发覆盖率。

自然任务共 17 类、34 个页面变体，每轮三组共 102 次任务运行。受控停滞覆盖其中 16 个场景，每轮 48 次。最初 28 个场景与后来补充的虚拟列表、加载更多、容器覆盖场景保留独立运行清单。

## 场景

| 场景 | 主要检查点 |
| --- | --- |
| 向右、向左溢出 | 是否纠正错误方向，避免只偏好向右 |
| 向下、向上滚动 | 正常进展是否被干扰 |
| 外层移动、内层目标不动 | 是否混淆目标与祖先容器 |
| 正常移动的嵌套列表 | 是否误判停滞 |
| 相邻容器 | 交替目标是否重置计数 |
| 同容器坐标抖动 | 精确坐标比较是否延后或漏掉检查 |
| 布局位移 | 派发坐标与目标位置是否脱节 |
| 延迟渲染 | 滚动后 700 毫秒内隐藏内容，观察可能不确定 |
| 无关动画 | 目标之外的像素变化是否干扰判断 |
| 没有进一步内容的边界 | 是否编造方向或点击无关控件 |
| 明确滚动次数 | 四次、每次 100 像素，跨过检查阈值仍需遵守指令 |
| 阅读 | 是否读取末尾验证码并提交正确值 |
| 虚拟列表 | 只挂载五行，滚动后延迟 350 毫秒更新 |
| 加载更多 | 每次揭示三条记录，最终读取验证码 |
| 同坐标容器覆盖 | 通知面板覆盖原位置，使相同坐标命中另一个容器 |

坐标注入用例使用 Doubao 的归一化 bbox 编码，对不匹配的模型族直接报错。自然任务不会收到坐标或 DOM 判定数据。

`workspace` 和 `catalog` 使用不同外层布局，但共享卡片构造逻辑。后者只是本轮布局保留集，不是独立来源的网站，也不足以证明泛化能力。一旦用保留集失败来调整解法，应另找新集合做确认。

## 判定与统计

DOM 只作为评测裁判，不向规划器提供答案。每个动作记录目标和外层滚动偏移、截图、内容显示状态、点击结果与时间戳。嵌套场景按目标自身的滚动偏移判定；祖先位移带来的像素移动不等于目标自己滚动。

分别衡量：

1. 观察结果：`moved`、`unchanged`、`uncertain`，误判停滞、漏判停滞及无证据的方向输出。延迟渲染、虚拟列表更新、布局位移和容器覆盖的含糊截图保留结果，不做硬判定，也不评分其方向。
2. 触发情况：检查次数、触发覆盖率及目标变化后的计数。观察器正确但从未被调用，不算恢复成功。
3. 任务结果：`aiAct` 是否正常完成、页面目标是否已达成、指令违背、错误点击、无进展动作、预算耗尽。页面点对但调用超时，仍属于执行失败，同时单独记录页面目标达成。

成本同时包含失败运行：真实请求数、观察调用数、输入／输出／缓存 Token、总 Token、动作数、耗时 p50/p95。模型服务错误单独列出，但不从主要分母中悄悄删除。多组并发运行的耗时不等于单任务生产延迟。

按场景、模型和实验组分别报告。成功率差值采用配对、按场景聚类的 bootstrap 区间；同一布局的重复运行不是独立场景。小规模、共享页面构造的试跑区间只能提示波动，不能代替独立确认。

## 历史处理消融（旧版本）

在 `52932c425` 版本的独立进程设置 `EVAL_FEEDBACK_ONLY=1 EVAL_TRACK=controlled EVAL_CASES=<开发场景>`，运行三次阈值但保留原历史。测试在 SDK 加载前只替换该进程 require cache 内的历史投影函数，不修改生成文件，也不增加产品选项。观察和反馈仍然保留。

该版本计数按异步尝试隔离；首次试跑的计数是进程累计值，需要结合每条 `unchanged` 观察记录辨认实际触发的尝试。没有发生停滞重评估的样本不能说明历史处理是否必要。

## 私有截图回放

`replay.mjs` 读取外部 `EVAL_REPLAY_DIR`，其中包含 `dump.json`、后截图及 `case.json`。配置字段为 `prompt`、`beforeTaskIndex`、`previousPlanIndex`、`afterImage`、`historyLogs`、`allowedDirections`。这些私有文件不提交到仓库。

```bash
EVAL_REPLAY_DIR=/path/to/private/fixture EVAL_REPETITIONS=5 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/replay.mjs
```

当前每轮比较关闭恢复和生产反馈方案；两组均保留完整历史。观察用量在 `observations.jsonl` 中记一次，规划结果及错误写入 `results.jsonl`。这只检验下一步动作，不验证实际 UI 执行、次数触发或原站完整任务。

## 确认轮门槛与产物

以下为预先提出的确认门槛，不代表本轮通过：停滞任务成功率至少提高 10 个百分点且配对区间排除零；正常任务下降不超过 5 个百分点，并由置信区间验证；明确指令违背或不受支持的动作观察数为零，同时报告风险上界；移动场景误判停滞不超过 5%。样本不足应报告“不确定”。两次和三次阈值必须同时比较成本与收益。

产物写入 `MIDSCENE_RUN_DIR/test-results/scroll-recovery-evaluation/`，包含运行清单、源码和页面哈希、逐次 JSONL、前后截图、独立 HTML 报告及错误。保留失败实验。完成无模型页面判定、观察层和任务层试跑后，按波动确定确认轮样本量并冻结提示词，再使用独立保留集验证。


观察层可设置 `EVAL_EXECUTION_EVIDENCE=1`，传入生产浏览器适配器采集的执行证据；默认仍是纯截图输入。两种输入应分开汇总，用 `EVAL_WORKERS=1` 串行运行。任务运行器收到 SIGINT/SIGTERM 后停止排队并取消在途任务，保留中断清单；中断运行不能作为完整效果对照。`attemptsWithServiceErrors` 也统计重试后恢复的服务错误，`serviceFailures` 只统计最终失败。
