# @midscene/cli

CLI tool for running Midscene automation scripts in YAML format and inspecting or testing model capabilities.

For YAML automation, see [the script runner documentation](https://www.midscenejs.com/yaml-script-runner.html).

## Grounding Benchmark

`midscene model benchmark-grounding` prepares test cases, opens a read-only viewer, runs model tests, and generates static reports. The default test set contains **200 test cases: 100 web and 100 mobile**, published separately as `@midscene/benchmark-grounding`. A prediction passes when its point falls inside the ground-truth box or when the model correctly reports that the target is absent.

Use Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` and pnpm `>=9.3.0`.

### Prepare and view

Neither command needs model credentials:

```sh
pnpm dlx @midscene/cli model benchmark-grounding prepare
pnpm dlx @midscene/cli model benchmark-grounding viewer
```

`prepare` downloads the test set matching the CLI version if it is not cached, prints the resolved directory, and validates every selected test case. The output includes a full SHA-256 and file link for each test case, followed by a summary. The cache is `envPaths('midscene').cache/benchmark-grounding/<cli-version>`. First use requires npm registry access. To use a test set from a local installation or workspace, pass its path with `--testcases <directory>`.

`viewer` runs the same preparation first, then opens `http://127.0.0.1:4319`. It supports `--host`, `--port`, and `--no-open`; use `--host 0.0.0.0` for network access. Refreshing the page reloads files without restarting the service. Filters are retained in the URL except for search text; up/down switches testcases.

### Configure models

Set `MIDSCENE_GROUNDING_EVALUATION_CONFIG` to JSON through the process environment or a `.env` file in your working directory. Existing environment variables take precedence. Model credentials and custom report metadata are accepted only through environment variables, not JSON/TS configuration files or API-key options:

```json
{
  "models": [
    {
      "baseUrl": "https://model-provider.example/v1",
      "apiKey": "replace-with-your-api-key",
      "name": "your-deployed-model",
      "family": "qwen3-vl",
      "displayName": "my-grounding-model",
      "protocol": "openai-chat",
      "reasoningEnabled": "default"
    }
  ],
  "meta": {
    "models": {
      "my-grounding-model": {
        "reference": {
          "source": "Example Provider",
          "url": "https://model-provider.example/pricing",
          "observedAt": "2026-11-18T00:00:00Z",
          "pricing": {
            "inputPerToken": 0.000001,
            "outputPerToken": 0.000004
          },
          "performance": {
            "timeToFirstTokenMs": 300,
            "outputTokensPerSecond": 100
          }
        }
      }
    }
  }
}
```

These values are placeholders; use a deployment that supports screenshots and the configured Midscene adapter.

- `name` is the provider's API model ID; `family` selects the adapter. `displayName` identifies the model in reports and defaults to `name`. Display names and their sanitized result-directory names must be unique, including case-insensitive collisions.
- The runner records model snapshots from provider responses. It prefers explicit snapshot or model-version fields and headers, and recognizes release IDs in the returned model name. Each attempt and testcase stores the distinct revisions it observed in `profiling.snapshotIds`. When the provider returns only a rolling alias or deployment ID, the version is unknown. The report lists the revisions observed across its results and flags models with multiple revisions. Merging reports updates that list from the retained results.
- Optional `protocol` accepts `openai-chat` or `openai-responses`; `reasoningEnabled` accepts `true`, `false`, or `"default"`. Omit them to keep adapter defaults. For `jev`, use a System One-compatible Base URL and omit `protocol`.
- Optional `extraBody` adds fields to the model request body. For an OpenRouter relay, use `"reasoningEnabled": "default"` with `"extraBody": { "reasoning": { "enabled": false } }` to send OpenRouter's reasoning switch.
- Each model needs `reference.pricing` and `reference.performance` in either its built-in preset or its custom `meta.models` entry. Use the exact `displayName` as the key, or `name` when `displayName` is omitted. A custom entry replaces the matching preset in full, so include both fields when overriding a preset. Set `inputPerToken` and `outputPerToken` in USD per token. Free models can use `0` for both prices. Reference performance can be specified as `responseLatencyMs` or as `timeToFirstTokenMs` with `outputTokensPerSecond`.
- `outputTokensPerSecond` accepts a finite positive number or the string `"INFINITY"`. With `"INFINITY"`, only the first-token latency contributes to the reference duration estimate.
- A model’s reference prices and performance should come from the same platform. Presets prefer OpenRouter, then Volcengine Ark, then the model provider’s own data. OpenRouter references use uncached input and output prices and the best P50 TTFT and throughput with reasoning disabled. For models that require reasoning, presets use the lowest available reasoning effort and record it in the reference note. Supply a complete custom reference when a preset is missing required data.
- `meta.families` can set colors and logos. A model's `displayFamily` selects its family style.

API Keys and Base URLs are not saved in metadata or reports. Local custom logos are captured as data URIs; remote logos remain URLs. Reference data is not a guarantee of the connected provider's price or performance.

### Run tests and generate reports

`run` checks model configuration and reference data first, then prepares the selected test cases and runs each case against each selected model.

```sh
pnpm dlx @midscene/cli model benchmark-grounding run \
  --models my-grounding-model \
  --names WEB-v1-002 MOBILE-v1-003 \
  --concurrency 4 --retries 2 --timeout-ms 120000 \
  --output ./output --no-open
```

Use `--models <name...>` to select models by exact `displayName`, or by exact `name` when `displayName` is omitted. Separate multiple model names with spaces. Omit `--models` to run all models configured through `MIDSCENE_GROUNDING_EVALUATION_CONFIG` in the process environment or the working directory's `.env` file. Omit `--names` to run all testcases.

Defaults are global attempt concurrency `64`, whole-attempt timeout `120000` ms (two minutes), and `2` additional retries for recoverable execution errors. Ordinary incorrect predictions and refusals are not retried. All attempts and their available token usage are retained.

`run` enables [Midscene model call recording](https://www.midscenejs.com/model-config#record-model-calls) by default. The recorder writes JSONL under `midscene_run/model-requests/` or under `$MIDSCENE_RUN_DIR/model-requests/` when configured. Set `MIDSCENE_RECORD_MODEL_CALL=false` in the process environment or `.env` to turn recording off.

The output root defaults to `./output`. Each run uses a timestamp-based run ID stored as `evaluationId` in `meta.json`. The run directory contains independent test case snapshots, model metadata, and results.

```text
output/<evaluationId>/
├── LICENSE
├── meta.json
├── testcases/<name>/{index.json,index.sha256,image.png or image.jpg}
├── results/<model-directory>/<name>.json
└── report-<evaluationId>/
    ├── index.html    # UI, results, metadata, and licenses
    ├── brief.html    # Standalone scatter plot for embedding
    ├── metrics.json  # Precomputed metrics for other tools
    └── screenshots/  # Original image bytes, deduplicated by SHA-256
```

`run` generates the `report-<evaluationId>/` directory and opens its `index.html` by default. `--no-open` skips opening. `--no-report` skips both generation and opening. Model mistakes and final execution errors remain reportable outcomes. Infrastructure failures preserve completed files without automatically generating a report.

Keep the original run directory as the source for reporting. The result JSON records the error message received by the benchmark runner for each failed attempt. `report` displays these messages, and `merge` carries them with the retained results.

Regenerate a report without model configuration or calls:

```sh
pnpm dlx @midscene/cli model benchmark-grounding report ./output/RUN_ID --no-open
```

`report` reads the run ID from `meta.json` and writes `report-<evaluationId>/` inside the run directory. For older runs without this field, it uses the run directory name. `report --output ./cdn-report` selects another output directory. Open `index.html` locally or upload the report directory to a CDN. The report uses relative screenshot paths and hash routing, so it can live under any CDN path prefix without a backend or route rewrites. The HTML includes the UI, overview, and detailed results. Screenshots load when a test case is opened. Use the Up and Down arrow keys to switch test cases and the Left and Right arrow keys to switch models.

Use `brief.html` as the iframe source to embed only the scatter plot. The generator calculates the statistics once and shares the scatter data between both pages. Keep `brief.html` next to `index.html` so each model in the embed can open its results in the full report.

Use `metrics.json` to consume the precomputed metrics in other tools. In schema version 2, `summaries.models` contains each model's Accuracy (`accuracy`, percentage), Performance (`performance`, seconds), and Economy (`economy`, estimated test cases per **US dollar**). Economy uses the eligible test case count (`economyCount`) and cumulative input and output token usage at reference prices. A case is eligible when its final attempt returns a prediction or refusal and records complete input and output token counts. When both reference prices are zero, all completed cases are eligible. The `economy` value is `"free"` when eligible usage is free and `null` when no estimate is available. `overview` contains the chart data, including each model's Balance (`balance`), and the test case outcome matrix. `evaluationId` identifies the run. Both HTML pages embed the data they display and can open directly from disk.

For CDN caching, upload each report revision under a fresh prefix or configure `index.html`, `brief.html`, and `metrics.json` to revalidate when reusing a prefix. The SHA-256 screenshot paths can use long-lived caching. Serve `index.html` with gzip or Brotli to reduce the first load.

<details>
<summary>中文部署说明</summary>

报告默认生成在 `report-<evaluationId>/`。将整个目录上传至 CDN，对外分享 `index.html` 地址。报告可部署在任意路径前缀下，打开题目时按需加载截图。内嵌时可用同目录的 `brief.html` 作为 iframe 地址，它只展示散点图，点击模型可打开完整报告中的答题结果。两页共用构建时计算的散点数据。

其他工具可以直接读取 `metrics.json`。结构版本 2 的 `summaries.models` 包含各模型的 Accuracy（`accuracy`，百分比）、Performance（`performance`，秒）和 Economy（`economy`，每 **1 美元**可运行的估算题数）。Economy 按纳入统计的题数（`economyCount`）、累计输入和输出 token 用量及参考单价计算。以最终尝试为准，返回定位结果或拒答且用量完整的题目方可计入。输入和输出参考单价均为零时，计入所有已完成的题目。纳入统计的用量免费时，`economy` 为 `"free"`，无法估算时为 `null`。`overview` 包含图表数据、各模型的 Balance（`balance`）和答题结果矩阵。`evaluationId` 标识本轮测试。两个 HTML 文件各自内嵌展示所需的数据，可以直接从本地打开。复用发布路径时，让两个 HTML 文件和 `metrics.json` 重新验证缓存。`screenshots/` 可长期缓存。

</details>

Merge reports from local directories, local `index.html` paths, or HTTP(S) entry URLs. Older single-file reports are also accepted as inputs:

```sh
pnpm dlx @midscene/cli model benchmark-grounding merge \
  ./output/RUN_ID/report-RUN_ID 'https://cdn.example.com/RERUN/index.html' \
  --output ./merged-report --no-open
```

At least two reports are required. Later inputs replace overlapping `(displayName, testcase)` results in full, including failed outcomes, attempts, and profiling. Other results are retained. Different SHA-256 values for the same test case name and conflicting model identities are rejected. Later inputs replace entire matching model metadata and family-style entries. Statistics and estimates are recomputed from the merged data for both HTML pages and the new `metrics.json`. All distinct embedded test set licenses are retained. Missing results remain missing. By default, `merge` assigns a new run ID, writes `./report-<evaluationId>/`, and opens `index.html`. Use `--output` to choose another directory or `--no-open` to skip opening. Neither `report` nor `merge` prepares or downloads the test set.

### Performance metric

This metric estimates the time from the model receiving the grounding prompt to returning an answer. It uses observed output tokens and reference performance, typically the provider's P50 time to first token and output throughput, to reduce the influence of network latency, Midscene adapter processing, Node.js scheduling, and provider safety checks. The estimate is capped at the measured duration. Lower values mean faster grounding.

`Performance = min(measured duration, calls × TTFT + output tokens ÷ throughput)`

For each testcase, count model calls and output tokens from the final attempt if it returned a prediction or refusal, even if the answer was incorrect. Measured duration and reference time to first token (TTFT) are in seconds. Reference output throughput is in tokens per second. If token usage is incomplete or a required input is missing, use the measured duration. The report averages these per-testcase values.

<details>
<summary>中文说明</summary>

**Performance** 估算模型从收到定位指令到给出答案的耗时。它结合实际输出 token 数与性能参考值（通常取供应商的 P50 首 token 耗时和输出吞吐量），尽量排除网络延迟、Midscene 适配处理、Node.js 调度和供应商安全审查的影响。估算耗时不超过实测耗时，数值越低表示定位越快。

`Performance = min(实测耗时, 模型调用次数 × TTFT + 输出 token 数 ÷ 输出吞吐量)`

如果最终一次尝试给出了定位结果或判断目标不存在，就使用这次尝试的模型调用次数和输出 token 数，答错也计入。实测耗时与参考首 token 耗时（TTFT）以秒计，参考输出吞吐量以 token/s 计。若 token 用量记录不完整或缺少必要输入，则使用实测耗时。报告展示单题耗时估算值的平均值。

</details>

### Local and custom testcases

`prepare`, `viewer`, and `run` accept `--testcases <directory>` and exact `--names <name...>` filters. Loading is in lexicographic order; missing, duplicate, or empty selections fail explicitly:

```sh
pnpm dlx @midscene/cli model benchmark-grounding prepare \
  --testcases ./my-testcases --names my-case
```

Each test case contains `index.json`, `index.sha256`, and either `image.png` or `image.jpg`. Preparation checks schema version `1`, the SHA-256 hashes of the JSON and image files, the image format, and the ground-truth bounds. The ground truth is either `[top, right, bottom, left]` in pixels or `"REFUSAL"`. Regenerate the SHA file after editing or formatting the JSON because it hashes the exact file bytes. The image hash must match the screenshot bytes. Tests use the selected test cases and exclude candidate research files by default.

### Test set licenses and redistribution

The CLI code uses the MIT license. The test set's [LICENSE](../benchmark-grounding/LICENSE) includes the full license texts and records each direct source's attribution, release revision, and publisher-declared license. Each imported test case's `index.json` records the direct source, record ID, source URL, and local changes. Record the test set version, selected test case IDs, and test case hashes alongside results. Compare runs with the same selection and matching hashes.

`run` copies the test set package's `LICENSE` into the run directory. For a custom test set, place the applicable `LICENSE` inside the directory passed to `--testcases`. When that directory belongs to a local checkout of `@midscene/benchmark-grounding`, the package's `LICENSE` is used by default. The report embeds the full text under **Licenses**. Modification notices remain in the individual test case details.

To add notices to an older report, put the matching test set's `LICENSE` in its original run directory and regenerate it with `report`. A custom test set still needs its own authorization and attribution.

## Development

Build and test the main CLI from the repository root:

```sh
pnpm install --ignore-scripts
pnpm exec nx build @midscene/cli
pnpm exec nx test @midscene/cli
pnpm run lint
```

Use repository testcases explicitly with the built local command:

```sh
pnpm exec node packages/cli/bin/midscene model benchmark-grounding prepare \
  --testcases packages/benchmark-grounding/testcases
pnpm exec node packages/cli/bin/midscene model benchmark-grounding viewer \
  --testcases packages/benchmark-grounding/testcases --no-open
```

Grounding implementation lives under `src/benchmark-grounding` as part of the main CLI's model commands. Dependencies, tests, and Rsbuild/Rslib configuration are managed by `@midscene/cli`. Rsbuild builds the shared viewer and report HTML template. Rslib builds the Node entries. The CJS/ESM CLI loads its internal ESM bundle lazily through a relative dynamic import. Unit tests use fixtures and model mocks. The run directory retains the original test results. Upload its `report-<evaluationId>/` subdirectory to serve the report.
