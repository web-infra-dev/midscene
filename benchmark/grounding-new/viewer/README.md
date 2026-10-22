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

Runs are read recursively from `../evaluation/output/<run-id>/<model-name>/<testcase-name>.json`. Open a run to see each model's pass rate and average duration across its recorded results. Select a model to open its first testcase; the sidebar and previous/next navigation then show only that model's results. Each result includes its verdict, prediction, duration, executed instruction, saved ground truth, and original JSON. The screenshot compares the saved ground truth (red) with the predicted point and box (blue), in original image coordinates. Runs may contain only part of the benchmark; the benchmark pages always remain independent of evaluation coverage. The result `:id` is the path relative to the run directory without `.json`, URL-encoded as one route segment. For example, `model-a/case-001` appears as `model-a%2Fcase-001` in the result URL.

运行列表递归读取 `../evaluation/output/<run-id>/<model-name>/<testcase-name>.json`。打开一次运行后，页面按模型展示已有结果的通过率和平均耗时。点击模型卡片进入该模型的第一道题，侧边栏与上一条／下一条只显示该模型的结果。每条结果可查看判定、预测、耗时、执行指令、运行时标注和原始 JSON。截图按原图坐标叠加运行时 GT（红色）与预测点及预测框（蓝色）。运行可以只包含部分题目，题库页面不受评测覆盖范围影响。结果路径中的 `:id` 是相对于运行目录的路径，去掉 `.json` 后缀后整体进行 URL 编码，作为一个路由片段。例如，`model-a/case-001` 在结果 URL 中表示为 `model-a%2Fcase-001`。

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
