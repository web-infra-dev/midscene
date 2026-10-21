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
| `/runs/:runId` | Results from one run / 单次运行的结果列表 |
| `/runs/:runId/:id` | One evaluation result / 单个评测结果 |

Browse benchmark cases in lexicographic name order and filter by search text, platform, category, source dataset, or point/refusal outcome. Inspect both instruction languages, original screenshots, pixel TRBL ground truth, classification reasons, and all reference fields. The GT overlay follows the original image dimensions when zooming. `REFUSAL` cases have no box. Previous/next navigation follows the filtered list.

题库按用例名称字典序展示，支持搜索、平台、分类、来源数据集和定位／拒识筛选。详情包含双语指令、原始截图、像素 TRBL 标注、分类依据和来源字段。GT 框随图片缩放，拒识用例没有目标框；上一题／下一题遵循筛选后的列表顺序。

Runs are read from `../evaluation/output`. Open a run to browse its recorded results, then open a result to inspect its model, verdict, prediction, duration, executed instruction, saved ground truth, and original JSON. The screenshot compares the saved ground truth (red) with the predicted point and box (blue), in original image coordinates. Runs may contain only part of the benchmark; the benchmark pages always remain independent of evaluation coverage. The result `:id` is the exact result filename without `.json`.

运行列表读取 `../evaluation/output`。打开一次运行后可浏览其已有结果，再进入单个结果查看模型、判定、预测、耗时、执行指令、运行时标注和原始 JSON。截图按原图坐标叠加运行时 GT（红色）与预测点及预测框（蓝色）。运行可以只包含部分题目，题库页面不受评测覆盖范围影响。结果路径中的 `:id` 是去掉 `.json` 后缀后的完整文件名。

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
