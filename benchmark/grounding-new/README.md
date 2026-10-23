# Midscene Grounding Benchmark

One pnpm/Nx project, `@midscene/grounding-benchmark`, for the dataset, model evaluation, and result viewer. Dependencies, scripts, TypeScript settings, and tool configurations live here; `evaluation/` and `viewer/` are source directories.

题库、模型评测和结果查看器统一为一个 pnpm/Nx 工程 `@midscene/grounding-benchmark`。依赖、脚本、TypeScript 和工具配置均位于当前目录，`evaluation/` 与 `viewer/` 仅作为代码目录。

```text
grounding-new/
├── package.json
├── tsconfig.json
├── rsbuild.config.ts
├── vitest.config.ts
├── .env.example
├── testcases/
├── evaluation/
│   ├── evaluation.test.ts
│   └── output/<evaluation-id>/<model-name>/<testcase-name>.json
├── viewer/
│   ├── index.html
│   ├── server.ts
│   └── src/
└── dist/
```

A read-only viewer for `testcases/`, implemented with TypeScript, React, Rsbuild, and Hono. It reads each case's `index.json` and original image directly, using only the current testcase schema. There are no review, comment, edit, or write APIs, and no UI component library.

查看器使用 TypeScript、React、Rsbuild 和 Hono，直接读取 `testcases/` 中的当前格式数据及原始图片，仅提供只读浏览与筛选。

The interface uses English throughout. The header has the brand on the first row, Testcases and Evaluations navigation tabs on the second row, and filters below the tabs where available. Original testcase content, including both instruction languages, is displayed unchanged.

界面统一使用英文，顶部依次为品牌标题、Testcases 和 Evaluations 导航栏，以及适用页面的筛选栏；测试用例原始内容（包括双语指令）原样展示。

Install workspace dependencies from the repository root, then build the project and its internal dependencies before the first evaluation:

在仓库根目录安装依赖；首次评测前通过 Nx 构建当前工程及其依赖的内部包：

```sh
pnpm install --ignore-scripts
pnpm exec nx build @midscene/grounding-benchmark
```

To evaluate models, copy `.env.example` to `.env` in this directory and fill in `MIDSCENE_GROUNDING_EVALUATION_CONFIG`. Then run the following command from the repository root. This calls real models and writes results under `evaluation/output/<timestamp>/`; it does not start the viewer.

运行评测前，将当前目录的 `.env.example` 复制为 `.env`，填写 `MIDSCENE_GROUNDING_EVALUATION_CONFIG`，然后在仓库根目录执行以下命令。评测会调用真实模型，结果写入 `evaluation/output/<timestamp>/`，不会启动查看器。

```sh
pnpm --dir benchmark/grounding-new evaluate
```

The configuration is a JSON object with a `models` array. Each model requires `baseUrl`, `apiKey`, `family`, and `name`; `protocol` is optional (`openai-chat` or `openai-responses`). Each model runs every testcase. To select cases, append a Vitest name filter, for example `evaluate -t GUI-MOBILE100-factors-v1-023`.

配置为包含 `models` 数组的 JSON 对象。每个模型需提供 `baseUrl`、`apiKey`、`family` 和 `name`，可选 `protocol`（`openai-chat` 或 `openai-responses`）。每个模型执行全部测试用例；可追加 Vitest 名称筛选，例如 `evaluate -t GUI-MOBILE100-factors-v1-023`。

Start the viewer from the same project:

查看器也从同一个工程启动：

```sh
pnpm --dir benchmark/grounding-new start
```

Open <http://127.0.0.1:4319>. To use another port:

```sh
pnpm --dir benchmark/grounding-new start --port 4320
```

React components and styles support hot updates. Testcase records are read from disk on every dataset request; refresh the browser page after editing, adding, or removing testcase files. The development server routes dataset requests through Hono on the same port.

React 组件和样式支持热更新。每次题库请求都会重新读取磁盘数据；修改、新增或删除测试用例文件后，刷新浏览器页面即可更新。开发服务器通过同一端口上的 Hono 提供题库接口。

Testcase browsing and evaluation results have separate pages:

题库浏览与评测结果分为独立页面：

| Route | Page / 页面 |
| --- | --- |
| `/testcases` | Testcase browser / 题库查看器 |
| `/testcases/:name` | One testcase / 单个测试用例 |
| `/evaluations` | Expandable evaluations with model summaries / 可展开的评测列表与模型统计 |
| `/evaluations/:evaluationId/:id` | One model's result detail / 单个模型的逐题结果 |

Browse benchmark cases in lexicographic name order and filter by search text, platform, category, source dataset, or point/refusal outcome. Inspect both instruction languages, original screenshots, pixel TRBL ground truth, classification reasons, and all reference fields. The GT overlay follows the original image dimensions when zooming. `REFUSAL` cases have no box. Previous/next navigation follows the filtered list.

题库按用例名称字典序展示，支持搜索、平台、分类、来源数据集和定位／拒识筛选。详情包含双语指令、原始截图、像素 TRBL 标注、分类依据和来源字段。GT 框随图片缩放，拒识用例没有目标框；上一题／下一题遵循筛选后的列表顺序。

Evaluations are read recursively from `evaluation/output/<evaluation-id>/<model-name>/<testcase-name>.json`. The evaluations page lists evaluations newest first, with every evaluation expanded by default to show its model cards. Click an evaluation heading to collapse or expand it; automatic updates every five seconds preserve that state. Each evaluation loads independently and shows its own loading or error state. The `/evaluations/:evaluationId` page redirects to `/evaluations`; result details return to the evaluations list. Model cards show each model's pass rate and geometric means for total, input, and output tokens, plus measured duration. The column is labeled Average, with the calculation method explained below the table. These metrics use `profiling.totalTokens`, `profiling.totalPromptTokens`, `profiling.totalCompletionTokens`, and `profiling.durationMs` respectively. Each mean uses its own finite positive samples and is calculated as `exp(sum(log(value)) / count)`. The total-token geometric mean is not the sum of the input and output geometric means. Token means are displayed as whole numbers; durations are displayed in seconds with two decimal places. All result outcomes are eligible; zero and missing values are excluded. Each card shows the included record count out of the total, and displays `—` when no positive values are available. Select a model to open its first testcase; the sidebar and previous/next navigation then show only that model's results. Each result reads its testcase, model, instruction, and ground truth from `input`; verdict and prediction from `output`; and duration, token counts, cached input, call count, model time, and per-intent/per-model details from `profiling`. The original JSON remains available. The screenshot compares the saved ground truth (red) with the predicted point and box (blue), in original image coordinates. Evaluations may contain only part of the benchmark; the benchmark pages always remain independent of evaluation coverage. The result `:id` is the path relative to the evaluation directory without `.json`, URL-encoded as one route segment. For example, `model-a/case-001` appears as `model-a%2Fcase-001` in the result URL.

评测列表递归读取 `evaluation/output/<evaluation-id>/<model-name>/<testcase-name>.json`。评测列表按时间倒序排列，默认展开所有评测的模型统计卡片。点击评测标题可展开或收拢，每五秒自动更新并保留该状态。各评测独立加载并显示加载状态或错误。`/evaluations/:evaluationId` 页面跳转至 `/evaluations`，结果详情也统一返回评测列表。模型卡片展示已有结果的通过率，以及总 Token、输入 Token、输出 Token 和实测耗时的几何平均；表头显示「Average」，表格下方说明具体算法。各项分别取自 `profiling.totalTokens`、`profiling.totalPromptTokens`、`profiling.totalCompletionTokens` 和 `profiling.durationMs`。各项独立取有限正数样本，按 `exp(sum(log(value)) / count)` 计算；总 Token 的几何平均不等于输入与输出 Token 几何平均之和。Token 平均值显示整数，耗时以秒为单位保留两位小数。不按结果类型筛选，零值和缺失值不参与计算；卡片展示参与统计的记录数／总记录数，没有正数时显示 `—`。点击模型卡片进入该模型的第一道题，侧边栏与上一条／下一条只显示该模型的结果。每条结果从 `input` 读取用例、模型、指令和标注，从 `output` 读取判定与预测，从 `profiling` 读取耗时、Token 数、缓存输入、调用次数、模型耗时及按意图／模型统计的明细；原始 JSON 也可查看。截图按原图坐标叠加评测时 GT（红色）与预测点及预测框（蓝色）。评测可以只包含部分题目，题库页面不受评测覆盖范围影响。结果路径中的 `:id` 是相对于评测目录的路径，去掉 `.json` 后缀后整体进行 URL 编码，作为一个路由片段。例如，`model-a/case-001` 在结果 URL 中表示为 `model-a%2Fcase-001`。

Model cards also show geometric means of token-based estimated duration and total cost, calculated per testcase before averaging. Exact model references come from `viewer/src/metadata/model-cost.ts`: prices use the OpenRouter page header's IN / OUT PRICE, while throughput and TTFT use the two independent P50 best cards. The performance values may come from different providers; this comparison baseline is not one provider's invoice or service plan. Estimated duration is `calls × TTFT + max(completionTokens − calls, 0) / outputTokensPerSecond` (seconds). Input cost is `promptTokens × inputPerToken`; output cost is `completionTokens × outputPerToken`; total cost adds these two amounts per testcase before averaging. The geometric mean of total cost is not the sum of the two geometric means. Costs use USD with six decimals, without cache discounts, long-context premiums, or provider-specific adjustments. Missing usage, unknown models, and mixed-model records are excluded. Each estimate shows its sample count; all outcomes with valid usage are eligible, including recorded usage from failed attempts. Cards show the reference rates, performance values, and snapshot date. OpenRouter P50 values are traffic observations; completion tokens do not separate reasoning, so estimated duration may overlap reasoning already included in TTFT. These averages of estimates are not measured means or P50 latency.

模型卡片还展示基于 Token 的估算耗时和总费用的几何平均，先逐题计算再求几何平均。按模型名称精确匹配 `viewer/src/metadata/model-cost.ts`：价格统一取 OpenRouter 页首 IN / OUT PRICE，吞吐量和 TTFT 分别取两个 P50 best 卡片，两项性能数据可能来自不同供应商，仅作为统一比较基准。估算耗时为 `调用次数 × TTFT + max(输出 Token − 调用次数, 0) / 输出吞吐量`（秒）。输入费用为 `输入 Token × 输入单价`，输出费用为 `输出 Token × 输出单价`，每题先将两部分相加得到总费用再求平均；总费用的几何平均不等于两部分几何平均之和。费用以 USD 保留六位小数，不计缓存折扣、长上下文加价和供应商差异。缺少用量、未知模型或混合模型调用不参与估算。各项估算分别显示有效样本数，所有结果类型的有效用量均参与，包括失败尝试已记录的用量。卡片标明参考单价、性能值和快照日期。OpenRouter P50 是流量观测值，输出 Token 未拆分推理部分，粗估耗时可能与 TTFT 中的推理时间重叠；这些估算值的平均不能视作实测平均或 P50 延时。

The server binds to `127.0.0.1` and serves testcase records and original images without modifying their files.

Type-check and create a production build:

```sh
pnpm --dir benchmark/grounding-new exec tsc --noEmit
pnpm --dir benchmark/grounding-new build
```

Serve the built viewer with Hono:

```sh
pnpm --dir benchmark/grounding-new preview
```

The preview defaults to the same loopback address and port. Use `--port 4320` to run it alongside the development server.
