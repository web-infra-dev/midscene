# POC: Two authoring front-ends over one shared flow-IR

This POC extends the Phase 0 framework with composable, reusable "prompt
flows" authored in **two surfaces** — a fluent JS/TS API and Gherkin
`.feature` files — that compile to **one shared intermediate representation
(flow-IR)**, which in turn lowers onto the existing engine node kinds
(`ui` / `verify` / `soft` / `agent`). No step-definition code anywhere: every
step is natural language executed by the AI agents. A third, **hybrid** mode
(`bindFeature`) layers a sparse JS overlay over a `.feature` file.

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
fail the step immediately (typo safety) without a model call. Model-owned
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
- `memo: 'once-per-run'` is accepted but stubbed (TODO in
  `run-scenario.ts`).

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

## Hybrid mode: `bindFeature` (`src/frontends/js/bind-feature.ts`)

Modeled on jest-cucumber's inverted binding (JS attaches to a loaded
`.feature` and the two are validated to stay in sync), with one deliberate
difference: jest-cucumber must mirror *every* step in JS because steps need
somewhere to put code. AI execution removes that need, so the overlay is
**sparse** — Gherkin stays the source of truth and unmentioned
scenarios/steps run as pure Gherkin, no restatement required.

```ts
import { bindFeature } from '@midscene/testing-framework';

const bound = bindFeature('flows/shop.feature', {
  scenarios: {
    'Checkout as admin': {
      vars: { couponCode: computeCoupon() },          // inject computed variables
      steps: [
        {
          at: 'I add the "Trail Backpack" to the cart and open the cart',
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
another. `template`/`node` apply to prompt steps, `template` to captures,
`args` to flow calls — mismatches fail at bind time.

**Drift validation with codegen**: every overlay reference is checked at
bind/compile time, never at execution time. An overlay pointing at a renamed
scenario or step throws an error that names the closest match
("Did you mean …?") and pastes a ready-to-use starter overlay listing every
real anchor — jest-cucumber's best trick, applied to a sparse overlay:

```
[midscene] bindFeature(shop.feature): scenario "Checkout as admin" has no
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

## Example

`example/flows/shop.feature` and `example/flows/shop.flows.ts` author the
same suite — a `Login` flow reused by a checkout scenario, a `@soft` promo
check, and a per-role login matrix (Scenario Outline vs `roles.map(...)`).
The test `tests/unit-test/example-parity.test.ts` proves both compile to the
same IR and produce identical execution traces (same prompts to the UI
agent, same verify prompts to the general agent, same final variable table)
through the shared executor.

`example/flows/shop.overlay.ts` shows the hybrid mode on the same feature: a
computed coupon code injected into the checkout scenario's variable table,
an inserted "apply the coupon" step that uses it, the exact-total verify
downgraded to a reworded soft check, and the promo scenario skipped — while
the login-matrix scenarios stay untouched pure Gherkin.

Run programmatically (no CLI wiring yet):

```ts
import { compileFeatureFile, createFlowRegistry, runScenario } from '@midscene/testing-framework';

const { scenarios, flows } = compileFeatureFile('flows/shop.feature');
const registry = createFlowRegistry(flows);
for (const s of scenarios) {
  const result = await runScenario({ scenario: s, registry, uiAgent, generalAgent });
}
```

## Validation

- `pnpm --filter @midscene/testing-framework test` — 100 tests, all green
  (63 new across `flow-ir.test.ts`, `js-frontend.test.ts`,
  `gherkin-frontend.test.ts`, `run-scenario.test.ts`, `bind-feature.test.ts`,
  `example-parity.test.ts`; fakes only, no browsers / no model calls).

## Open questions / next steps

- **Runner integration**: `runAll` / the CLI only discover `*.yaml`. Wire
  `.feature` and `*.flows.ts` discovery into `discoverCases` + `runScenario`
  so both surfaces run via `midscene-tf run`.
- **Typed captures**: `capture` always extracts strings (`aiString`); add
  number/boolean/structured (`aiQuery`) tiers and maybe a declared type in
  the "remember" convention.
- **Memoization**: implement `once-per-run` (memo table keyed by flow name +
  resolved args, replaying returns) — useful for login-type flows; decide
  whether UI state divergence makes replay unsafe by default.
- **Flow-call reporting**: inner flow steps are flattened into the case's
  step list after an `info` "Entering flow …" marker; reports may want a
  nested view instead.
- **Cross-file flow registries**: today a registry is built per
  feature/module; decide on project-level registration (config field, glob
  for `*.flows.ts`, shared between Gherkin and JS suites).
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
