# @midscene/cli

CLI tool for running Midscene automation scripts in YAML format and inspecting or evaluating model capabilities.

For YAML automation, see [the script runner documentation](https://www.midscenejs.com/yaml-script-runner.html).

## Grounding Benchmark

`midscene model benchmark-grounding` provides testcase preparation, a read-only viewer, model evaluation, and standalone HTML reports. The default dataset contains **200 testcases: 100 Web and 100 Mobile**, published separately as `@midscene/benchmark-grounding`. A prediction passes when its point falls inside the ground-truth box, or when the model correctly reports that the target is absent.

Use Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` and pnpm `>=9.3.0`.

### Prepare and view

Neither command needs model credentials:

```sh
pnpm dlx @midscene/cli model benchmark-grounding prepare
pnpm dlx @midscene/cli model benchmark-grounding viewer
```

`prepare` downloads the exact CLI-version dataset when it is not cached, prints the resolved directory, and validates every selected testcase. Each result includes a full SHA-256 and file link, followed by a summary. The cache is `envPaths('midscene').cache/benchmark-grounding/<cli-version>`; first use requires npm registry access. The CLI does not depend on or auto-detect installed/workspace datasets. Pass `--testcases <directory>` to use local files without downloading.

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
            "currency": "USD",
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
- Optional `protocol` accepts `openai-chat` or `openai-responses`; `reasoningEnabled` accepts `true`, `false`, or `"default"`. Omit them to keep adapter defaults. For `jev`, use a System One-compatible Base URL and omit `protocol`.
- Optional `extraBody` adds fields to the model request body. For an OpenRouter relay, use `"reasoningEnabled": "default"` with `"extraBody": { "reasoning": { "enabled": false } }` to send OpenRouter's reasoning switch.
- Each model needs `reference.pricing` and `reference.performance` in either its built-in preset or its custom `meta.models` entry. Use the exact `displayName` as the key, or `name` when `displayName` is omitted. A custom entry replaces the matching preset in full, so include both fields when overriding a preset. Free models can use `0` for both prices. Performance can be specified as `responseLatencyMs` or as `timeToFirstTokenMs` with `outputTokensPerSecond`.
- `meta.families` can set colors and logos. A model's `displayFamily` selects its family style.

API Keys and Base URLs are not saved in metadata or reports. Local custom logos are captured as data URIs; remote logos remain URLs. Reference data is not a guarantee of the connected provider's price or performance.

### Evaluate and report

`run` checks model configuration and reference data first, then prepares the selected testcases and evaluates every model/testcase combination.

```sh
pnpm dlx @midscene/cli model benchmark-grounding run \
  --names WEB-v1-002 MOBILE-v1-003 \
  --concurrency 4 --retries 2 --timeout-ms 60000 \
  --output ./output --no-open
```

Omit `--names` to run all testcases. Defaults are global attempt concurrency `64`, whole-attempt timeout `60000` ms, and `2` additional retries for recoverable execution errors. Ordinary incorrect predictions and refusals are not retried. All attempts and their available token usage are retained.

The output root defaults to `./output`. Each timestamped run directory contains independent testcase snapshots, model metadata, and results:

```text
output/<run-id>/
├── meta.json
├── testcases/<name>/{index.json,index.sha256,image.png or image.jpg}
├── results/<model-directory>/<name>.json
└── report.html
```

`run` generates and opens `report.html` by default. `--no-open` skips opening; `--no-report` skips both generation and opening. Model mistakes and final execution errors remain reportable outcomes. Infrastructure failures preserve completed files without automatically generating a report.

Regenerate a report without model configuration or calls:

```sh
pnpm dlx @midscene/cli model benchmark-grounding report ./output/RUN_ID --no-open
```

`report --output ./report.html` selects another path. Reports embed screenshots, results, JavaScript, and CSS and open directly through `file:///`; remote logos and the favicon still need network access. Overview is the first page and Testcases the second. In Testcases, up/down switches testcases and left/right switches models.

Merge standalone reports from local files or HTTP(S) URLs:

```sh
pnpm dlx @midscene/cli model benchmark-grounding merge \
  ./output/FULL_RUN/report.html 'https://cdn.example.com/RERUN/report.html' \
  --output ./merged-report.html --no-open
```

At least two reports are required. Later inputs replace overlapping `(displayName, testcase)` results in full, including failed outcomes, attempts, and profiling. Other results are retained. Different SHA-256 values for the same testcase name and conflicting model identities are rejected. Later inputs replace entire matching model metadata and family-style entries; statistics and estimates are recomputed from the merged data. Missing results remain missing. The default output is `./merged-report.html`, opened unless `--no-open` is set. Input files cannot be overwritten. Neither `report` nor `merge` prepares or downloads the dataset.

### Local and custom testcases

`prepare`, `viewer`, and `run` accept `--testcases <directory>` and exact `--names <name...>` filters. Loading is in lexicographic order; missing, duplicate, or empty selections fail explicitly:

```sh
pnpm dlx @midscene/cli model benchmark-grounding prepare \
  --testcases ./my-testcases --names my-case
```

Each testcase has three files: `index.json`, `index.sha256`, and `image.png` or `image.jpg`. Preparation checks schema version `1`, JSON/image SHA-256, image format, and ground-truth bounds. Ground truth is pixel `[top, right, bottom, left]` or `"REFUSAL"`. The SHA file hashes the exact JSON bytes; regenerate it after editing or formatting JSON. The image hash must match the screenshot bytes. Candidate research files are not automatically included in evaluation.

### Data licenses and redistribution

The CLI code uses the MIT license. The dataset ships complete license texts and records each direct source's attribution, release revision, and publisher-declared license in its [LICENSE](../benchmark-grounding/LICENSE). Each imported testcase's `index.json` records the direct dataset, record ID, source URL, and local changes. Record the dataset version, selected testcase IDs and testcase hashes alongside results. Compare results over the same selection with matching testcase hashes.

When sharing testcase snapshots or HTML reports that embed screenshots or annotations, include the applicable dataset license and attribution materials with them. Report generation does not automatically attach these materials. Local/custom datasets require their own authorization and attribution.

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

Grounding implementation lives under `src/benchmark-grounding` as part of the main CLI's model commands, not a separate project or public SDK. Dependencies, tests, and Rsbuild/Rslib configuration are managed by `@midscene/cli`. Rsbuild creates the embedded page template; Rslib builds the Node entries. The CJS/ESM CLI loads its internal ESM bundle lazily through a relative dynamic import, without a package subpath export or separate type declarations. Unit tests use fixtures and model mocks, not real `.env` model calls. Saved evaluation outputs are internal archives and are not published.
