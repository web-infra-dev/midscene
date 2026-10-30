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

To evaluate models, copy `.env.example` to `.env` in this directory and fill in `MIDSCENE_GROUNDING_EVALUATION_CONFIG`. Then run the following command from the repository root. This calls real models and writes results under `evaluation/output/<timestamp>/`; it does not start the viewer.

运行评测前，将当前目录的 `.env.example` 复制为 `.env`，填写 `MIDSCENE_GROUNDING_EVALUATION_CONFIG`，然后在仓库根目录执行以下命令。评测会调用真实模型，结果写入 `evaluation/output/<timestamp>/`，不会启动查看器。

```sh
pnpm --dir benchmark/grounding-new evaluate
```

The configuration is a JSON object with a `models` array. Each model requires `baseUrl`, `apiKey`, `family`, and `name`; `protocol` is optional (`openai-chat` or `openai-responses`). The optional boolean `reasoningEnabled` maps to Midscene's reasoning switch; omit it to keep the model adapter's default. Set it to `true` for deployments that require thinking. Optional `displayName` sets the result directory name, viewer label, and pricing/performance reference key, defaulting to `name`. `name` remains the API model ID and is recorded as `input.model`; a configured alias is recorded as `input.displayName`. Usage in `profiling.byModel` retains the API model ID. Folder names replace characters outside `a-zA-Z0-9._-` (and all-dot names) with `_`; the resulting names must be unique. Each model runs every testcase. To select cases, append a Vitest name filter, for example `evaluate -t GUI-MOBILE100-factors-v1-023`.

配置为包含 `models` 数组的 JSON 对象。每个模型需提供 `baseUrl`、`apiKey`、`family` 和 `name`，可选 `protocol`（`openai-chat` 或 `openai-responses`）。可选布尔字段 `reasoningEnabled` 对应 Midscene 的推理开关，省略时沿用模型适配器默认值；要求启用思考的部署需设为 `true`。可选的 `displayName` 指定结果目录名、界面展示名和价格／性能参考的匹配键，省略时使用 `name`。`name` 始终作为 API 模型 ID，并记录在 `input.model`；配置的别名记录在 `input.displayName`。`profiling.byModel` 用量仍保留 API 模型 ID。目录名中 `a-zA-Z0-9._-` 以外的字符（以及全点号名称）替换为 `_`，转换后的目录名必须唯一。每个模型执行全部测试用例；可追加 Vitest 名称筛选，例如 `evaluate -t GUI-MOBILE100-factors-v1-023`。

For `family: "jev"`, use a System One-compatible Base URL (the SDK appends `/systemone`) and omit `protocol`. Screenshots sent to Jev are resized to a maximum edge of 1568 pixels; predictions are mapped back to the original screenshot coordinates, leaving testcase images and ground truth unchanged.

使用 `family: "jev"` 时，填写兼容 System One 的 Base URL（SDK 会追加 `/systemone`），并省略 `protocol`。发送给 Jev 的截图最长边缩放至不超过 1568 像素，预测坐标映射回原图，不修改测试用例图片和 ground truth。

For Claude through an OpenAI-compatible gateway, use `family: "claude"` and `protocol: "openai-chat"`. Set `baseUrl` to the API base without `/chat/completions`, and keep the gateway's full model ID in `name`. This adapter requests bounding boxes normalized to 0–1000 and maps them back to screenshot pixels. It does not set provider-specific reasoning options; omit `reasoningEnabled`.

通过兼容 OpenAI 的网关使用 Claude 时，设置 `family: "claude"`、`protocol: "openai-chat"`。`baseUrl` 填写不含 `/chat/completions` 的 API 基础地址，`name` 保留网关要求的完整模型 ID。适配器要求模型输出归一化到 0–1000 的边界框，并映射回截图像素坐标；不设置供应商专有的推理参数，请省略 `reasoningEnabled`。

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

The evaluation list shows IDs and dates, newest first, without loading result files for every evaluation. Select an evaluation to open its own page with Model Performance Overview, the Model Performance Breakdown table, and the Testcase Pass Overview in that order. That page reads only the selected evaluation's results recursively from `evaluation/output/<evaluation-id>/<display-name-or-model-name>/<testcase-name>.json`. The list and evaluation pages update automatically every five seconds. The breakdown table has one row per model, initially in descending lexicographic order by `displayName`, falling back to the model name. The Model and seven metric headers are sortable: click to sort, then click again to reverse the order. Reference is not sortable. Pass Rate initially sorts descending; newly selected other columns sort ascending. Metrics use their unrounded values, missing values stay last in either direction, and ties use descending model name order. Table sorting does not change the chart or testcase matrix order. Model Performance Breakdown and Testcase Pass Overview share the same panel and heading styles. Each of the three sections has a maximum overall height equal to the viewport height minus the fixed page header height and 30 px of space at both the top and bottom. The page has 28 px of space on each side, and content scrolls inside each section. Table column headers stay fixed while scrolling; narrower screens also support horizontal scrolling.

评测列表按时间倒序展示编号和日期，不加载每次评测的结果文件。点击评测后进入独立页面，依次展示 Model Performance Overview、Model Performance Breakdown 表格和 Testcase Pass Overview，仅从 `evaluation/output/<evaluation-id>/<display-name-or-model-name>/<testcase-name>.json` 递归读取所选评测的结果。列表与评测页面每五秒自动更新。Breakdown 表格每个模型一行，默认按 `displayName`（缺省时使用模型名称）字典序倒序排列。Model 和七项指标列均可点击表头排序，再次点击同一表头切换升降序；Reference 列不排序。新选通过率列时默认降序，其他列默认升序。指标按未四舍五入的值排序；空值在两种方向下均置于末尾，同值按模型名称字典序倒序排列。表格排序不改变图表和逐题矩阵的顺序。Model Performance Breakdown 和 Testcase Pass Overview 使用一致的面板及标题样式，三个板块各自的整体最大高度均为视口高度减去固定页头高度，再减去上、下各 30 px 的留白。页面左右各留 28 px，内容在板块内部滚动。表格列标题在滚动时保持固定；窄屏同时支持横向滚动。

Model Performance Breakdown shows Pass Rate (`passed / all results`) and arithmetic averages (`sum / count`) of Total Tokens, Input Tokens, Output Tokens, Estimated Cost, Estimated Model Duration, and Measured Duration, in that column order. All columns are centered. Each average metric header, including Measured Duration, places `Avg.` on its own second line. The circled question-mark icons after `Avg.` in the Estimated Cost and Estimated Model Duration headers show their calculation formulas on hover or keyboard focus. Data cells have no tooltips. Token and measured-duration metrics come from `profiling.totalTokens`, `profiling.totalPromptTokens`, `profiling.totalCompletionTokens`, and `profiling.durationMs`. Each metric independently includes finite values greater than or equal to zero from all outcomes, including failed results, and excludes missing, negative, or non-finite values. Each metric's table cell shows its valid sample count when it differs from the total result count, and displays `—` when no valid samples are available. Token averages are rounded to whole numbers, durations to two decimal places in seconds, and costs to six decimal places in USD. Each row's Reference cell expands to show the source, observation date, performance and pricing data, and source links.

Model Performance Breakdown 按列依次展示通过率（Pass Rate，`通过数 / 全部结果数`），以及总 Token（Total Tokens）、输入 Token（Input Tokens）、输出 Token（Output Tokens）、估算费用（Estimated Cost）、模型估算耗时（Estimated Model Duration）和实测耗时（Measured Duration）的算术平均值（`总和 / 样本数`）。所有列居中；各平均指标表头（包括 Measured Duration）均在独立的第二行标注 `Avg.`。Estimated Cost 和 Estimated Model Duration 表头中 `Avg.` 后的圆圈问号图标在悬浮或键盘聚焦时展示对应计算公式；数据单元格不提供悬浮提示。Token 和实测耗时分别取自 `profiling.totalTokens`、`profiling.totalPromptTokens`、`profiling.totalCompletionTokens` 和 `profiling.durationMs`。各项指标独立纳入所有结果类型（包括失败结果）中大于等于零的有限数值，排除缺失、负数和非有限值。有效样本数与总结果数不同时，对应单元格显示该项的样本数；没有有效样本时显示 `—`。Token 平均值取整数，耗时以秒保留两位小数，费用以 USD 保留六位小数。每行的 Reference 单元格可展开查看来源、观测日期、性能与价格数据及来源链接。

Select View details in a model's row to browse that model's results; the evaluation link returns to that evaluation's page. Each result reads testcase data from `input`, verdict and prediction from `output`, and timing and usage from `profiling`; the original JSON remains available. Screenshots compare saved ground truth (red) with predicted points and boxes (blue) in original image coordinates. Evaluations may cover only part of the benchmark without affecting testcase browsing. The result `:id` is its path relative to the evaluation directory, without `.json`, URL-encoded as one route segment; `model-a/case-001` becomes `model-a%2Fcase-001`.

点击模型所在行的 View details 可浏览该模型的逐题结果，点击评测链接可返回所属评测页面。详情从 `input` 读取用例数据，从 `output` 读取判定与预测，从 `profiling` 读取耗时和用量，并提供原始 JSON。截图按原图坐标比较保存的 GT（红色）与预测点及框（蓝色）。评测可仅覆盖部分题目，不影响题库浏览。结果路径中的 `:id` 是相对于评测目录的路径，去掉 `.json` 后整体编码为一个路由片段；例如 `model-a/case-001` 编码为 `model-a%2Fcase-001`。

Below Model Performance Breakdown, the Testcase Pass Overview matrix compares every model for each testcase in the dataset or evaluation. Rows follow testcase name order; model columns use descending `displayName`/name order. Green means passed, red means failed (including errors), and gray means missing. Filters show all cases, cases passed or failed by every model, or cases with missing results; missing results never count as failures for these filters. Select a cell to open its saved result, or a testcase name to browse the testcase.

Model Performance Breakdown 下方的 Testcase Pass Overview 矩阵逐题比较各模型，覆盖当前题库与本次评测记录中的所有用例。行按用例名称字典序排列，模型列按 `displayName`／名称字典序倒序排列。绿色表示通过，红色表示不通过（包括执行错误），灰色表示缺失。可筛选全部用例、所有模型均通过、所有模型均失败或存在缺失结果的用例；缺失结果不会在这些筛选中计为失败。点击单元格查看保存的评测结果，点击用例名称浏览测试用例。

Prefer OpenRouter for both pricing and performance. Use official sources only for metrics unavailable on OpenRouter, and record their sources and measurement conditions explicitly. Do not substitute a different model to fill a gap. Doubao Seed Evolving and the exact Ark release IDs of Seed 2.1 use Ark pricing and available leaderboard data. A model with pricing alone can show estimated cost, but its estimated elapsed time remains unavailable until performance data for that version is verified.

价格和性能均优先使用 OpenRouter；仅在 OpenRouter 缺少对应指标时使用官方数据，并明确记录来源和测量条件，不使用其他模型的数据代替。豆包 Seed Evolving 及 Seed 2.1 的方舟具体版本使用方舟价格和可获得的官方性能榜单数据。仅有价格参考的模型可以展示估算费用，确认对应版本的性能数据前不估算耗时。

Estimates are calculated per testcase before taking arithmetic averages, using `input.displayName ?? input.model` to match references in `viewer/src/metadata/model-cost.ts`:

- Estimated elapsed time (ms): `calls × TTFT_ms + max(completionTokens − calls, 0) × 1000 / outputTokensPerSecond`.
- Jev estimated elapsed time (ms): `calls × responseLatencyMs`, using its P50 complete-response latency instead of token-generation throughput.
- Cost: `promptTokens × inputPerToken + completionTokens × outputPerToken`. CNY amounts are divided by the recorded `cnyPerUsd` exchange rate to obtain USD.

估算先逐题计算，再取算术平均，按 `input.displayName ?? input.model` 精确匹配 `viewer/src/metadata/model-cost.ts` 中的参考数据：

- 耗时（毫秒）：`调用次数 × TTFT_毫秒 + max(输出 Token − 调用次数, 0) × 1000 / 输出吞吐量`。
- Jev 耗时（毫秒）：`调用次数 × responseLatencyMs`，使用完整响应延迟的 P50 参考值，不套用生成式模型的 Token 吞吐量公式。
- 费用：`输入 Token × 输入单价 + 输出 Token × 输出单价`。人民币费用除以记录的 `cnyPerUsd` 汇率换算为美元。

OpenRouter prices use the page header's IN / OUT PRICE, while throughput and TTFT use the two independent P50 best cards. These may come from different providers and do not represent one service plan. Ark's Doubao Seed references use standard prices and leaderboard means under the recorded conditions; throughput is derived from mean TPOT. Its currency conversion uses the recorded Bank of China reference rate. Estimates exclude cache discounts, long-context premiums, and provider-specific adjustments. Each estimate requires its own valid usage and reference values; unknown or mixed-model records are excluded. Valid usage from every outcome, including failed attempts, is included. Completion tokens may include reasoning already reflected in TTFT, so these estimates are comparison references, not measured latency or invoices.

OpenRouter 价格取页首 IN / OUT PRICE，吞吐量和 TTFT 分别取两个 P50 best 卡片，两项可能来自不同供应商，并不代表同一服务方案。方舟豆包 Seed 参考使用标准价格及指定条件下的榜单平均值，由平均 TPOT 换算吞吐量，并按记录的中国银行参考汇率换算费用。估算不计缓存折扣、长上下文加价和供应商差异。各项估算分别要求对应的有效用量和参考数据，未知模型或混合模型调用不参与估算；所有结果类型的有效用量均纳入，包括失败尝试。输出 Token 可能含已体现在 TTFT 中的推理内容，因此估算用于比较参考，不代表实测延迟或账单。

Jev's OpenRouter reference reports complete-response P50 latency and no output TPS. Its latency sample is not specific to image grounding or a fixed input length. The ModelHub alias `typesafe-jev` returned `jev-1.14.0` when verified; the reference is tied to that observed version. Output tokens remain recorded even though their reference price is zero.

Jev 的 OpenRouter 参考值为完整响应延迟 P50，未提供输出 TPS；该延迟样本并非专门针对图片定位或固定输入长度。ModelHub 别名 `typesafe-jev` 在验证时返回 `jev-1.14.0`，参考数据对应这一已观测版本。输出 Token 的参考价格为零，但仍记录真实输出用量。

The scatter plot and **Filters** panel share one canvas. The panel has three sections: **Budget**, **Family**, and **Model**, containing the budget control, model-family chips, and compact radar legends. **Clear all** resets the cases-per-dollar target to the minimum of its range and selects every family and model. The panel sits to the right of the plot on wide screens and below it on narrower screens; the legends form a scrollable grid. Each legend contains the model name and a three-dimensional radar chart using the breakdown table's unrounded values:

- Pass Rate: `passed / all results`.
- Affordability (Cases / $1): `1 / average estimated cost in USD`.
- Speed (Cases / min): `60000 / average estimated elapsed time in ms`.

The last two dimensions count testcases processed, regardless of correctness. Their radar positions use base-10 logarithmic normalization: `100 × (log10(value) − log10(min)) / (log10(max) − log10(min))`, with the smallest value at 0 and the largest at 100. If all values are equal, their positions are 100. Each of these two ranges uses all models with a valid value for that metric in the evaluation, so every model's radar uses the same scales. Pass rate uses a fixed linear range from 60% to 100%: `max(0, (passRate − 0.6) / 0.4 × 100)`. Values below 60% appear at the center without changing their actual pass rates. Models with missing estimates, or zero estimated cost or duration whose reciprocals are undefined, remain in the legend without a complete model polygon. Budget, family, and individual model conditions are combined with AND: a model retains its colors only when it matches all three. All models with valid coordinates remain in the scatter plot, and all radar legends remain displayed. Models that do not match smoothly fade to translucent gray over 400 ms in both views; filtering never removes them. The Model count shows matching models / all models. All families and models are selected initially. The first click on a family chip or model legend selects only that family or model; subsequent clicks add or remove selections. Every click on a family chip or All in the Family section resets individual model selection to all models while preserving the budget. All also selects every family. All models in the Model section resets only individual model selection, preserving the current budget and family selection. Clear all restores the minimum cases-per-dollar target and selects every family and model. Radar scales, scatter-axis ranges and breaks, P50 references, and plotted positions use the full model list and remain fixed when filters change.

The **Family Glory** toggle switch (`role="switch"`), to the right of the Family heading, selects the best model in each family by comparing unrounded pass rate in descending order, then Speed (cases / min) in descending order, then Estimated Cost Avg. in ascending order. The next metric breaks only a tie in the previous metric. Missing speed or cost ranks after a valid value for that metric; a valid zero cost remains eligible. Models tied on all three metrics are all selected. Budget and family filters still apply through the shared AND rule; other models remain visible in translucent gray. Winners are recalculated whenever results refresh. Turning the switch off or selecting All models restores all models while preserving the budget and family selection. Clicking a family chip, Family All, or Clear all also exits this mode. Clicking a model exits the mode and adds or removes that model from the current winner selection.

散点图和 Filters 筛选面板整合在同一个画幅中。面板分为 Budget、Family、Model 三个同级区域，分别包含预算条、模型家族选项和紧凑的雷达图图例。Clear all 将每美元用例数目标重置为范围最小值，并选中所有家族及模型。面板在宽屏下位于散点图右侧，窄屏下移到散点图下方，图例采用可滚动网格。每个图例包含模型名称和三维雷达图，复用 Breakdown 表格中未四舍五入的值：

- 通过率（Pass Rate）：`通过数 / 全部结果数`。
- 经济性（Affordability，Cases / $1）：`1 / 平均估算费用（美元）`。
- 速度（Cases / min）：`60000 / 平均估算耗时（毫秒）`。

后两项表示处理的用例数，不按正确与否加权，雷达图位置按 `100 × (log10(数值) − log10(最小值)) / (log10(最大值) − log10(最小值))` 以 10 为底的对数归一化，最小值为 0，最大值为 100；数值全部相同时均为 100。这两项分别根据本次评测中对应指标有效的全部模型确定范围，所有模型的小雷达图使用相同尺度。通过率轴固定为 60%–100% 的线性范围，图表位置为 `max(0, (通过率 − 0.6) / 0.4 × 100)`；低于 60% 时显示在中心，不改变实际通过率。缺少估算值，或平均估算费用／耗时为零、无法取倒数的模型保留在图例中，不绘制完整的模型多边形。预算、家族和单个模型的三个条件按 AND 组合，只有同时满足所有条件的模型保留原色。坐标有效的模型始终保留在散点图中，所有雷达图图例始终展示；不满足条件的模型在两处均以 400 毫秒动画淡化为半透明灰色，不会被移除。Model 计数显示匹配模型数／全部模型数。初始选中所有家族及模型；首次点击家族选项或模型图例时仅选中该家族或模型，之后点击可增加或取消选择。每次点击 Family 区域中的家族选项或 All，都会将单个模型筛选重置为全部，保留当前预算；All 同时选中全部家族。Model 区域中的 All models 只重置单个模型筛选为全部，保留当前预算和家族选择。Clear all 恢复最小的每美元用例数目标，并选中全部家族及模型。雷达尺度、散点坐标范围和断轴、P50 参考及绘图位置均基于完整模型列表，不随筛选变化。

Family 标题右侧的 Family Glory 切换开关（`role="switch"`）在每个家族中依次按未四舍五入的通过率降序、Speed（cases / min）降序、Estimated Cost Avg. 升序选择最佳模型；只有上一项相同时才比较下一项。缺失速度或费用的模型排在该项有效值之后，有效的零费用仍参与比较。三项完全相同的模型全部入选。预算和家族筛选仍按统一 AND 规则生效，其他模型保持可见并呈半透明灰色。结果刷新时重新计算各家族的最佳模型。关闭开关或点击 All models 恢复全部模型，保留预算和家族选择；点击家族选项、Family 的 All 或 Clear all 也会退出此模式。点击单个模型时退出此模式，并在当前最佳模型集合的基础上增加或取消该模型。

Model colors use the fixed family-to-color mapping in `viewer/src/metadata/model-colors.ts`. All models in the same family share one color. Family detection prioritizes `displayName` (or the model name when absent), falling back to the API model ID. Assigned colors do not depend on the current model list or its order and remain stable across evaluations and filtering. Capsule text is white.

模型配色使用 `viewer/src/metadata/model-colors.ts` 中固定的家族与颜色映射，同家族模型统一使用相同颜色。家族识别优先使用 `displayName`（未设置时使用模型名称），无法识别时再看 API 模型 ID。分配的颜色不依赖当前模型列表及其顺序，在不同评测和筛选状态间保持一致。胶囊文字统一使用白色。

The **Model Performance Overview** scatter plot uses a linear horizontal axis labeled **Estimated Model Duration Avg. (sec)**, starting at zero without left padding. **← Faster** and **Slower →** align with the left and right ends of the horizontal axis, with its title centered between them. The vertical pass-rate axis uses all models with valid pass rates: its lower bound rounds the minimum down to a multiple of five percentage points, and its upper bound rounds the maximum up to a multiple of five percentage points. If both bounds are equal, each side expands by five percentage points, limited to 0%–100%; with no valid pass rates, the range is 0%–100%. The range remains fixed when filters change. Each model's horizontal value is the arithmetic average of its valid per-testcase estimated elapsed times in milliseconds, divided by 1000; lower values indicate faster models. Finite values greater than or equal to zero are valid. Large empty intervals on the elapsed-time axis are collapsed and marked as axis breaks; the remaining intervals share the same linear scale. Breaks exclude all models' average estimated elapsed times and the elapsed-time P50 reference. Tick labels and tooltips show seconds to at most two decimal places; plotted positions retain full precision. Chart tooltips label duration as Estimated Model Duration Avg., pass rate as Pass Rate, and average estimated cost per testcase as Estimated Cost Avg. The cost uses six decimal places in USD, matching the breakdown table. Shared metrics use the same names in the table, tooltips, and legends. Models with valid pass rates and elapsed-time estimates can appear in the scatter plot; a missing cost estimate does not exclude a model. Legend cards are sorted in descending lexicographic order by `displayName`, falling back to the model name. All models with valid positions are shown, including gray models that do not match the filters, and chart interactions do not navigate; use View details in the breakdown table instead. Colored circles mark data positions, with a nearby capsule containing the model-family logo and model label connected by a subtle line. Jev uses the brand icon from the [TypeSafe website](https://typesafe.ai/). Other logos come from the fixed-version `@lobehub/icons-static-svg@1.95.1` CDN ([LobeHub static SVG documentation](https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/README.md)); unrecognized families use text-only capsules.

**Model Performance Overview** 散点图的横轴标为 **Estimated Model Duration Avg. (sec)**，采用从零开始且左侧不留空白的线性刻度。**← Faster** 和 **Slower →** 分别对齐横轴左、右两端，轴标题位于两者之间并居中，表示左侧更快、右侧更慢。纵轴使用所有模型的有效通过率：最低值向下、最高值向上取到 5 个百分点的整数倍，分别作为下限和上限；上下限相同时，向两侧各扩展 5 个百分点，并限制在 0%–100% 内；没有有效通过率时使用 0%–100%。筛选变化时，范围保持不变。每个模型的横坐标取逐题有效估算耗时（毫秒）的算术平均值，再除以 1000 换算为秒；越靠左表示越快。大于等于零的有限值均有效。耗时轴上较大的空白区间会折叠并以断轴标记明确表示，其余区间保持相同的线性比例。折叠区间不包含任何模型的平均估算耗时或耗时 P50 参考值。刻度和悬浮提示以秒显示，最多保留两位小数，绘图位置保留完整精度。图表悬浮提示的耗时、通过率和单用例平均估算费用分别标为 Estimated Model Duration Avg.、Pass Rate 和 Estimated Cost Avg.；费用以 USD 保留六位小数，与 Breakdown 表格一致。表格、悬浮提示和图例中的相同指标使用同名字段。通过率和耗时估算有效的模型均可参与散点图，缺少费用估算不会排除该模型。图例卡片按 `displayName`（缺省时使用模型名称）字典序倒序排列。图表展示全部坐标有效的模型，包括置灰的不匹配模型，交互不跳转详情；详情通过 Breakdown 表格中的 View details 打开。彩色圆点标记数据位置，附近的胶囊包含模型家族 Logo 和型号文本，并通过细线关联。Jev 使用 [TypeSafe 官网](https://typesafe.ai/)的品牌图标，其余 Logo 来自固定版本 `@lobehub/icons-static-svg@1.95.1` 的 CDN（[LobeHub 静态 SVG 说明](https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/README.md)）；未识别的家族使用纯文本胶囊。

Dashed P50 references show a triangle in each model's radar and vertical and horizontal lines in the elapsed-time scatter plot. Each metric uses one unrounded value per model across the evaluation: finite pass rates and average estimated elapsed times including zero, and finite positive affordability or speed values. Missing or invalid values are excluded separately for each metric. P50 is the middle sorted value for an odd count, or the arithmetic mean of the two middle values for an even count, calculated before scaling. The elapsed-time P50 is calculated directly from models' average estimated elapsed times in seconds, independently of the radar's speed P50. An unavailable P50 omits its line; the radar reference triangle requires all three radar P50 values. A pass-rate P50 below 60% maps to the radar center. Estimated elapsed times in the scatter plot, including P50, are displayed in seconds to at most two decimal places. Raw metrics, median calculations, scales, and plotted positions retain full precision.

虚线 P50 参考在每个模型的小雷达图中形成三角形，在耗时散点图中分别绘制垂直和水平参考线。每项指标按模型等权取本次评测中未四舍五入的原始值：通过率和平均估算耗时纳入包括零在内的有限值，经济性和速度纳入有限正值；缺失或无效值逐项排除。有效模型数为奇数时取排序后的中间值，为偶数时取中间两值的算术平均，再进行坐标映射。耗时 P50 直接由各模型的平均估算耗时（秒）计算，与小雷达的速度 P50 独立计算。某项没有 P50 时不绘制其参考线，雷达三项 P50 齐全时才绘制参考三角形。通过率 P50 低于 60% 时映射到雷达图中心。散点图的估算耗时（包括 P50）以秒显示，最多保留两位小数。原始指标、中位数计算、坐标范围和绘图位置保持完整精度。

The Budget slider displays **Expecting to run N cases within $1** and selects the number of testcases a model should process for one US dollar. It uses an orange rectangular track and a narrow 28 px thumb extending above and below it. Its range uses `casesPerDollar = 1 / average estimated cost in USD` from all models with valid positive per-testcase costs, regardless of the current filters: `min = floor(min(casesPerDollar) / 5) × 5`, `max = ceil(max(casesPerDollar) / 1000) × 1000`. The default target and Clear all reset value are the minimum. The slider moves continuously (`step="any"`) through a normalized position `p ∈ [0, 1]`, with exponential growth in testcase counts: when `min > 0`, `N = round(min × (max / min)^p)`; when `min = 0`, `N = round(exp(p × ln(max + 1)) − 1)` so zero remains reachable. Displayed values and filtering use the rounded integer `N`, and highlighting updates immediately while dragging. It is disabled when no positive cost can provide a range, in which case both bounds are zero, or when the bounds are equal. When results refresh, the selected target is clamped to the current range. A model matches target `N` when `N × average estimated cost per testcase ≤ 1`, including the costs of both passed and failed executions. Unknown or invalid costs do not match; a valid zero cost matches any finite target. The budget condition combines with family and individual model selections through AND. Changing the target does not reset those selections, change chart scales, P50 references, or underlying statistics, or remove models from either view. The chart receives average estimated cost directly from the app, including valid zero costs, rather than deriving it from the reciprocal of affordability.

Budget 滑条显示 **Expecting to run N cases within $1**，用于选择希望模型每 1 美元处理的测试用例数，采用橙色矩形轨道和高 28 像素、上下伸出的细长滑块。范围基于全部模型中有效的正数单题平均估算费用计算，不受当前筛选影响：`每美元用例数 = 1 / 单题平均估算费用（美元）`，`min = floor(min(每美元用例数) / 5) × 5`，`max = ceil(max(每美元用例数) / 1000) × 1000`。默认值及 Clear all 重置值均为范围最小值。滑块在归一化位置 `p ∈ [0, 1]` 上连续平滑移动（`step="any"`），用例数按指数增长：当 `min > 0` 时，`N = round(min × (max / min)^p)`；当 `min = 0` 时，`N = round(exp(p × ln(max + 1)) − 1)`，确保可以选中零。显示值和筛选条件均使用取整后的用例数 `N`，拖动时立即更新着色。没有有效正费用可计算范围时，上下限均为零并禁用滑条；上下限相等时也禁用。结果刷新时，将已选目标限制在当前范围内。选择目标 `N` 后，模型满足 `N × 单题平均估算费用 ≤ 1` 时匹配，通过和失败执行的费用均计入。未知或无效费用不匹配，有效的零费用匹配任意有限目标。预算条件与家族及单个模型的选择按 AND 组合。改变目标不会重置其他选择，也不改变图表尺度、P50 参考或原始统计，不会从散点图或雷达图图例中移除模型。图表直接接收应用计算的平均估算费用，包括有效的零费用，不通过经济性指标的倒数反推。

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
