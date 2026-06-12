# @midscene/bdd example

A self-contained demo: a static shop page (`demo-app/index.html`, no network
needed) driven by Gherkin features through Midscene.

## Prerequisites

1. Build the repo once from the root: `pnpm install && pnpm run build`.
2. A model for the UI agent: set the `MIDSCENE_MODEL_*` environment variables
   (at minimum `MIDSCENE_MODEL_BASE_URL`, `MIDSCENE_MODEL_API_KEY`,
   `MIDSCENE_MODEL_NAME`).
3. The general agent (`# @agent`/`$skill` steps): install the
   [opencode](https://opencode.ai) CLI with `npm i -g opencode-ai` — with
   zero extra config it reuses the `MIDSCENE_MODEL_*` endpoint above. Or set
   `generalAgent: { type: 'codex' }` in `midscene.config.ts` and use
   `npm i -g @openai/codex` + `codex login`.

## Run

From this `example/` directory:

```bash
npx cucumber-js          # uses cucumber.js -> @midscene/bdd/profile preset
# or
npx midscene-bdd
```

`midscene.config.ts` points the UI agent at the local demo page; feature and
skill paths use the defaults (`features/**/*.feature`, `features/skills`).

## What each feature demonstrates

| File | Demonstrates |
| --- | --- |
| `features/flows/login.feature` | A flow: a step definition authored in Gherkin. The scenario name is a cucumber expression; `@param:role` binds the capture to `<role>` inside the flow body. |
| `features/flows/add-to-cart.feature` | A second flow, parameterized over the product name. |
| `features/cart.feature` | Calling both flows declaratively, then asserting against what the page shows. |
| `features/checkout.feature` | A coupon journey; asserts the 10% discount visually. |
| `features/error-reporting.feature` | All three routing rules in one scenario, including a plain `# @agent` step and a `# @no-ai` step (see below). |
| `features/gherkin-tour/*.feature` | The full standard Gherkin grammar (descriptions, Background, Rule, outlines, data tables, doc strings, tags, `# language:`), one commented file per theme — written for readers new to Cucumber/BDD. |

## The three routing rules

| Rule | Marker | Who executes the step |
| --- | --- | --- |
| Default | none | Midscene UI agent (vision model drives/asserts the page) |
| Agent | `# @agent` comment above the step, or a `$skill` token in it | General coding agent (can read files, run commands; Then steps need a pass/fail verdict). Skills live in `features/skills/*.md`. |
| No AI | `# @no-ai` comment above the step | A classic callback registered with `Given`/`When`/`Then`/`defineStep` (see `features/step_definitions/`) |

## Flows

Flows are step definitions authored in Gherkin: a scenario tagged `@flow`
whose NAME is a cucumber expression. Other scenarios call it as a plain step
(`Given I am logged in as "guest"`). `@param:*` tags bind the expression
captures to `<param>` placeholders inside the flow body — the same
substitution semantics as a Scenario Outline, scoped to the flow.
