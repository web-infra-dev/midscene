# Midscene v2 Testing Framework — Example

A self-contained demo of [`@midscene/testing-framework`](../packages/testing-framework)
(the AI-native v2 UI testing framework, Phase 0). Copy this folder out, install,
set your model env vars, and run.

## What it shows

- A **config-style** `uiAgent` (web) in `midscene.config.ts` — environment lives
  in config, never in the case YAML.
- The full node model in `e2e/*.yaml`:
  - `ui` — natural-language UI actions (run by Midscene's UI Agent)
  - `verify` — gating judgment with a forced pass/fail verdict
  - `soft` — non-gating soft assertion (failure → warning only)
  - `agent` — advisory free exploration (never gates)
  - custom **runtime** nodes (`prepareCartFixture`, `notify`) via `defineRuntime`
- A `$name` **skill** reference (`$catalog`) backed by `skills/catalog/SKILL.md`.
- The **output contract**: steps record natural-language conclusions that later
  `verify` / `agent` nodes reference by name.

## Run it

```bash
# 1. install
pnpm install         # or npm install / yarn

# 2. configure the model (UI Agent + Pi share one endpoint)
cp .env.example .env # then edit, or export the vars in your shell

# 3. run all cases
pnpm test

# run a single case
pnpm test:one
```

By default the demo runs against the bundled static page in `site/index.html`
(offline). Set `DEMO_URL` to point at your own app.

Results are written to `midscene_run/output/summary.json`, and Midscene HTML
reports for the UI steps land in `midscene_run/report/`.

## Layout

```text
.
  midscene.config.ts     # uiAgent + discovery + runtime nodes
  e2e/
    product-detail.yaml   # ui + verify + soft + agent
    add-to-cart.yaml      # custom node + $catalog skill + verify + agent + notify
  skills/
    catalog/SKILL.md      # a $name skill (Pi discovers/loads it)
  site/
    index.html            # tiny static demo app
```
