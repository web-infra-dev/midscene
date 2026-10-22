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

React components and styles support hot updates. Restart the server after changing testcase files. The development server routes dataset requests through Hono on the same port.

Benchmark browsing and evaluation results have separate pages:

题库浏览与评测结果分为独立页面：

| Route | Page / 页面 |
| --- | --- |
| `/benchmark` | Benchmark browser / 题库查看器 |
| `/benchmark/:name` | One testcase / 单个测试用例 |
| `/runs` | Evaluation runs / 评测运行列表 |
| `/runs/:runId` | Model summaries for one run / 单次运行的模型汇总 |
| `/runs/:runId/:id` | One model's result detail / 单个模型的逐题结果 |

Browse benchmark cases in lexicographic name order and filter by search text, platform, category, source dataset, or point/refusal outcome. Inspect both instruction languages, original screenshots, pixel TRBL ground truth, classification reasons, and all reference fields. The GT overlay follows the original image dimensions when zooming. `REFUSAL` cases have no box. Previous/next navigation follows the filtered list.

题库按用例名称字典序展示，支持搜索、平台、分类、来源数据集和定位／拒识筛选。详情包含双语指令、原始截图、像素 TRBL 标注、分类依据和来源字段。GT 框随图片缩放，拒识用例没有目标框；上一题／下一题遵循筛选后的列表顺序。

Runs are read recursively from `../evaluation/output/<run-id>/<model-name>/<testcase-name>.json`. Open a run to see each model's pass rate and compare geometric and arithmetic means for token consumption and duration. Both means use the same positive `profiling.totalTokens` or `profiling.durationMs` values for each metric. The geometric mean is `exp(sum(log(value)) / count)`; the arithmetic mean is `sum(value) / count`. All result outcomes are eligible; zero and missing values are excluded from both means. Each card shows the included record count out of the total, and displays `—` when no positive values are available. Select a model to open its first testcase; the sidebar and previous/next navigation then show only that model's results. Each result reads its testcase, model, instruction, and ground truth from `input`; verdict and prediction from `output`; and duration, token counts, cached input, call count, model time, and per-intent/per-model details from `profiling`. The original JSON remains available. The screenshot compares the saved ground truth (red) with the predicted point and box (blue), in original image coordinates. Runs may contain only part of the benchmark; the benchmark pages always remain independent of evaluation coverage. The result `:id` is the path relative to the run directory without `.json`, URL-encoded as one route segment. For example, `model-a/case-001` appears as `model-a%2Fcase-001` in the result URL.

运行列表递归读取 `../evaluation/output/<run-id>/<model-name>/<testcase-name>.json`。打开一次运行后，页面按模型展示已有结果的通过率，并同时展示 Token 消耗和耗时的几何平均、算术平均。每项指标的两种平均使用相同的正数样本，分别来自 `profiling.totalTokens` 和 `profiling.durationMs`。几何平均按 `exp(sum(log(value)) / count)` 计算，算术平均按 `sum(value) / count` 计算。不按结果类型筛选，零值和缺失值均不参与两种平均的计算；卡片展示参与统计的记录数／总记录数，没有正数时显示 `—`。点击模型卡片进入该模型的第一道题，侧边栏与上一条／下一条只显示该模型的结果。每条结果从 `input` 读取用例、模型、指令和标注，从 `output` 读取判定与预测，从 `profiling` 读取耗时、Token 数、缓存输入、调用次数、模型耗时及按意图／模型统计的明细；原始 JSON 也可查看。截图按原图坐标叠加运行时 GT（红色）与预测点及预测框（蓝色）。运行可以只包含部分题目，题库页面不受评测覆盖范围影响。结果路径中的 `:id` 是相对于运行目录的路径，去掉 `.json` 后缀后整体进行 URL 编码，作为一个路由片段。例如，`model-a/case-001` 在结果 URL 中表示为 `model-a%2Fcase-001`。

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
