/**
 * READ THIS FIRST (style 2: pure JS/TS).
 *
 * This folder authors the SAME suite as ../style-1-gherkin, in a fluent
 * typed API instead of .feature files. Both compile to the identical
 * flow-IR and run through the same executor — pick the surface, not the
 * semantics. There is still no step-definition code: every string below is
 * a natural-language prompt executed by AI agents.
 *
 * Concepts demonstrated here:
 *  - `defineFlow` declares a FLOW: a named, reusable, parameterized prompt
 *    sequence. A flow runs in a FRESH variable scope seeded only with its
 *    declared `params` (caller variables are invisible inside), and only
 *    the variables listed in `returns` flow back to the caller.
 *  - `remember(description, name)` is a CAPTURE step: the UI agent extracts
 *    the described value from the screen into the machine-owned variable
 *    table. Later prompts reference it as `{name}`, and the placeholder is
 *    substituted mechanically BEFORE any model sees the prompt — typos in
 *    `{placeholders}` fail immediately instead of confusing a model.
 *  - Keyword helpers map to runtime semantics: `Given`/`When` → UI actions,
 *    `Then` → fail-closed verify (a general agent must report a pass/fail
 *    verdict), `Soft` → warn-only check, `Advisory` → non-gating analysis.
 *
 * Cross-file reuse works exactly like the Gherkin side: flows live in this
 * one module, the scenario modules under ../features import nothing but the
 * suite registry built here. (In Gherkin, `compileSuite` does this merge.)
 */
import {
  type FlowDefIR,
  Then,
  When,
  createFlowRegistry,
  defineFlow,
  remember,
} from '@midscene/testing-framework';

/** Twin of style-1-gherkin/flows/login.feature. */
export const loginFlow = defineFlow({
  name: 'Login',
  params: ['role'],
  returns: ['greeting'],
  steps: [
    When('I open the login page'),
    When('I sign in as the "{role}" user with the saved test credentials'),
    Then('the dashboard for the "{role}" role is visible'),
    remember('the greeting message shown in the header', 'greeting'),
  ],
});

/** Twin of style-1-gherkin/flows/add-to-cart.feature. */
export const addToCartFlow = defineFlow({
  name: 'Add product to cart',
  params: ['product'],
  returns: ['price'],
  steps: [
    When('I go to the shop home page'),
    remember('the price of the "{product}" product', 'price'),
    When('I add the "{product}" to the cart and open the cart'),
  ],
});

export const sharedFlows: FlowDefIR[] = [loginFlow, addToCartFlow];

/** Suite-wide registry — every scenario module runs against this. */
export const registry = createFlowRegistry(sharedFlows);
