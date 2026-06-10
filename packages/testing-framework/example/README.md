# Midscene v2 Testing Framework — Examples

Two related examples live here:

1. **Three authoring styles, one test suite** (`style-1-gherkin/`,
   `style-2-js/`, `style-3-overlay/`) — the flow-IR POC. **Start here.**
2. A copy-out **YAML runner** demo (`e2e/` + `midscene.config.ts`) — the
   Phase 0 node engine. See [below](#the-phase-0-yaml-runner-example).

## Three interchangeable styles of the SAME suite

The style folders author the **same multi-file test suite** for the static
shop in `demo-app/`. They are *alternative surfaces*, not different suites:
all three compile to one shared intermediate representation (flow-IR) and
run through the same executor, so you pick a style per team — or mix them —
without changing semantics. No step-definition code exists anywhere; every
step is natural language executed by AI agents.

| Folder | Style | Read this first | Choose it when |
| --- | --- | --- | --- |
| `style-1-gherkin/` | Pure Gherkin `.feature` files | `flows/login.feature` | Non-engineers own the suite; specs are the shared language. |
| `style-2-js/` | Pure JS/TS fluent API | `flows/index.ts` | The suite is generated or heavily dynamic (loops, computed prompts). |
| `style-3-overlay/` | Gherkin source of truth + sparse JS overlay | `checkout.overlay.ts` | Gherkin stays canonical, but a few scenarios need computed values or env tweaks. Binds **style 1's** feature files — nothing is duplicated. |

Inside each style the layout shows real-world modular reuse:

```text
style-1-gherkin/
  flows/                 # SHARED flow definitions (@flow scenarios)
    login.feature        #   "Login"  — params/returns declared as tags
    add-to-cart.feature  #   "Add product to cart"
  features/              # independent test modules; they CALL the shared
    cart.feature         # flows but do not define them
    checkout.feature
    smoke.feature

style-2-js/
  flows/index.ts         # the same two flows, declared with defineFlow()
  features/              # one module per .feature twin
    cart.flows.ts
    checkout.flows.ts
    smoke.flows.ts

style-3-overlay/
  checkout.overlay.ts    # sparse patch over style-1's checkout.feature
```

Cross-file resolution is the suite's job, not the file's: `compileSuite()`
compiles every `.feature` under a directory and merges all `@flow`
definitions into **one registry** (duplicate flow names across files fail
loudly), then each module's scenarios run against it. The JS side gets the
same effect by importing the shared registry from `flows/index.ts`.

Key concepts, explained in context in the "read this first" files:

- **Flow** — a named, parameterized, reusable prompt sequence. Fresh
  variable scope inside (only declared params visible), only declared
  `returns` flow back to the caller.
- **Capture / `remember`** — the UI agent extracts a value from the screen
  into a machine-owned variable table; later prompts use `{name}`
  placeholders that are substituted mechanically *before* any model sees
  the text.
- **Keyword mapping** — Given/When → UI actions; Then → fail-closed
  `verify` (a general agent must report a pass/fail verdict); `@soft` /
  `Soft()` → warn-only checks.

### Run it

```bash
pnpm --filter @midscene/testing-framework demo            # offline, no keys
pnpm --filter @midscene/testing-framework demo -- --live  # real browser+model
```

The demo runs the suite module-by-module in all three styles, narrates each
prompt/variable/verdict, and proves the styles are equivalent by comparing
execution traces. See `../POC-GHERKIN.md` for the full design.

## The Phase 0 YAML runner example

A self-contained demo of the YAML node engine: copy this folder out,
install, set model env vars, and run.

- A **config-style** `uiAgent` (web) in `midscene.config.ts`.
- The full node model in `e2e/*.yaml`: `ui`, `verify`, `soft`, `agent`,
  plus custom **runtime** nodes (`prepareCartFixture`, `notify`) via
  `defineRuntime`.
- A `$name` **skill** reference (`$catalog`) backed by
  `skills/catalog/SKILL.md`.

```bash
pnpm install
cp .env.example .env   # or export MIDSCENE_MODEL_* in your shell
pnpm test              # midscene-tf run
pnpm test:one          # single case
```

By default it runs against the bundled static page in `site/index.html`;
set `DEMO_URL` to point at your own app. Results land in
`midscene_run/output/summary.json`, HTML reports in `midscene_run/report/`.
