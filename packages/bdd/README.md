# @midscene/bdd

AI-native BDD: standard Gherkin, executed by AI instead of step-definition code.

## What is this

`@midscene/bdd` runs ordinary Gherkin feature files through cucumber-js, but instead of requiring you to implement a step definition for every line, each statement is executed by [Midscene](https://midscenejs.com)'s vision agent. Given/When steps are performed against the live page via `aiAct`; Then steps are judged via `aiAssert`, which is fail-closed — if the model cannot confirm the assertion, the step fails. You write the behavior; the agent does the driving. Classic callbacks and a general-purpose coding agent remain available as per-statement opt-ins.

```gherkin
Feature: Cart inspection

  Scenario: Cart shows quantity controls and the correct total
    Given I am logged in as "guest"
    And I have added "Camp Mug" to the cart
    When I open the cart page
    Then the cart line item shows quantity controls to increase and decrease the quantity
    And the cart total equals <price>
```

No step definitions exist for this scenario. The first two lines call reusable Gherkin-authored flows (see below), `<price>` is a runtime variable returned by the add-to-cart flow, and every other line is performed or verified by the vision agent directly.

## The three routing rules

Every statement is routed to exactly one executor:

| Rule | Marker | Who executes the statement |
| --- | --- | --- |
| **Default** | none | Midscene UI agent — the vision model drives the page (`aiAct`) for Given/When and judges Then steps (`aiAssert`, fail-closed) |
| **Agent** | `# @agent` comment directly above the line, or a `$skill-name` token in it | A general-purpose coding agent (Codex app-server via `codex login`, or any OpenAI-compatible endpoint) — for behavior you cannot see in the browser: server logs, files, databases. Then steps must return a JSON verdict; a missing verdict fails (fail-closed) |
| **No AI** | `# @no-ai` comment above the line (or `@no-ai` scenario/feature tag) | Classic BDD: a callback registered with `Given`/`When`/`Then`/`defineStep` from `@midscene/bdd` must match. An unimplemented step fails with a ready-to-paste snippet |

All three in one scenario:

```gherkin
Feature: Failed login reporting

  Scenario: Failed login is reported everywhere
    Given the demo shop is open on the login page
    When I try to sign in as the "admin" user with a wrong password
    Then an error toast shows on the screen
    # @agent
    Then the server log contains a failed-login warning, per $check-logs
    # @no-ai
    Then the login attempt counter increments
```

The first three lines run through Midscene against the page. The fourth bails out to the coding agent, loading the `check-logs` skill into its prompt. The last requires a registered callback:

```js
// features/step_definitions/counters.steps.js
const { defineStep } = require('@midscene/bdd');

defineStep('the login attempt counter increments', async () => {
  // deterministic check — no AI involved; throw to fail the step
});
```

If no callback matches a `@no-ai` step, the run fails with a `defineStep(...)` snippet generated from the step text (quoted values become `{string}` parameters), ready to paste.

## Reusable flows: step definitions authored in Gherkin

A flow is a scenario tagged `@flow` whose **name is a cucumber expression**. Any other scenario can then call it as a plain step:

```gherkin
# features/flows/login.feature
Feature: Shared login flow

  @flow @param:role @returns:greeting
  Scenario: I am logged in as {string}
    When I open the login page
    And I sign in as the "<role>" user with the correct password
    Then the dashboard for the "<role>" role is visible
    And I remember the greeting message in the header as "greeting"
```

```gherkin
# any other feature file
Given I am logged in as "admin"
```

- `@param:role` binds the expression's `{string}` capture to the runtime variable `<role>` inside the flow. Multiple `@param:` tags bind captures positionally, in tag order. A capture/param count mismatch is an error.
- Each call gets a **fresh variable scope** seeded only with the call arguments; only variables declared via `@returns:` flow back to the caller (here, `<greeting>`). A declared return that was never captured is an error.
- Flows may call other flows, capped at depth 2.
- Flows are discovered across all files matched by the features glob — define once, call from any feature.
- The base cucumber profile excludes `@flow` scenarios from standalone runs (`tags: 'not @flow'`); they only execute when called.
- Two flows matching the same step text is an ambiguity error listing both definitions, mirroring cucumber's ambiguous-step behavior.

There is also a literal sugar form, useful when the flow name would read awkwardly inline:

```gherkin
Given I run the "I am logged in as {string}" flow with role "admin"
```

Arguments are `name "value"` pairs; unknown or missing argument names are errors.

## Variables

Capture a value from the screen with the built-in remember statement:

```gherkin
And I remember the price of "Trail Backpack" as "price"
Then the cart total equals <price> minus a 10% discount
```

`I remember <description> as "name"` extracts the described value via structured extraction (`aiString`) and stores it in the scenario's variable scope. Later steps reference it as `<price>` — the same placeholder visual as a Scenario Outline, deliberately: Outline placeholders are substituted by Gherkin at compile time, so any identifier-shaped `<name>` left at runtime is by definition a runtime variable.

Substitution is mechanical and happens before routing — the model never sees a placeholder, only the resolved text. Referencing an unknown variable fails fast with the list of known variables. Empty extractions fail by default (`capture.failOnEmpty`).

## Skills

Skills are markdown instruction files for the general agent, discovered in the skills directory (default `features/skills`):

```
features/skills/check-logs.md        # flat layout
features/skills/check-logs/SKILL.md  # folder layout
```

Referencing `$check-logs` in a step (or in its annotation comment) routes the statement to the general agent and appends the markdown content to its prompt. Referencing a skill that does not exist fails with the list of available skill names; the same name in both layouts is an error.

## Quick start

Folder layout:

```
midscene.config.ts
cucumber.js
features/
  *.feature
  step_definitions/   # classic callbacks for @no-ai steps (optional)
  skills/             # markdown skills for $tokens (optional)
```

`midscene.config.ts`:

```ts
import { defineBddConfig } from '@midscene/bdd';

export default defineBddConfig({
  uiAgent: { type: 'web', url: 'http://localhost:3000' },
});
```

`cucumber.js` — the entire file is one line:

```js
module.exports = require('@midscene/bdd/profile').defineProfile();
```

Model setup, either:

- `codex login` once, then point the general agent at it with `MIDSCENE_MODEL_BASE_URL=codex://app-server`, or
- set the `MIDSCENE_MODEL_*` environment variables for any OpenAI-compatible endpoint (at minimum `MIDSCENE_MODEL_BASE_URL`, `MIDSCENE_MODEL_API_KEY`, `MIDSCENE_MODEL_NAME`).

Run:

```bash
npx cucumber-js     # uses cucumber.js -> the @midscene/bdd profile
# or
npx midscene-bdd    # zero-config launcher; injects the same preset when no cucumber config exists
```

A runnable end-to-end demo (static shop page, all three routing rules, flows, variables, skills) lives in [`example/`](./example/README.md).

## Configuration reference

`defineBddConfig` validates eagerly, so config mistakes fail at definition time.

```ts
interface BddConfig {
  // Web target (puppeteer launcher) — or a factory for any platform:
  // () => Promise<{ agent: UiAgent; cleanup?: () => Promise<void> }>
  // The factory escape hatch lets you plug in any Midscene agent
  // (Android, iOS, your own) instead of the built-in web launcher.
  uiAgent: WebUiTarget | UiAgentFactory;

  generalAgent?: {
    // MIDSCENE_MODEL_* overrides for the general agent, resolved in an
    // isolated model config (never leaks into the UI agent). Defaults to
    // process env; MIDSCENE_MODEL_BASE_URL=codex://app-server is supported.
    modelEnv?: Record<string, string>;
    // Escape hatch mirroring the uiAgent factory (e.g. for tests).
    factory?: () => Promise<GeneralAgent>;
  };

  paths?: {
    // Feature globs, relative to the config dir. Used for flow discovery.
    features?: string[];          // default: ['features/**/*.feature']
    skills?: string;              // default: 'features/skills'
  };

  capture?: {
    // Throw when `I remember ...` extracts an empty value.
    failOnEmpty?: boolean;        // default: true
  };
}

interface WebUiTarget {
  type: 'web';
  url: string;
  headed?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  userAgent?: string;
}
```

The config file is loaded from `midscene.config.ts` in the working directory (TypeScript works at runtime, via jiti); override the location with the `MIDSCENE_BDD_CONFIG` environment variable.

`defineProfile(overrides?)` merges overrides onto the base cucumber profile: `import` and `format` are concatenated and deduped, `paths` replaces, `tags` combines as `(not @flow) and (<yours>)` so flow scenarios never run standalone, and any other keys are spread on top.

## Conventions

Everything cucumber gives you keeps working — this package adds exactly three extensions:

| | Mechanism | Prior art / rationale |
| --- | --- | --- |
| **100% standard** | `Background`, `Scenario Outline` + `Examples`, `Rule`, tags, data tables, doc strings, hooks, formatters, parallel workers, tag expressions, `cucumber.js` profiles | Plain cucumber-js — this package is one catch-all step definition plus a config preset |
| **Extension 1** | `# @agent` / `# @no-ai` / `# @soft` comment lines directly above a step | Gherkin has no step-level tags, so per-step routing lives in comment annotations (the established workaround in the Gherkin ecosystem) |
| **Extension 2** | `$skill-name` tokens in step text | Shell-style `$` references; a token both routes the statement to the general agent and loads the skill |
| **Extension 3** | `@flow` / `@param:x` / `@returns:x` scenario tags | Karate's `call` model for reusable sub-scenarios, expressed through standard Gherkin tags |

Data tables and doc strings on AI-routed steps are appended to the prompt verbatim. `@no-ai` and `@soft` may also be applied as ordinary scenario/feature tags (inherited per normal Gherkin semantics); `@agent` is deliberately per-line only.

Callback registration is the standard cucumber shape — `Given`/`When`/`Then` take `(pattern, fn)` where `pattern` is a cucumber expression string or a RegExp, captures arrive as function arguments, and the world is `this`. Per cucumber convention the keyword is documentation only: matching ignores it, and `defineStep` is the keyword-agnostic alias.

## How it works

cucumber-js drives the run; `@midscene/bdd/register` contributes a single catch-all step definition that routes every statement, in strict precedence order:

```mermaid
flowchart TD
    S[Statement<br/>vars substituted] --> A{"# @no-ai?"}
    A -- yes --> CB[registered callback<br/>or fail with snippet]
    A -- no --> B{"# @agent or $skill?"}
    B -- yes --> GA[general coding agent<br/>Then needs JSON verdict, fail-closed]
    B -- no --> C{matches a @flow?}
    C -- yes --> FL[execute flow steps<br/>fresh scope, depth ≤ 2]
    C -- no --> D{"I remember ... as ...?"}
    D -- yes --> CAP[aiString capture into vars]
    D -- no --> E{step type}
    E -- Then --> AS[aiAssert — fail-closed]
    E -- Given / When --> ACT[aiAct]
```

- **Soft checks:** `# @soft` above a Then step (or a `@soft` tag) downgrades an assertion failure to a logged warning attached to the report — the step never fails. There is no native cucumber "soft" status, so the scenario stays green by design.
- **Outlines:** a Scenario Outline's pickle steps point at the outline's step node, so an annotation comment above an outline step applies to every Examples row.
- **Laziness:** the browser launches only when the first UI-routed step runs, and the general agent connects only on the first `@agent`/`$skill` step. The general agent receives the current page screenshot only if a UI session already exists — it never launches a browser.

## Status

Experimental, private package — not yet published to npm, APIs may change without notice. Design lineage: the proof of concept in [PR #2639](https://github.com/web-infra-dev/midscene/pull/2639).
