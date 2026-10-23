# Grounding testcase viewer

A read-only viewer for `../testcases`, implemented with TypeScript, React, Rsbuild, and Hono. It reads each case's `index.json` and original image directly, using only the current testcase schema. There are no review, comment, edit, or write APIs, and no UI component library.

Install workspace dependencies from the repository root, then start the Rsbuild development server:

```sh
pnpm install --ignore-scripts
```

```sh
pnpm --dir benchmark/grounding-new/viewer start
```

Open <http://127.0.0.1:4319>. To use another port:

```sh
pnpm --dir benchmark/grounding-new/viewer start --port 4320
```

React components and styles support hot updates. Testcase records are read from disk on every dataset request; refresh the browser page after editing, adding, or removing testcase files. The development server routes dataset requests through Hono on the same port.

React 组件和样式支持热更新。每次题库请求都会重新读取磁盘数据；修改、新增或删除测试用例文件后，刷新浏览器页面即可更新。开发服务器通过同一端口上的 Hono 提供题库接口。

Benchmark browsing and evaluation results have separate pages:

题库浏览与评测结果分为独立页面：

| Route | Page / 页面 |
| --- | --- |
| `/benchmark` | Benchmark browser / 题库查看器 |
| `/benchmark/:name` | One testcase / 单个测试用例 |
| `/runs` | Expandable runs with model summaries / 可展开的运行列表与模型统计 |
| `/runs/:runId/:id` | One model's result detail / 单个模型的逐题结果 |

Browse benchmark cases in lexicographic name order and filter by search text, platform, category, source dataset, or point/refusal outcome. Inspect both instruction languages, original screenshots, pixel TRBL ground truth, classification reasons, and all reference fields. The GT overlay follows the original image dimensions when zooming. `REFUSAL` cases have no box. Previous/next navigation follows the filtered list.

题库按用例名称字典序展示，支持搜索、平台、分类、来源数据集和定位／拒识筛选。详情包含双语指令、原始截图、像素 TRBL 标注、分类依据和来源字段。GT 框随图片缩放，拒识用例没有目标框；上一题／下一题遵循筛选后的列表顺序。

Runs are read recursively from `../evaluation/output/<run-id>/<model-name>/<testcase-name>.json`. The runs page lists runs newest first, with every run expanded by default to show its model cards. Click a run heading to collapse or expand it; automatic updates and manual refresh preserve that state. Each run loads independently and shows its own loading or error state. The former `/runs/:runId` page redirects to `/runs`; result details return to the runs list. Model cards show each model's pass rate and compare geometric and arithmetic means for token consumption and duration. Both means use the same positive `profiling.totalTokens` or `profiling.durationMs` values for each metric. The geometric mean is `exp(sum(log(value)) / count)`; the arithmetic mean is `sum(value) / count`. Both token means are displayed as whole numbers; durations are displayed in seconds with two decimal places. All result outcomes are eligible; zero and missing values are excluded from both means. Each card shows the included record count out of the total, and displays `—` when no positive values are available. Select a model to open its first testcase; the sidebar and previous/next navigation then show only that model's results. Each result reads its testcase, model, instruction, and ground truth from `input`; verdict and prediction from `output`; and duration, token counts, cached input, call count, model time, and per-intent/per-model details from `profiling`. The original JSON remains available. The screenshot compares the saved ground truth (red) with the predicted point and box (blue), in original image coordinates. Runs may contain only part of the benchmark; the benchmark pages always remain independent of evaluation coverage. The result `:id` is the path relative to the run directory without `.json`, URL-encoded as one route segment. For example, `model-a/case-001` appears as `model-a%2Fcase-001` in the result URL.

运行列表递归读取 `../evaluation/output/<run-id>/<model-name>/<testcase-name>.json`。运行列表按时间倒序排列，默认展开所有运行的模型统计卡片。点击运行标题可展开或收拢，自动更新和手动刷新均保留该状态。各运行独立加载并显示加载状态或错误。原 `/runs/:runId` 页面跳转至 `/runs`，结果详情也统一返回运行列表。模型卡片展示已有结果的通过率，并同时展示 Token 消耗和耗时的几何平均、算术平均。每项指标的两种平均使用相同的正数样本，分别来自 `profiling.totalTokens` 和 `profiling.durationMs`。几何平均按 `exp(sum(log(value)) / count)` 计算，算术平均按 `sum(value) / count` 计算。两种 Token 平均值均显示整数，耗时以秒为单位保留两位小数。不按结果类型筛选，零值和缺失值均不参与两种平均的计算；卡片展示参与统计的记录数／总记录数，没有正数时显示 `—`。点击模型卡片进入该模型的第一道题，侧边栏与上一条／下一条只显示该模型的结果。每条结果从 `input` 读取用例、模型、指令和标注，从 `output` 读取判定与预测，从 `profiling` 读取耗时、Token 数、缓存输入、调用次数、模型耗时及按意图／模型统计的明细；原始 JSON 也可查看。截图按原图坐标叠加运行时 GT（红色）与预测点及预测框（蓝色）。运行可以只包含部分题目，题库页面不受评测覆盖范围影响。结果路径中的 `:id` 是相对于运行目录的路径，去掉 `.json` 后缀后整体进行 URL 编码，作为一个路由片段。例如，`model-a/case-001` 在结果 URL 中表示为 `model-a%2Fcase-001`。

Model cards also show geometric and arithmetic means of estimated duration, input cost, output cost, and total cost, calculated per testcase before averaging. Exact model references come from `src/metadata/model-cost.ts`: prices use the OpenRouter page header's IN / OUT PRICE, while throughput and TTFT use the two independent P50 best cards. The performance values may come from different providers; this comparison baseline is not one provider's invoice or service plan. Estimated duration is `calls × TTFT + max(completionTokens − calls, 0) / outputTokensPerSecond` (seconds). Input cost is `promptTokens × inputPerToken`; output cost is `completionTokens × outputPerToken`; total cost adds these two amounts per testcase before averaging. The geometric mean of total cost is not the sum of the two geometric means. Costs use USD with six decimals, without cache discounts, long-context premiums, or provider-specific adjustments. Missing usage, unknown models, and mixed-model records are excluded. Each estimate shows its sample count; all outcomes with valid usage are eligible, including recorded usage from failed attempts. Cards show the reference rates, performance values, and snapshot date. OpenRouter P50 values are traffic observations; completion tokens do not separate reasoning, so estimated duration may overlap reasoning already included in TTFT. These averages of estimates are not measured means or P50 latency.

模型卡片还展示估算耗时、输入费用、输出费用和总费用的几何平均、算术平均，先逐题计算再求平均。按模型名称精确匹配 `src/metadata/model-cost.ts`：价格统一取 OpenRouter 页首 IN / OUT PRICE，吞吐量和 TTFT 分别取两个 P50 best 卡片，两项性能数据可能来自不同供应商，仅作为统一比较基准。估算耗时为 `调用次数 × TTFT + max(输出 Token − 调用次数, 0) / 输出吞吐量`（秒）。输入费用为 `输入 Token × 输入单价`，输出费用为 `输出 Token × 输出单价`，每题先将两部分相加得到总费用再求平均；总费用的几何平均不等于两部分几何平均之和。费用以 USD 保留六位小数，不计缓存折扣、长上下文加价和供应商差异。缺少用量、未知模型或混合模型调用不参与估算。各项估算分别显示有效样本数，所有结果类型的有效用量均参与，包括失败尝试已记录的用量。卡片标明参考单价、性能值和快照日期。OpenRouter P50 是流量观测值，输出 Token 未拆分推理部分，粗估耗时可能与 TTFT 中的推理时间重叠；这些估算值的平均不能视作实测平均或 P50 延时。

The server binds to `127.0.0.1` and serves testcase records and original images without modifying their files.

Type-check and create a production build:

```sh
pnpm --dir benchmark/grounding-new/viewer typecheck
pnpm --dir benchmark/grounding-new/viewer build
```

Serve the built viewer with Hono:

```sh
pnpm --dir benchmark/grounding-new/viewer preview
```

The preview defaults to the same loopback address and port. Use `--port 4320` to run it alongside the development server.
