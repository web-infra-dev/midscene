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
│   └── output/<evaluation-id>/<display-name-or-model-name>/<testcase-name>.json
├── viewer/
│   ├── index.html
│   ├── server.ts
│   └── src/
└── dist/
```

A read-only viewer for `testcases/`, implemented with TypeScript, React, Rsbuild, Hono, and Recharts. It reads each case's `index.json` and original image directly, using only the current testcase schema. There are no review, comment, edit, or write APIs, and no UI component library.

查看器使用 TypeScript、React、Rsbuild、Hono 和 Recharts，直接读取 `testcases/` 中的当前格式数据及原始图片，仅提供只读浏览与筛选。

The interface uses English throughout. The header has the brand on the first row, Testcases and Evaluations navigation tabs on the second row, and filters below the tabs where available. Original testcase content, including both instruction languages, is displayed unchanged.

界面统一使用英文，顶部依次为品牌标题、Testcases 和 Evaluations 导航栏，以及适用页面的筛选栏；测试用例原始内容（包括双语指令）原样展示。

Install workspace dependencies from the repository root, then build the project and its internal dependencies before the first evaluation:

在仓库根目录安装依赖；首次评测前通过 Nx 构建当前工程及其依赖的内部包：

```sh
pnpm install --ignore-scripts
pnpm exec nx build @midscene/grounding-benchmark
```

Model connections and report metadata share `MIDSCENE_GROUNDING_EVALUATION_CONFIG` in `.env`. Each `models` entry uses `family` for the Midscene adapter and `displayFamily` for an exact key in `families`. A family defines its display name (the key), `color`, and optional `logo` URL; `families.Other` is required and supplies the fallback. Each model may include `reference` with `source`, `url`, `observedAt`, optional `note`, `pricing`, and optional `performance`. Prices are per input/output token in USD or CNY; CNY requires `usdExchangeRate` with `cnyPerUsd` and its source details. Performance uses `timeToFirstTokenMs` and `outputTokensPerSecond` with basis `best-per-metric`, `mixed-source`, or `window-mean`; decision models may instead use `best-response-latency` with `responseLatencyMs` and percentile `p50`. Omit unverified reference data. See `.env.example` for the complete structure; its reference numbers are illustrative.

模型连接与报告元数据统一放在 `.env` 的 `MIDSCENE_GROUNDING_EVALUATION_CONFIG` 中。`models` 每项的 `family` 用于选择 Midscene 适配器，`displayFamily` 精确对应 `families` 中的键。家族的键即展示名称，配置 `color` 和可选的 `logo` URL，`families.Other` 为必填项，提供默认展示。模型可配置 `reference`，包含 `source`、`url`、`observedAt`、可选的 `note`、`pricing` 和可选的 `performance`。价格按输入／输出单 Token 记录，币种为 USD 或 CNY；CNY 需提供含 `cnyPerUsd` 和来源信息的 `usdExchangeRate`。性能通过 `timeToFirstTokenMs` 和 `outputTokensPerSecond` 配置，`basis` 为 `best-per-metric`、`mixed-source` 或 `window-mean`；决策类模型也可使用 `best-response-latency`，配置 `responseLatencyMs` 和 `percentile: "p50"`。未确认的数据留空。完整结构见 `.env.example`，其中参考数值仅供演示。

The viewer reads the same configuration through `/api/config`. The endpoint returns only model names, report-family links, references, and family presentation fields; API keys, Base URLs, adapter families, and protocol settings are excluded. Refresh the browser after changing `.env` to load its current metadata. An explicitly supplied process environment variable takes precedence over `.env`. The viewer has no built-in model list, name-prefix inference, brand icons, color palette, or pricing/performance snapshots; developers add their own models and families entirely through configuration.

Viewer 通过 `/api/config` 读取同一配置。接口仅返回模型名称、报告家族关系、参考数据及家族展示字段，不返回 API Key、Base URL、适配器 family 或协议等连接配置。修改 `.env` 后刷新页面即可加载当前元数据；显式提供的进程环境变量优先于 `.env`。Viewer 内不再维护模型列表、名称前缀推断、品牌图标、色板或价格／性能快照，开发者通过配置即可接入自己的模型与家族。

To evaluate models, copy `.env.example` to `.env` in this directory and fill in `MIDSCENE_GROUNDING_EVALUATION_CONFIG`. Then run the following command from the repository root. This calls real models and writes results under `evaluation/output/<timestamp>/`; it does not start the viewer.

运行评测前，将当前目录的 `.env.example` 复制为 `.env`，填写 `MIDSCENE_GROUNDING_EVALUATION_CONFIG`，然后在仓库根目录执行以下命令。评测会调用真实模型，结果写入 `evaluation/output/<timestamp>/`，不会启动查看器。

```sh
pnpm --dir benchmark/grounding-new evaluate
```

The configuration is a JSON object with a `models` array. Each model requires `baseUrl`, `apiKey`, `family`, `name`, and `displayFamily`; `protocol` is optional (`openai-chat` or `openai-responses`). The optional boolean `reasoningEnabled` maps to Midscene's reasoning switch; omit it to keep the model adapter's default. Set it to `true` for deployments that require thinking. Optional `displayName` sets the result directory name, viewer label, and pricing/performance reference key, defaulting to `name`. `name` remains the API model ID and is recorded as `input.model`; a configured alias is recorded as `input.displayName`. Usage in `profiling.byModel` retains the API model ID. Folder names replace characters outside `a-zA-Z0-9._-` (and all-dot names) with `_`; the resulting names must be unique. Each model runs every testcase. To select cases, append a Vitest name filter, for example `evaluate -t MOBILE-v1-001`.

配置为包含 `models` 数组的 JSON 对象。每个模型需提供 `baseUrl`、`apiKey`、`family`、`name` 和 `displayFamily`，可选 `protocol`（`openai-chat` 或 `openai-responses`）。可选布尔字段 `reasoningEnabled` 对应 Midscene 的推理开关，省略时沿用模型适配器默认值；要求启用思考的部署需设为 `true`。可选的 `displayName` 指定结果目录名、界面展示名和价格／性能参考的匹配键，省略时使用 `name`。`name` 始终作为 API 模型 ID，并记录在 `input.model`；配置的别名记录在 `input.displayName`。`profiling.byModel` 用量仍保留 API 模型 ID。目录名中 `a-zA-Z0-9._-` 以外的字符（以及全点号名称）替换为 `_`，转换后的目录名必须唯一。每个模型执行全部测试用例；可追加 Vitest 名称筛选，例如 `evaluate -t MOBILE-v1-001`。

Each result records `consistency.testcaseSha256`, the SHA-256 of the UTF-8 bytes of `JSON.stringify(testcase)` as loaded for the run. The testcase includes the declared image SHA-256; verifying the image file itself also requires checking its bytes against that declared hash.

每条结果的 `consistency.testcaseSha256` 是运行时加载的 testcase 经 `JSON.stringify(testcase)` 序列化后的 UTF-8 字节的 SHA-256。testcase 包含声明的图片 SHA-256；验证图片文件本身还需要将其实际字节与该声明值比对。

For `family: "jev"`, use a System One-compatible Base URL (the SDK appends `/systemone`) and omit `protocol`. Screenshots sent to Jev are resized to a maximum edge of 1568 pixels; predictions are mapped back to the original screenshot coordinates, leaving testcase images and ground truth unchanged.

使用 `family: "jev"` 时，填写兼容 System One 的 Base URL（SDK 会追加 `/systemone`），并省略 `protocol`。发送给 Jev 的截图最长边缩放至不超过 1568 像素，预测坐标映射回原图，不修改测试用例图片和 ground truth。

Start the viewer from the same project:

查看器也从同一个工程启动：

```sh
pnpm --dir benchmark/grounding-new start
```

On the host machine, open <http://127.0.0.1:4319> or <http://localhost:4319>. From another machine on a network that can reach the host, open `http://<host-ip>:4319/evaluations`, replacing `<host-ip>` with the host's intranet IPv4 address.

本机可访问 <http://127.0.0.1:4319> 或 <http://localhost:4319>。其他能访问该主机的内网设备可打开 `http://<host-ip>:4319/evaluations`，将 `<host-ip>` 替换为运行服务的主机内网 IPv4 地址。

To use another port / 使用其他端口：

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
| `/evaluations` | Evaluation list / 评测列表 |
| `/evaluations/:evaluationId` | One evaluation's charts and model summaries / 单次评测的图表与模型统计 |
| `/evaluations/:evaluationId/:id` | One model's result detail / 单个模型的逐题结果 |

Browse benchmark cases in lexicographic name order and filter by search text, platform, category, source dataset, or point/refusal outcome. Inspect both instruction languages, original screenshots, pixel TRBL ground truth, classification reasons, and all reference fields. The GT overlay follows the original image dimensions when zooming. `REFUSAL` cases have no box. Previous/next navigation follows the filtered list.

题库按用例名称字典序展示，支持搜索、平台、分类、来源数据集和定位／拒识筛选。详情包含双语指令、原始截图、像素 TRBL 标注、分类依据和来源字段。GT 框随图片缩放，拒识用例没有目标框；上一题／下一题遵循筛选后的列表顺序。

The evaluation list shows IDs and dates, newest first, without loading result files for every evaluation. Select an evaluation to open its own page with Model Performance Overview, the Model Performance Breakdown table, and the Testcase Score Overview in that order. That page reads only the selected evaluation's results recursively from `evaluation/output/<evaluation-id>/<display-name-or-model-name>/<testcase-name>.json`. Refresh the browser page to load updated evaluations and results. The breakdown table has one row per model, initially in descending lexicographic order by `displayName`, falling back to the model name. The Model and seven metric headers are sortable: click to sort, then click again to reverse the order. Reference is not sortable. Score initially sorts descending; newly selected other columns sort ascending. Metrics use their unrounded values, missing values stay last in either direction, and ties use descending model name order. Table sorting does not change the chart or testcase matrix order. Model Performance Breakdown and Testcase Score Overview share the same panel and heading styles. Each of the three sections has a maximum overall height equal to the viewport height minus the fixed page header height and 30 px of space at both the top and bottom. The page has 28 px of space on each side, and content scrolls inside each section. Table column headers stay fixed while scrolling; narrower screens also support horizontal scrolling.

评测列表按时间倒序展示编号和日期，不加载每次评测的结果文件。点击评测后进入独立页面，依次展示 Model Performance Overview、Model Performance Breakdown 表格和 Testcase Score Overview，仅从 `evaluation/output/<evaluation-id>/<display-name-or-model-name>/<testcase-name>.json` 递归读取所选评测的结果。刷新浏览器页面即可加载最新评测及结果。Breakdown 表格每个模型一行，默认按 `displayName`（缺省时使用模型名称）字典序倒序排列。Model 和七项指标列均可点击表头排序，再次点击同一表头切换升降序；Reference 列不排序。新选得分列时默认降序，其他列默认升序。指标按未四舍五入的值排序；空值在两种方向下均置于末尾，同值按模型名称字典序倒序排列。表格排序不改变图表和逐题矩阵的顺序。Model Performance Breakdown 和 Testcase Score Overview 使用一致的面板及标题样式，三个板块各自的整体最大高度均为视口高度减去固定页头高度，再减去上、下各 30 px 的留白。页面左右各留 28 px，内容在板块内部滚动。表格列标题在滚动时保持固定；窄屏同时支持横向滚动。

Model Performance Breakdown shows Score (`correct results / recorded results × 100`, from 0 to 100 with no percent sign), Total Tokens, Input Tokens, Output Tokens, Estimated Cost, Estimated Model Duration, and Measured Duration, in that column order. Token, cost, and measured-duration metrics use arithmetic averages (`sum / count`); Estimated Model Duration uses the corrected aggregate formula below. Score uses `output.correct === true` as the correct-result count; errors are incorrect and missing results are excluded from the denominator. Report data carries `score` directly on the 0–100 scale. All columns are centered. Each average metric header, including Measured Duration, places `Avg.` on its own second line. The circled question-mark icons after `Avg.` in the Estimated Cost and Estimated Model Duration headers show their calculation formulas on hover or keyboard focus. The Measured Duration header has the same help icon explaining its timing boundaries: actual elapsed time starts when the test callback begins, before image loading and preparation, and ends after success, refusal, or error handling and agent cleanup, before result construction, file writing, or assertion. It includes image preparation, model calls, network and provider delays, retries, and local processing and cleanup. Estimated Model Duration combines a token/reference-based average with the measured-duration average after a fixed 150 ms network allowance, as defined below, to approximate model latency from request input to response output. Data cells have no tooltips. Token and measured-duration metrics come from `profiling.totalTokens`, `profiling.totalPromptTokens`, `profiling.totalCompletionTokens`, and `profiling.durationMs`. Each metric independently includes finite values greater than or equal to zero from all outcomes, including failed results, and excludes missing, negative, or non-finite values. Each metric's table cell shows its valid sample count when it differs from the total result count, and displays `—` when no valid samples are available. Token averages are rounded to whole numbers, durations to two decimal places in seconds, and costs to six decimal places in USD. Each row's Reference cell expands to show the source, observation date, performance and pricing data, and source links.

Model Performance Breakdown 按列依次展示得分（Score，`正确结果数 / 已有结果数 × 100`，范围为 0–100，不显示百分号）、总 Token（Total Tokens）、输入 Token（Input Tokens）、输出 Token（Output Tokens）、估算费用（Estimated Cost）、模型估算耗时（Estimated Model Duration）和实测耗时（Measured Duration）。Token、费用和实测耗时使用算术平均值（`总和 / 样本数`）；Estimated Model Duration 使用下文的聚合修正公式。Score 以 `output.correct === true` 统计正确结果，错误计为不正确，缺失结果不进入分母；报告数据中的 `score` 直接使用 0–100 数值。所有列居中；各平均指标表头（包括 Measured Duration）均在独立的第二行标注 `Avg.`。Estimated Cost 和 Estimated Model Duration 表头中 `Avg.` 后的圆圈问号图标在悬浮或键盘聚焦时展示对应计算公式。Measured Duration 表头使用相同的帮助图标说明计时边界：从测试回调开始、尚未读取和准备图片时计时，到定位成功、拒识或错误处理及 Agent 清理结束后截止，不包含结果对象构造、文件写入和断言。实测耗时包含图片准备、模型调用、网络和供应商延迟、重试、本地处理及清理。Estimated Model Duration 按下文公式，将基于 Token／参考性能的平均值与扣除固定 150ms 网络时延后的实测平均值取较小值，近似衡量模型从请求输入到响应输出的耗时。数据单元格不提供悬浮提示。Token 和实测耗时分别取自 `profiling.totalTokens`、`profiling.totalPromptTokens`、`profiling.totalCompletionTokens` 和 `profiling.durationMs`。各项指标独立纳入所有结果类型（包括失败结果）中大于等于零的有限数值，排除缺失、负数和非有限值。有效样本数与总结果数不同时，对应单元格显示该项的样本数；没有有效样本时显示 `—`。Token 平均值取整数，耗时以秒保留两位小数，费用以 USD 保留六位小数。每行的 Reference 单元格可展开查看来源、观测日期、性能与价格数据及来源链接。

Select View details in a model's row to browse that model's results; the evaluation link returns to that evaluation's page. Each result reads testcase data from `input`, verdict and prediction from `output`, and timing and usage from `profiling`; the original JSON remains available. Screenshots compare saved ground truth (red) with predicted points and boxes (blue) in original image coordinates. Evaluations may cover only part of the benchmark without affecting testcase browsing. The result `:id` is its path relative to the evaluation directory, without `.json`, URL-encoded as one route segment; `model-a/case-001` becomes `model-a%2Fcase-001`.

点击模型所在行的 View details 可浏览该模型的逐题结果，点击评测链接可返回所属评测页面。详情从 `input` 读取用例数据，从 `output` 读取判定与预测，从 `profiling` 读取耗时和用量，并提供原始 JSON。截图按原图坐标比较保存的 GT（红色）与预测点及框（蓝色）。评测可仅覆盖部分题目，不影响题库浏览。结果路径中的 `:id` 是相对于评测目录的路径，去掉 `.json` 后整体编码为一个路由片段；例如 `model-a/case-001` 编码为 `model-a%2Fcase-001`。

Below Model Performance Breakdown, the Testcase Score Overview matrix compares every model for each testcase in the dataset or evaluation. Rows follow testcase name order; model columns use descending `displayName`/name order. Green means passed, red means failed (including errors), and gray means missing. Filters show all cases, cases passed or failed by every model, or cases with missing results; missing results never count as failures for these filters. Select a cell to open its saved result, or a testcase name to browse the testcase.

Model Performance Breakdown 下方的 Testcase Score Overview 矩阵逐题比较各模型，覆盖当前题库与本次评测记录中的所有用例。行按用例名称字典序排列，模型列按 `displayName`／名称字典序倒序排列。绿色表示通过，红色表示不通过（包括执行错误），灰色表示缺失。可筛选全部用例、所有模型均通过、所有模型均失败或存在缺失结果的用例；缺失结果不会在这些筛选中计为失败。点击单元格查看保存的评测结果，点击用例名称浏览测试用例。

The heading shows Score Std. Dev., the population standard deviation of the models' overall scores: `sqrt(sum((score − meanScore)^2) / modelCount)`, displayed to two decimal places in score points. Each model has equal weight and uses the same 0–100 score as Model Performance Breakdown: correct results divided by all recorded results, multiplied by 100. Errors count as incorrect; missing results are excluded. A single model has a standard deviation of zero. This statistic uses all models and results in the evaluation and is unaffected by chart or matrix filters.

标题旁的 Score Std. Dev. 展示各模型整体得分的总体标准差：`sqrt(sum((得分 − 平均得分)^2) / 模型数)`，单位为分（score points），保留两位小数。每个模型等权，使用与 Model Performance Breakdown 一致的 0–100 得分：正确结果数除以已有结果数，再乘以 100。错误计为不正确，缺失结果不进入分母。只有一个模型时标准差为零。统计包含本次评测的所有模型及结果，不受图表或矩阵筛选影响。

Prefer OpenRouter for both pricing and performance. Use official sources only for metrics unavailable on OpenRouter, and record their sources and measurement conditions explicitly. Do not substitute a different model to fill a gap. Doubao Seed Evolving and the exact Ark release IDs of Seed 2.1 use Ark pricing and available leaderboard data. A model with pricing alone can show estimated cost, but its estimated elapsed time remains unavailable until performance data for that version is verified.

价格和性能均优先使用 OpenRouter；仅在 OpenRouter 缺少对应指标时使用官方数据，并明确记录来源和测量条件，不使用其他模型的数据代替。豆包 Seed Evolving 及 Seed 2.1 的方舟具体版本使用方舟价格和可获得的官方性能榜单数据。仅有价格参考的模型可以展示估算费用，确认对应版本的性能数据前不估算耗时。

Base estimates are calculated per testcase, using `input.displayName ?? input.model` to match `models[].displayName ?? models[].name` and read that model’s configured `reference`:

- Base duration (ms): `calls × TTFT_ms + max(completionTokens − calls, 0) × 1000 / outputTokensPerSecond`.
- Jev base duration (ms): `calls × responseLatencyMs`, using its P50 complete-response latency instead of token-generation throughput.
- Cost: `promptTokens × inputPerToken + completionTokens × outputPerToken`. CNY amounts are divided by the recorded `cnyPerUsd` exchange rate to obtain USD.

For each model, independently take the arithmetic means of valid base-duration samples and valid `profiling.durationMs` samples, then compute `estimatedModelDurationAvgMs = min(baseDurationAvgMs, max(measuredDurationAvgMs − 150, 0))`. The 150 ms allowance represents average network overhead per testcase; it is deducted once after averaging, not once per model call. This is not the average of per-testcase minima. A missing base estimate leaves model duration unavailable; a missing measured average leaves the base average unchanged. The displayed estimate sample count remains the base estimate's valid-sample count, while Measured Duration retains its own count. The table, scatter plot, duration P50, Speed, and speed-based model comparisons all use the same corrected value. Speed is unavailable when the corrected duration is zero. This metric approximates model input-to-output latency: measured duration also contains local execution overhead, so subtracting a fixed network allowance does not isolate pure inference time.

基础估算按用例逐题计算，按 `input.displayName ?? input.model` 精确匹配配置中的 `models[].displayName ?? models[].name`，读取对应模型的 `reference`：

- 基础耗时（毫秒）：`调用次数 × TTFT_毫秒 + max(输出 Token − 调用次数, 0) × 1000 / 输出吞吐量`。
- Jev 基础耗时（毫秒）：`调用次数 × responseLatencyMs`，使用完整响应延迟的 P50 参考值，不套用生成式模型的 Token 吞吐量公式。
- 费用：`输入 Token × 输入单价 + 输出 Token × 输出单价`。人民币费用除以记录的 `cnyPerUsd` 汇率换算为美元。

对每个模型，分别计算有效基础耗时样本和有效 `profiling.durationMs` 样本的算术平均值，再计算 `模型平均估算耗时_ms = min(基础耗时平均值_ms, max(实测耗时平均值_ms − 150, 0))`。150ms 表示每题平均网络开销，在取平均后统一扣除一次，不按模型调用次数重复扣除；这不是逐题取较小值后再求平均。缺少基础估算时，模型耗时仍为不可用；缺少实测平均值时，保留基础估算平均值。估算指标显示的样本数仍为有效基础估算样本数，Measured Duration 保留自己的有效样本数。表格、散点图、耗时 P50、Speed 和涉及速度的模型比较均复用同一个修正值；修正耗时为零时不计算 Speed。该指标近似衡量模型从输入到输出的耗时：实测值还包含本地执行开销，因此固定扣除网络时延并不等于精确分离纯推理时间。

OpenRouter prices use the page header's IN / OUT PRICE, while throughput and TTFT use the two independent P50 best cards. These may come from different providers and do not represent one service plan. Ark's Doubao Seed references use standard prices and leaderboard means under the recorded conditions; throughput is derived from mean TPOT. Its currency conversion uses the recorded Bank of China reference rate. Estimates exclude cache discounts, long-context premiums, and provider-specific adjustments. Each estimate requires its own valid usage and reference values; unknown or mixed-model records are excluded. Valid usage from every outcome, including failed attempts, is included. Completion tokens may include reasoning already reflected in TTFT, so these estimates are comparison references, not measured latency or invoices.

OpenRouter 价格取页首 IN / OUT PRICE，吞吐量和 TTFT 分别取两个 P50 best 卡片，两项可能来自不同供应商，并不代表同一服务方案。方舟豆包 Seed 参考使用标准价格及指定条件下的榜单平均值，由平均 TPOT 换算吞吐量，并按记录的中国银行参考汇率换算费用。估算不计缓存折扣、长上下文加价和供应商差异。各项估算分别要求对应的有效用量和参考数据，未知模型或混合模型调用不参与估算；所有结果类型的有效用量均纳入，包括失败尝试。输出 Token 可能含已体现在 TTFT 中的推理内容，因此估算用于比较参考，不代表实测延迟或账单。

Jev's OpenRouter reference reports complete-response P50 latency and no output TPS. Its latency sample is not specific to image grounding or a fixed input length. The ModelHub alias `typesafe-jev` returned `jev-1.14.0` when verified; the reference is tied to that observed version. Output tokens remain recorded even though their reference price is zero.

Jev 的 OpenRouter 参考值为完整响应延迟 P50，未提供输出 TPS；该延迟样本并非专门针对图片定位或固定输入长度。ModelHub 别名 `typesafe-jev` 在验证时返回 `jev-1.14.0`，参考数据对应这一已观测版本。输出 Token 的参考价格为零，但仍记录真实输出用量。

The scatter plot and **Filters** panel share one canvas. The panel has three sections: **Budget**, **Family**, and **Model**, containing the budget control, model-family chips, and compact radar legends. **Clear all** resets the cases-per-dollar target to the minimum of its range and selects every family and model. The panel sits to the right of the plot on wide screens and below it on narrower screens; the legends form a scrollable grid. Each legend contains the model name and a three-dimensional radar chart using the breakdown table's unrounded values:

- Score: `correct results / recorded results × 100`.
- Affordability (Cases / $1): `1 / average estimated cost in USD`.
- Speed (Cases / min): `60000 / corrected estimated model duration average in ms`.

The last two dimensions count testcases processed, regardless of correctness. Their radar positions use base-10 logarithmic normalization: `100 × (log10(value) − log10(min)) / (log10(max) − log10(min))`, with the smallest value at 0 and the largest at 100. If all values are equal, their positions are 100. Each of these two ranges uses all models with a valid value for that metric in the evaluation, so every model's radar uses the same scales. Score uses a fixed linear range from 60 to 100: `max(0, (score − 60) / 40 × 100)`. Scores below 60 appear at the center without changing their actual values. Models with missing estimates, or zero estimated cost or duration whose reciprocals are undefined, remain in the legend without a complete model polygon. Budget, family, and individual model conditions are combined with AND: a model retains its colors only when it matches all three. All models with valid coordinates remain in the scatter plot, and all radar legends remain displayed. Models that do not match smoothly fade to translucent gray over 400 ms in both views; filtering never removes them. The Model count shows matching models / all models. All families and models are selected initially. The first click on a family chip or model legend selects only that family or model; subsequent clicks add or remove selections. Every click on a family chip or All in the Family section resets individual model selection to all models while preserving the budget. All also selects every family. All models in the Model section resets only individual model selection, preserving the current budget and family selection. Clear all restores the minimum cases-per-dollar target and selects every family and model. Radar scales, scatter-axis ranges and breaks, P50 references, and plotted positions use the full model list and remain fixed when filters change.

The **Family Glory** toggle switch (`role="switch"`), to the right of the Family heading, selects the best model in each family by comparing unrounded score in descending order, then Speed (cases / min) in descending order, then Estimated Cost Avg. in ascending order. The next metric breaks only a tie in the previous metric. Missing speed or cost ranks after a valid value for that metric; a valid zero cost remains eligible. Models tied on all three metrics are all selected. Budget and family filters still apply through the shared AND rule; other models remain visible in translucent gray. Turning the switch off or selecting All models restores all models while preserving the budget and family selection. Clicking a family chip, Family All, or Clear all also exits this mode. Clicking a model exits the mode and adds or removes that model from the current winner selection.

散点图和 Filters 筛选面板整合在同一个画幅中。面板分为 Budget、Family、Model 三个同级区域，分别包含预算条、模型家族选项和紧凑的雷达图图例。Clear all 将每美元用例数目标重置为范围最小值，并选中所有家族及模型。面板在宽屏下位于散点图右侧，窄屏下移到散点图下方，图例采用可滚动网格。每个图例包含模型名称和三维雷达图，复用 Breakdown 表格中未四舍五入的值：

- 得分（Score）：`正确结果数 / 已有结果数 × 100`。
- 经济性（Affordability，Cases / $1）：`1 / 平均估算费用（美元）`。
- 速度（Cases / min）：`60000 / 修正后的模型平均估算耗时（毫秒）`。

后两项表示处理的用例数，不按正确与否加权，雷达图位置按 `100 × (log10(数值) − log10(最小值)) / (log10(最大值) − log10(最小值))` 以 10 为底的对数归一化，最小值为 0，最大值为 100；数值全部相同时均为 100。这两项分别根据本次评测中对应指标有效的全部模型确定范围，所有模型的小雷达图使用相同尺度。得分轴固定为 60–100 的线性范围，图表位置为 `max(0, (得分 − 60) / 40 × 100)`；低于 60 分时显示在中心，不改变实际得分。缺少估算值，或平均估算费用／耗时为零、无法取倒数的模型保留在图例中，不绘制完整的模型多边形。预算、家族和单个模型的三个条件按 AND 组合，只有同时满足所有条件的模型保留原色。坐标有效的模型始终保留在散点图中，所有雷达图图例始终展示；不满足条件的模型在两处均以 400 毫秒动画淡化为半透明灰色，不会被移除。Model 计数显示匹配模型数／全部模型数。初始选中所有家族及模型；首次点击家族选项或模型图例时仅选中该家族或模型，之后点击可增加或取消选择。每次点击 Family 区域中的家族选项或 All，都会将单个模型筛选重置为全部，保留当前预算；All 同时选中全部家族。Model 区域中的 All models 只重置单个模型筛选为全部，保留当前预算和家族选择。Clear all 恢复最小的每美元用例数目标，并选中全部家族及模型。雷达尺度、散点坐标范围和断轴、P50 参考及绘图位置均基于完整模型列表，不随筛选变化。

Family 标题右侧的 Family Glory 切换开关（`role="switch"`）在每个家族中依次按未四舍五入的得分降序、Speed（cases / min）降序、Estimated Cost Avg. 升序选择最佳模型；只有上一项相同时才比较下一项。缺失速度或费用的模型排在该项有效值之后，有效的零费用仍参与比较。三项完全相同的模型全部入选。预算和家族筛选仍按统一 AND 规则生效，其他模型保持可见并呈半透明灰色。关闭开关或点击 All models 恢复全部模型，保留预算和家族选择；点击家族选项、Family 的 All 或 Clear all 也会退出此模式。点击单个模型时退出此模式，并在当前最佳模型集合的基础上增加或取消该模型。

Model families are assigned explicitly by `models[].displayFamily`. Their colors and logo URLs come from `families[displayFamily]`; unconfigured models use `families.Other`. No family or brand is inferred from model names. Colors do not depend on the current model list or its order and remain stable during filtering. Capsule text is white.

模型家族由 `models[].displayFamily` 显式指定，颜色和 Logo URL 来自 `families[displayFamily]`，未配置的模型使用 `families.Other`。不再根据模型名称推断家族或品牌。配色不依赖当前模型列表及其顺序，筛选时保持稳定。胶囊文字统一使用白色。

The **Model Performance Overview** scatter plot labels the horizontal axis **Estimated Model Duration Avg. (sec)**, with **← Faster 🚀** and **🐌 Slower →** at its ends. Values are the corrected aggregate model durations defined above, converted from milliseconds to seconds; finite nonnegative values are valid. The axis origin and range adapt to the full model list. Empty intervals exceeding eight times the typical local gap are folded and marked. Their widths are softened logarithmically, so larger gaps retain more space; the total folded width is capped at half the retained linear span to keep the main cluster readable. Retained intervals share one linear scale. Normalized values and accumulated retained intervals preserve small clusters across large differences in magnitude. Left-side padding uses the data range and measured capsule widths. For a nondegenerate range, the rightmost point sits 30 px before the axis end, with no additional numeric upper padding; equal-value ranges retain padding to avoid a zero-width domain. Time labels use adaptive precision, including scientific notation for extreme values. Breaks exclude every model value and the elapsed-time P50 reference. The left Score axis ends at 100; its lower bound is `max(0, floor(minScore) − 1)`. With no valid scores it uses 0–100. Axis ranges, breaks, layout, and P50 references use all models and remain stable during filtering.

**Model Performance Overview** 散点图的横轴标为 **Estimated Model Duration Avg. (sec)**，两端分别为 **← Faster 🚀** 和 **🐌 Slower →**。横坐标取上文定义的聚合修正模型耗时，由毫秒换算为秒；大于等于零的有限值均有效。横轴起点与范围根据完整模型列表自适应。超过典型局部间距八倍的空白区间会折叠并标记；折叠宽度按对数缓和，跨度越大保留的空间越多，总宽度不超过未折叠线性跨度的一半，以保留主体模型的可读性。其余区间保持相同的线性比例；归一化数值后累加保留区间，避免极大数值跨度吞掉小范围数据。左侧留白根据数据范围和胶囊实测宽度计算。有效值有跨度时，最右侧散点距数轴终点保留 30px，不再叠加右端数值留白；值完全相同时保留范围，避免零宽度坐标轴。时间标签自适应精度，极端数值使用科学计数法。折叠区间不包含任何模型值或耗时 P50 参考。左侧 Score 轴上限为 100，下限为 `max(0, floor(最低得分) − 1)`；没有有效值时使用 0–100。坐标范围、断轴、布局和 P50 均依据全部模型计算，不随筛选变化。

All model names in the viewer use `input.displayName ?? input.model` (the evaluation config’s `displayName`, falling back to `name`), without rewriting prefixes, version suffixes, capitalization, or punctuation. Model call details follow the same rule for the configured model; saved result JSON retains the original API model identifiers. Capsules contain the model-family logo and the same model name. Their widths are measured with the rendered font and bounded to 22–220 px; longer names use an ellipsis and remain available in full in the tooltip. Each capsule is horizontally centered on its point, with its top edge fixed 14 px below the point center. A straight vertical connector joins the point to the capsule’s top midpoint, preserving the white-outline gaps at both ends. Capsule positions follow the projected point coordinates directly and may overlap. The tooltip lists all models with exactly the same duration and score at that position.

Viewer 中所有模型名称统一使用 `input.displayName ?? input.model`（评测配置的 `displayName`，未设置时使用 `name`），不改写前缀、版本后缀、大小写或标点。模型调用详情对当前配置模型使用相同名称，结果 JSON 中的原始 API 模型标识保持不变。胶囊包含模型家族 Logo 和同一模型名称，使用实际字体测量宽度，限制在 22–220 px；超长名称显示省略号，悬浮提示保留完整名称。胶囊水平中心与散点对齐，上边缘固定在散点中心下方 14px。连线为连接散点与胶囊上边缘中点的竖线，两端保留白色描边产生的留白。胶囊位置直接跟随散点投影坐标，可能互相重叠；耗时与得分完全相同的模型，其名称会一并列在该位置的悬浮提示中。

Chart tooltips show Score, Estimated Model Duration Avg., and Estimated Cost Avg.; costs use six decimal places in USD. Models with valid scores and elapsed-time estimates appear even without a cost estimate. Legends use descending lexicographic `displayName`/name order. Chart interactions do not navigate; use View details in the breakdown table. Capsule logos use the configured family logo URL; families without a logo use text-only capsules.

图表悬浮提示依次展示 Score、Estimated Model Duration Avg. 和 Estimated Cost Avg.，费用以 USD 保留六位小数。得分和耗时有效的模型即使缺少费用估算也会展示。图例按 `displayName`／名称字典序倒序排列。图表交互不跳转，详情通过 Breakdown 表格的 View details 打开。胶囊 Logo 使用家族配置中的 URL，未配置 Logo 的家族使用纯文本胶囊。

Dashed P50 references show a triangle in each model's radar and vertical and horizontal lines in the elapsed-time scatter plot. Each metric uses one unrounded value per model across the evaluation: finite scores and average estimated elapsed times including zero, and finite positive affordability or speed values. Missing or invalid values are excluded separately for each metric. P50 is the middle sorted value for an odd count, or the arithmetic mean of the two middle values for an even count, calculated before scaling. The elapsed-time P50 is calculated directly from models' corrected average estimated durations in seconds, independently of the radar's speed P50. An unavailable P50 omits its line; the radar reference triangle requires all three radar P50 values. A score P50 below 60 maps to the radar center. Estimated elapsed times in the scatter plot, including P50, use the time axis's adaptive precision in seconds. Raw metrics, median calculations, scales, and plotted positions retain full precision.

虚线 P50 参考在每个模型的小雷达图中形成三角形，在耗时散点图中分别绘制垂直和水平参考线。每项指标按模型等权取本次评测中未四舍五入的原始值：得分和平均估算耗时纳入包括零在内的有限值，经济性和速度纳入有限正值；缺失或无效值逐项排除。有效模型数为奇数时取排序后的中间值，为偶数时取中间两值的算术平均，再进行坐标映射。耗时 P50 直接由各模型修正后的平均估算耗时（秒）计算，与小雷达的速度 P50 独立计算。某项没有 P50 时不绘制其参考线，雷达三项 P50 齐全时才绘制参考三角形。得分 P50 低于 60 分时映射到雷达图中心。散点图的估算耗时（包括 P50）以秒显示，精度随时间轴自适应。原始指标、中位数计算、坐标范围和绘图位置保持完整精度。

The Budget slider displays **Expecting to run N cases within $1** and selects the number of testcases a model should process for one US dollar. It uses an orange rectangular track and a narrow 28 px thumb extending above and below it. Its range uses `casesPerDollar = 1 / average estimated cost in USD` from all models with valid positive per-testcase costs, regardless of the current filters: `min = floor(min(casesPerDollar) / 5) × 5`, `max = ceil(max(casesPerDollar) / 1000) × 1000`. The default target and Clear all reset value are the minimum. The slider moves continuously (`step="any"`) through a normalized position `p ∈ [0, 1]`, with exponential growth in testcase counts: when `min > 0`, `N = round(min × (max / min)^p)`; when `min = 0`, `N = round(exp(p × ln(max + 1)) − 1)` so zero remains reachable. Displayed values and filtering use the rounded integer `N`, and highlighting updates immediately while dragging. It is disabled when no positive cost can provide a range, in which case both bounds are zero, or when the bounds are equal. A model matches target `N` when `N × average estimated cost per testcase ≤ 1`, including the costs of both passed and failed executions. Unknown or invalid costs do not match; a valid zero cost matches any finite target. The budget condition combines with family and individual model selections through AND. Changing the target does not reset those selections, change chart scales, P50 references, or underlying statistics, or remove models from either view. The chart receives average estimated cost directly from the app, including valid zero costs, rather than deriving it from the reciprocal of affordability.

Budget 滑条显示 **Expecting to run N cases within $1**，用于选择希望模型每 1 美元处理的测试用例数，采用橙色矩形轨道和高 28 像素、上下伸出的细长滑块。范围基于全部模型中有效的正数单题平均估算费用计算，不受当前筛选影响：`每美元用例数 = 1 / 单题平均估算费用（美元）`，`min = floor(min(每美元用例数) / 5) × 5`，`max = ceil(max(每美元用例数) / 1000) × 1000`。默认值及 Clear all 重置值均为范围最小值。滑块在归一化位置 `p ∈ [0, 1]` 上连续平滑移动（`step="any"`），用例数按指数增长：当 `min > 0` 时，`N = round(min × (max / min)^p)`；当 `min = 0` 时，`N = round(exp(p × ln(max + 1)) − 1)`，确保可以选中零。显示值和筛选条件均使用取整后的用例数 `N`，拖动时立即更新着色。没有有效正费用可计算范围时，上下限均为零并禁用滑条；上下限相等时也禁用。选择目标 `N` 后，模型满足 `N × 单题平均估算费用 ≤ 1` 时匹配，通过和失败执行的费用均计入。未知或无效费用不匹配，有效的零费用匹配任意有限目标。预算条件与家族及单个模型的选择按 AND 组合。改变目标不会重置其他选择，也不改变图表尺度、P50 参考或原始统计，不会从散点图或雷达图图例中移除模型。图表直接接收应用计算的平均估算费用，包括有效的零费用，不通过经济性指标的倒数反推。

The development and preview servers bind to all IPv4 interfaces (`0.0.0.0`) by default. They serve testcase records and original images without modifying their files.

开发和预览服务默认监听所有 IPv4 网卡（`0.0.0.0`），提供测试用例数据和原始图片，不修改其文件。

Type-check and create a production build:

```sh
pnpm --dir benchmark/grounding-new exec tsc --noEmit
pnpm --dir benchmark/grounding-new build
```

Serve the built viewer with Hono:

```sh
pnpm --dir benchmark/grounding-new preview
```

The preview also defaults to `0.0.0.0:4319` and supports the same local and intranet URLs. Use `--port 4320` to run it alongside the development server.

预览服务同样默认监听 `0.0.0.0:4319`，支持相同的本机和内网访问方式。可使用 `--port 4320` 与开发服务同时运行。
