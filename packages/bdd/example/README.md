# @midscene/bdd example

A self-contained demo: a static shop page (`demo-app/index.html`, no network
needed) driven by Gherkin features through Midscene.

## Prerequisites

1. Build the repo once from the root: `pnpm install && pnpm run build`.
2. A model for the agents — either `codex login` (the general agent then uses
   `MIDSCENE_MODEL_BASE_URL=codex://app-server`) or set the `MIDSCENE_MODEL_*`
   environment variables (at minimum `MIDSCENE_MODEL_BASE_URL`,
   `MIDSCENE_MODEL_API_KEY`, `MIDSCENE_MODEL_NAME`).

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
| `features/flows/login.feature` | A flow: a step definition authored in Gherkin. The scenario name is a cucumber expression; `@param:role` binds the capture, `@returns:greeting` exports a captured variable. |
| `features/flows/add-to-cart.feature` | A second flow with the built-in `I remember ... as "price"` capture returned to the caller. |
| `features/cart.feature` | Calling both flows declaratively and asserting against the returned `<price>` variable. |
| `features/checkout.feature` | A coupon journey; asserts a 10% discount off the flow-returned `<price>`. |
| `features/smoke.feature` | A standard Scenario Outline feeding the flow expression — Examples substitution produces the quoted literal at compile time. |
| `features/error-reporting.feature` | All three routing rules in one scenario (see below). |

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
captures to runtime variables (`<role>`), and `@returns:*` tags copy captured
variables back into the caller's scope.
