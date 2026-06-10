# POC: Two authoring front-ends over one shared flow-IR

This POC extends the Phase 0 framework with composable, reusable "prompt
flows" authored in **two surfaces** — a fluent JS/TS API and Gherkin
`.feature` files — that compile to **one shared intermediate representation
(flow-IR)**, which in turn lowers onto the existing engine node kinds
(`ui` / `verify` / `soft` / `agent`). No step-definition code anywhere: every
step is natural language executed by the AI agents. A third, **hybrid** mode
(`bindFeature`) layers a sparse JS overlay over a `.feature` file.

## Run the demo

```bash
pnpm --filter @midscene/testing-framework demo
```

Runs the multi-file example suite (see "Example" below) through **all three
authoring styles**, module by module, with a narrated walkthrough — offline
by default (scripted fake agents simulate the shop; no model keys, no
browser). Expected output (excerpt):

```
━━━ Mode 1/3: Style 1 — pure Gherkin ━━━

  ▣ Module: style-1-gherkin/features/checkout.feature
    ▶ Scenario: Checkout as admin
      [ui]      the demo shop is open on the home page
        → flow Login(role="admin")
        [ui]      I sign in as the "admin" user with the saved test credentials   (template: "I sign in as the \"{role}\" user ...")
        [capture] the greeting message shown in the header
          {greeting} = "Hello, Admin!" (capture)
        ← Login returned greeting="Hello, Admin!"
        → flow Add product to cart(product="Trail Backpack")
        ...
      [verify]  the cart total equals $129.00   (template: "the cart total equals {price}")
        ✔ PASS — The cart shows $129.00, matching the remembered price.
      ✔ scenario passed

  ▣ Module: style-1-gherkin/flows/login.feature
    registers shared flow: "Login"
    (no runnable scenarios — flows only)
...
━━━ Comparison: three styles, one IR ━━━
  ...cart.feature vs ...cart.flows.ts — "Cart shows the added product with quantity and price": identical execution trace ✔ (30 events)
  Style 3 overlay vs the style-1 checkout.feature it binds:
    "Checkout as admin":
      - [verify] the cart total equals {price}
      + [ui] apply the coupon code {couponCode} in the cart
      + [soft] the cart total equals {price} minus the "{couponCode}" coupon discount
      + injected var {couponCode} = "E2E-2026-06-10"
```

**Live mode** — `pnpm --filter @midscene/testing-framework demo -- --live`
drives a real puppeteer web agent against the self-contained static shop in
`example/demo-app/index.html` (override with `DEMO_URL`), with real model
calls. The default/easy path is **Midscene's codex app-server provider**
(no API key — it spawns `codex app-server` and reuses the Codex CLI OAuth
session via JSON-RPC over stdio, see
`packages/core/src/ai-model/service-caller/codex-app-server.ts`):

```bash
# one-time setup
codex login              # verify with: codex login status

# run — the demo auto-configures when MIDSCENE_MODEL_BASE_URL is unset:
#   MIDSCENE_MODEL_BASE_URL="codex://app-server"
#   MIDSCENE_MODEL_NAME="gpt-5.5"      (override with env)
#   MIDSCENE_MODEL_FAMILY="gpt-5"
pnpm --filter @midscene/testing-framework demo -- --live

# optional: run a single mode (faster)
pnpm --filter @midscene/testing-framework demo -- --live --mode gherkin   # or js | bound
```

On the codex path, `verify`/`soft` verdicts run through `CodexGeneralAgent`
(`src/general-agent/codex-general-agent.ts`), which routes the same
provider via core's `callAI` and parses a JSON verdict fail-closed — the
default Pi general agent needs an OpenAI-compatible HTTP endpoint and
cannot speak `codex://`. Each adapter supplies its own
`verdictInstructions` (Pi: "call the `report_verdict` tool"; codex: "end
your reply with a JSON verdict object"), which the engine embeds into the
assembled context so the prompt always matches the verdict channel the
adapter actually supports. Any such endpoint still works by setting
`MIDSCENE_MODEL_*` yourself (Pi is used for verdicts then). Each scenario
gets a fresh browser; Midscene HTML reports land in `midscene_run/report/`.
Verified end to end against codex `gpt-5.5`: all three modes pass (one
expected nondeterminism: the advisory promo-banner soft check may PASS or
SOFT-FAIL depending on whether the model counts the header as a banner).

```
 .feature files          .flows.ts files
      │       └─────┐          │
      │       bindFeature      │
      │       (sparse JS       │
      │        overlay)        │
      │             │          │
 frontends/gherkin  │     frontends/js
 (@cucumber/gherkin │     (defineFlow / scenario /
  pickles compiler) │      Given/When/Then/Soft …)
      │             │          │
      └────────┬────┴──────────┘
               ▼
        src/flow-ir  (ScenarioIR / FlowDefIR / FlowRegistry)
               │   runScenario(): variable table, {var} substitution,
               │   flow-call scoping & depth cap
               ▼
        engine/run-node.ts  (existing ui / verify / soft / agent)
               │
        UI Agent (aiAct / aiString)  +  GeneralAgentAdapter (verdicts)
```

## The IR (`src/flow-ir/`)

Three step kinds (`types.ts`):

| IR step    | Lowers to                                                        |
| ---------- | ---------------------------------------------------------------- |
| `prompt`   | one engine node: `ui` (setup/action), `verify`, `soft`, `agent`  |
| `capture`  | structured extraction via the UI agent (`aiString`), stored in the variable table |
| `callFlow` | the registered flow's steps, run in a fresh child scope          |

**Variable table** (`substitute.ts`, `run-scenario.ts`): scenario-scoped,
machine-owned. `capture` steps ("remember … as varName") extract values
through `aiString`; later templates get **mechanical** `{varName}`
substitution *before* any prompt is sent to a model. Unknown placeholders
fail the step immediately (typo safety) without a model call, and a capture
that extracts an empty value fails fast instead of poisoning later prompts
with a blank. Model-owned
prose conclusions keep flowing through the existing `StepOutput` channel —
the two channels never mix.

**Named flows** (`registry.ts`): parameterized prompt sequences in a
`FlowRegistry`. Invocation semantics:

- declared `params` only — missing/extra args fail the step;
- a **fresh variable scope** inside the flow (args + its own captures);
  caller variables are invisible;
- only declared `returns` are copied back into the caller scope;
- UI/browser state is naturally shared (same UI agent);
- call depth is capped at 2 (`MAX_FLOW_CALL_DEPTH`); deeper nesting fails;
- `memo: 'once-per-run'` memoizes a **fully successful** completion (keyed
  by flow name + resolved args) and replays the declared returns on the next
  identical call instead of re-running the steps. The trace stays narratable
  (flowEnter/flowExit still fire, plus an info "memo hit" step); failures
  are never memoized, and different args miss. The memo table defaults to
  per-`runScenario` call — pass one `memoStore` (a `FlowMemoStore` Map) to
  several `runScenario` calls to share login-type flows across the
  scenarios of a run. Note: replay assumes the flow's UI side effects (e.g.
  an authenticated session) still hold; that judgment stays with the author
  who opts a flow into memoization.

**Keyword→policy mapping**: given-like → `ui` (setup), when-like → `ui`
(action), then-like → `verify` (fail-closed), soft variants → `soft`
(warn-only), advisory → `agent`.

The executor `runScenario()` mirrors `runCase()`'s contract (same
`CaseResult` shape plus a `variables` table; gating failures stop the flow,
soft failures only warn) and reuses `runNode` directly, so the
`GeneralAgentAdapter`, custom runtime nodes, context assembly and verdict
fail-closed semantics are all the engine's existing behavior.

## JS/TS front-end (`src/frontends/js/`)

```ts
import {
  defineFlow, scenario, feature, createFlowRegistry,
  Given, When, Then, Soft, remember, callFlow,
} from '@midscene/testing-framework';

const login = defineFlow({
  name: 'Login',
  params: ['role'],
  returns: ['greeting'],
  steps: [
    When('I open the login page'),
    When('I sign in as the "{role}" user'),
    remember('the greeting shown in the header', 'greeting'),
  ],
});

const checkout = scenario('Checkout as admin', [
  Given('the demo shop is open on the home page'),
  callFlow('Login', { role: 'admin' }),
  remember('the price of the "Trail Backpack" product', 'price'),
  'I add the "Trail Backpack" to the cart',          // bare string = When
  Then('the cart total equals {price}'),
]);
```

Keyword helpers are capitalized like cucumber-js (also: a lowercase `then`
export would make the module namespace a thenable and break dynamic
`import()`). Everything is plain JS values, so dynamic authoring (mapping
over data, computed args, build-time conditionals) just works —
`defineFlow` additionally runs cheap static scoping checks.

`feature(name, scenarios, flows)` returns the same
`{ name, scenarios, flows }` shape as the Gherkin compiler
(`CompiledFeature` is an alias of `FeatureIR`), so both front-ends hand
callers an identical bundle: build a registry from `.flows`, run
`.scenarios`.

## Gherkin front-end (`src/frontends/gherkin/`)

`.feature` files are parsed with `@cucumber/gherkin` and compiled through
its **pickles** API, so Scenario Outline expansion (example values
substituted into step text), Background merging and tag inheritance come for
free. Conventions on top:

- `Given`/`When`/`Then`/`And`/`But` map per the policy table; pickle step
  types already resolve And/But to the last primary keyword;
- `@soft` tag on a scenario turns its `Then` steps into `soft` nodes;
- `I remember <description> as "varName"` → capture step;
- `I run the "FlowName" flow with role "admin" and region "eu"` → flow
  invocation;
- a Scenario tagged `@flow` is registered as a flow definition instead of a
  runnable scenario; params/returns are tags: `@param:role`,
  `@returns:greeting`. Background steps are excluded from `@flow` pickles so
  a reusable flow never replays the feature's setup.

**Multi-file suites** (`suite.ts`): real suites keep shared flows in their
own `.feature` files and call them from separate test modules.
`compileSuite(dirOrFiles)` compiles every `.feature` under a directory (or
an explicit file list), merges ALL `@flow` definitions into **one**
`FlowRegistry` — duplicate flow names across files throw, naming both
definition sites — and returns the compiled modules so each module's
scenarios run against the shared registry. Flow names are suite-global.

## Hybrid mode: `bindFeature` (`src/frontends/js/bind-feature.ts`)

Modeled on jest-cucumber's inverted binding (JS attaches to a loaded
`.feature` and the two are validated to stay in sync), with one deliberate
difference: jest-cucumber must mirror *every* step in JS because steps need
somewhere to put code. AI execution removes that need, so the overlay is
**sparse** — Gherkin stays the source of truth and unmentioned
scenarios/steps run as pure Gherkin, no restatement required.

```ts
import { bindFeature } from '@midscene/testing-framework';

const bound = bindFeature('features/checkout.feature', {
  scenarios: {
    'Checkout as admin': {
      vars: { couponCode: computeCoupon() },          // inject computed variables
      steps: [
        {
          at: 'Add product to cart',                  // a flow call, anchored by name
          after: ['apply the coupon code {couponCode} in the cart'], // insert
        },
        {
          at: 'the cart total equals {price}',
          node: 'soft',                                // override node kind
          template: 'the cart total roughly equals {price}', // override prompt
        },
        { at: 'Login', args: { role: 'auditor' } },    // adjust flow-call args
      ],
    },
    'Promo banner is advisory': { skip: true },        // per-scenario config
  },
});
// bound: CompiledFeature — same shape as compileFeature(), run via runScenario.
```

Binding glue is **title + anchor**: scenarios are keyed by title (a Scenario
Outline title patches every expansion), steps by exact anchor text (prompt
template, capture description, or flow name) or by index. Anchors always
resolve against the *original* step list, so inserts never shift one
another, and each step may be targeted by **at most one** overlay entry —
two entries anchoring the same step throw at bind time instead of merging
silently. `template`/`node` apply to prompt steps, `template` to captures,
`args` to flow calls — mismatches fail at bind time.

**Drift validation with codegen**: every overlay reference is checked at
bind/compile time, never at execution time. An overlay pointing at a renamed
scenario or step throws an error that names the closest match
("Did you mean …?") and pastes a ready-to-use starter overlay listing every
real anchor — jest-cucumber's best trick, applied to a sparse overlay:

```
[midscene] bindFeature(checkout.feature): scenario "Checkout as admin" has no
step matching anchor "the cart total equals {prce}".
Did you mean "the cart total equals {price}"?
Available anchors:

scenarios: {
  "Checkout as admin": {
    steps: [
      { at: "the demo shop is open on the home page" },  // 0: ui node
      { at: "Login" },                                   // 1: flow call Login(role)
      ...
```

### Choosing a mode

| Mode | Use when |
| --- | --- |
| Pure Gherkin (`compileFeature`) | Non-engineers own the suite; no computed values or per-env tweaks needed. |
| Pure JS (`defineFlow`/`scenario`) | The suite is generated or heavily dynamic (loops, conditionals, computed prompts); no BDD stakeholders. |
| Bound overlay (`bindFeature`) | Gherkin is the shared source of truth, but a few scenarios need computed variables, env-specific arg tweaks, inserted steps, or skip/only flags — without forking the feature file or restating it in JS. |

## Example: one suite, three style folders

The example (`example/`, orientation in `example/README.md`) is a
**multi-file suite** authored three times — one folder per style, all
running against the static shop in `example/demo-app/`:

```text
example/
  style-1-gherkin/          # pure Gherkin
    flows/                  #   SHARED flow definitions (@flow scenarios):
      login.feature         #     "Login" (@param:role @returns:greeting)
      add-to-cart.feature   #     "Add product to cart" (@param:product @returns:price)
    features/               #   independent test modules that CALL the shared
      cart.feature          #   flows without defining them (cross-file
      checkout.feature      #   resolution via compileSuite's merged registry)
      smoke.feature
  style-2-js/               # the SAME suite in the fluent JS API
    flows/index.ts          #   defineFlow() twins + the shared registry
    features/*.flows.ts     #   one module per .feature twin
  style-3-overlay/          # hybrid: binds style-1's checkout.feature
    checkout.overlay.ts     #   sparse patch (computed coupon, soft override,
                            #   skip) — nothing duplicated from the .feature
```

The reuse story is the point: flows are written once (login,
add-to-cart) and composed by every test module — the cart module inspects
quantities/badges, the checkout module asserts totals, the smoke module is
a per-role login matrix (Scenario Outline vs `roles.map(...)`). The tests
in `tests/unit-test/example-parity.test.ts` prove styles 1 and 2 compile to
the same IR and produce identical execution traces (same prompts to the UI
agent, same verify prompts to the general agent, same final variable
table); `tests/unit-test/suite.test.ts` covers `compileSuite` assembly
(cross-file flow calls, duplicate-name errors).

Run programmatically (no CLI wiring yet):

```ts
import { compileSuite, runScenario } from '@midscene/testing-framework';

const { modules, registry } = compileSuite('example/style-1-gherkin');
for (const { feature } of modules) {
  for (const s of feature.scenarios) {
    const result = await runScenario({ scenario: s, registry, uiAgent, generalAgent });
  }
}
```

## Validation

- `pnpm --filter @midscene/testing-framework test` — 125 tests, all green
  (across `flow-ir.test.ts`, `js-frontend.test.ts`,
  `gherkin-frontend.test.ts`, `suite.test.ts`, `run-scenario.test.ts`,
  `bind-feature.test.ts`, `example-parity.test.ts` and the Phase 0 suites;
  fakes only, no browsers / no model calls).

## Open questions / next steps

- **Runner integration**: `runAll` / the CLI only discover `*.yaml`. Wire
  `.feature` and `*.flows.ts` discovery into `discoverCases` + `runScenario`
  so both surfaces run via `midscene-tf run`.
- **Typed captures**: `capture` always extracts strings (`aiString`); add
  number/boolean/structured (`aiQuery`) tiers and maybe a declared type in
  the "remember" convention.
- **Memo safety**: `once-per-run` is implemented (see Named flows above),
  but replay trusts that the flow's UI side effects still hold. Decide
  whether some flows need a cheap "still valid?" probe before replaying
  (e.g. a session check for login flows).
- **Flow-call reporting**: inner flow steps are flattened into the case's
  step list after an `info` "Entering flow …" marker; reports may want a
  nested view instead.
- **Cross-file flow registries**: `compileSuite` solves this for Gherkin
  (one merged registry per suite directory); JS suites share a registry by
  importing one module. Still open: a *mixed* project-level registry
  (config field or glob that merges `.feature` @flows AND `*.flows.ts`
  definitions into one registry for both surfaces).
- **Gherkin arg syntax**: the `with key "value" and key "value"` convention
  is regex-based; data tables (`PickleStepArgument`) would be a more
  Gherkin-native way to pass args (and to seed variables).
- **Variable channel vs prose**: verify nodes still see capture steps in the
  assembled context (as past-step outputs). That is intentional (the agent
  may ground its verdict), but worth revisiting if it blurs the
  machine/model ownership line.
- **Overlay scope**: `bindFeature` overlays target runnable scenarios only;
  `@flow` definitions are deliberately not overlayable (a flow is shared by
  many call sites, so a per-feature patch would act at a distance). If the
  need is real, a separate `flows:` overlay section with explicit semantics
  is the way in.
- **Anchor identity for prompts**: text anchors match the compiled anchor
  text (prompt template / capture description / flow name), not the raw
  Gherkin line — e.g. anchoring a `remember` step means anchoring its
  description, and outline-expanded steps must be anchored by the expanded
  text (or index). Keeping the original pickle text on IR steps would let
  anchors match the literal `.feature` line instead.
- **skip/only enforcement**: `scenario.config` is attached at the IR level
  but nothing consumes it until runner integration lands.
