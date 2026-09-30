# Grounding benchmark

[中文说明](./README.zh.md)

Run the fixed **Web v4.7 + Mobile v4.6** dataset through this checkout's
`@midscene/core` `Agent.aiLocate`. The runner and interactive report are migrated
from `midscene-evaluation`; no separate evaluation checkout or service is needed.

## Setup

From the repository root (Node and pnpm versions follow the root `package.json`):

```sh
pnpm install --ignore-scripts
pnpm exec nx build @midscene/core
cd benchmark/grounding
cp .env.example .env
# Fill in your model endpoint and credentials in .env.
pnpm validate:data
pnpm evaluate --env-file .env
```

This evaluates all 200 cases once with HD images, original queries,
`aiLocate`, and `deepLocate=false`. It uses the local `packages/core/dist/es/index.mjs`,
never an npm SDK or another checkout. **Rebuild core after changing SDK source.**
The HTML template builds automatically on the first run. To prebuild it, use
`pnpm build:report-template`. From `benchmark/`, use
`pnpm --dir grounding evaluate --env-file /absolute/path/model.env`.

### Smoke tests and selection

```sh
pnpm evaluate --env-file .env --platform web --category basic --limit 1
pnpm evaluate --env-file .env --platform mobile --category refusal --limit 1
pnpm evaluate --env-file .env --concurrency 3 --run-id my-grounding-run
```

`--cases ID,ID` selects exact case IDs. `--output-dir PATH` changes the run output
root. Reusing a run ID with existing results is rejected. Invalid models, missing
cases, invalid GT, or changed dataset hashes fail validation rather than being
silently skipped. `pnpm evaluate --help` lists all flags.

### Models and protocols

The required environment variables are `MIDSCENE_MODEL_NAME`,
`MIDSCENE_MODEL_FAMILY`, `MIDSCENE_MODEL_BASE_URL`, and `MIDSCENE_MODEL_API_KEY`.
The CLI reads an env file as data; it does not execute shell code.
Override a model with `--model NAME --family FAMILY`. Use
`--api-type responses` for Responses or `--api-type chat-completions` for Chat
Completions. Environment files may set `MIDSCENE_MODEL_PROTOCOL=openai-responses`
or `openai-chat`; the legacy `MIDSCENE_MODEL_API_TYPE=responses` is also accepted.
The explicit protocol takes precedence over the legacy setting, and CLI flags
override both. Model JSON supports `protocol` with these same values or the
legacy `apiType: "responses"`. Reports record the effective
`MIDSCENE_MODEL_PROTOCOL` passed to the local SDK. Model availability and protocol
support depend on your provider and the local SDK adapter.

For a ModelHub endpoint exposing `/v2/crawl`, the optional transport adapter
forwards the SDK's Chat Completions payload unchanged:

```sh
pnpm evaluate --env-file /absolute/path/modelhub.env \
  --model qwen3.7-plus --family qwen3 --modelhub-crawl
```

Set the base URL to the provider prefix **before** `/v2/crawl`. This adapter is
bound to loopback and uses the key only in memory. Reports redact credentials;
the recorded local adapter URL is descriptive and is not a reusable endpoint.

For several models in one report, copy `examples/models.example.json` into the
ignored `_private/` directory and fill in the credentials:

```sh
pnpm evaluate --config examples/run-config.json --models-file _private/models.json
```

Empty model/case selections mean all configured models and all 200 fixed cases.
`providerConcurrency` is per provider, not a global concurrency limit.
LangSmith is disabled by default. Explicitly enabling it requires your own
`LANGSMITH_API_KEY` or `LANGCHAIN_API_KEY`; no credentials are bundled.

## Dataset and scoring

| Platform | Basic | Functional | Reason | Refusal | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web v4.7 | 30 | 40 | 25 | 5 | 100 |
| Mobile v4.6 | 30 | 40 | 25 | 5 | 100 |

See [DATASET.md](./DATASET.md) for source benchmarks, licenses, provenance, and
the frozen selection. Original `index.json` and image bytes are preserved and
checked against their SHA-256 hashes before a run. Dataset files are excluded
from automatic formatting to preserve these hashes. PC is not in this dataset.

- Positive cases pass when the predicted point falls inside the original GT box.
- Refusal cases pass only when the SDK parser explicitly returns `not-found`.
  An API error containing “not found”, a timeout, or a parse error is a failure.
- API/parse failures stay in the planned denominator. Pending requests are shown
  separately; an incomplete report does not claim a final score.
- Execution success is separate from answer correctness. A valid but wrong point
  is an executed request and an incorrect answer.

The core migration adds structured refusal metadata on the error path; it does
not change query wording, GT, coordinate parsing, or grounding prompts.
Scores from earlier SDK versions are historical results, not new results from
this checkout.

## Artifacts

Each run creates `output/runs/<run-id>/`:

| File | Content |
| --- | --- |
| `report.html` | Standalone native report with original screenshots, JS, CSS, and data embedded; can be shared as one file |
| `report-live.html` | Progress report reading adjacent `state.json` / `results.json` |
| `results.json`, `state.json` | Per-case predictions/errors, scoring, progress, and version metadata |
| `run-config.json` | Normalized selection and evaluation settings, without model credentials |
| `dataset-snapshot.json`, `images/` | Selected source metadata and a copy of original screenshots |
| `midscene-main.diff` | Local core diff against `origin/main` at run time |

The report includes model comparisons, GT/prediction overlays, per-case details,
Web/Mobile and Basic/Functional/Reason/Refusal filters and statistics. Embedding
the original 200 images makes a full report approximately 300 MB.
To rebuild a saved report without making model requests:

```sh
pnpm report output/runs/<run-id>/results.json
```

Serve the run directory through a local HTTP server to view `report-live.html`
(for example, `python3 -m http.server 8000 --bind 127.0.0.1` from the run directory).
Keep the adjacent JSON files and images available. The completed
`report.html` has no external image/script/style dependencies.

## Development checks

```sh
pnpm validate:data
pnpm typecheck
pnpm test
```

The runner integration test uses the actual local SDK with a local fixture HTTP
server. It checks successful localization, incorrect refusal, correct refusal,
API failure accounting, artifacts, redaction, and run ID collision handling.
It makes no external model calls. Core tests, from the repository root:

```sh
pnpm exec nx test @midscene/core -- tests/unit-test/grounding-locate-not-found.test.ts tests/unit-test/task-runner/index.test.ts
```
