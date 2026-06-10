/**
 * Parity checks for the example's three authoring styles: the multi-file
 * Gherkin suite (example/style-1-gherkin), its JS twin (example/style-2-js)
 * and the sparse overlay (example/style-3-overlay) must compile to
 * equivalent IR and produce the same execution traces against the same fake
 * agents.
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cartFeature } from '../../example/style-2-js/features/cart.flows';
import { checkoutFeature } from '../../example/style-2-js/features/checkout.flows';
import { smokeFeature } from '../../example/style-2-js/features/smoke.flows';
import {
  addToCartFlow,
  registry as jsRegistry,
  loginFlow,
} from '../../example/style-2-js/flows';
import { runScenario } from '../../src/flow-ir';
import type { FlowRegistry, ScenarioIR } from '../../src/flow-ir';
import { compileSuite } from '../../src/frontends/gherkin';
import { FakeGeneralAgent, FakeUiAgent } from './helpers/fake-agents';

const STYLE1_DIR = join(__dirname, '../../example/style-1-gherkin');
const suite = compileSuite(STYLE1_DIR);

const featureByFile = (suffix: string) => {
  const module = suite.modules.find((m) =>
    relative(STYLE1_DIR, m.file).endsWith(suffix),
  );
  if (!module) throw new Error(`module ${suffix} not found in the suite`);
  return module.feature;
};

describe('example suite: style-1 Gherkin assembles as one suite', () => {
  it('discovers all modules in deterministic order', () => {
    expect(suite.modules.map((m) => relative(STYLE1_DIR, m.file))).toEqual([
      'features/cart.feature',
      'features/checkout.feature',
      'features/smoke.feature',
      'flows/add-to-cart.feature',
      'flows/login.feature',
    ]);
  });

  it('merges the shared flows from the flow files into one registry', () => {
    expect(suite.registry.has('Login')).toBe(true);
    expect(suite.registry.has('Add product to cart')).toBe(true);
    // Test modules define no flows of their own.
    for (const suffix of [
      'features/cart.feature',
      'features/checkout.feature',
      'features/smoke.feature',
    ]) {
      expect(featureByFile(suffix).flows).toEqual([]);
    }
  });
});

describe('example parity: Gherkin vs JS front-end', () => {
  it('compiles the same shared flow signatures and bodies', () => {
    const gherkinLogin = suite.registry.get('Login');
    expect(gherkinLogin.params).toEqual(loginFlow.params);
    expect(gherkinLogin.returns).toEqual(loginFlow.returns);
    expect(gherkinLogin.steps).toEqual(loginFlow.steps);

    const gherkinCart = suite.registry.get('Add product to cart');
    expect(gherkinCart.params).toEqual(addToCartFlow.params);
    expect(gherkinCart.returns).toEqual(addToCartFlow.returns);
    expect(gherkinCart.steps).toEqual(addToCartFlow.steps);
  });

  it('compiles the same scenario steps in every test module', () => {
    const twins: Array<[string, typeof cartFeature]> = [
      ['features/cart.feature', cartFeature],
      ['features/checkout.feature', checkoutFeature],
      ['features/smoke.feature', smokeFeature],
    ];
    for (const [suffix, jsFeature] of twins) {
      const gherkin = featureByFile(suffix);
      expect(gherkin.scenarios.map((s) => s.steps)).toEqual(
        jsFeature.scenarios.map((s) => s.steps),
      );
    }
  });

  it('runs a cart scenario via flows defined in OTHER files, with identical traces', async () => {
    const gherkinScenario = featureByFile('features/cart.feature').scenarios[0];
    const jsScenario = cartFeature.scenarios[0];

    const runWith = async (s: ScenarioIR, reg: FlowRegistry) => {
      const ui = new FakeUiAgent(['Hello, Guest!', '$24.50']);
      const general = new FakeGeneralAgent();
      const result = await runScenario({
        scenario: s,
        registry: reg,
        uiAgent: ui,
        generalAgent: general,
      });
      return {
        status: result.status,
        variables: result.variables,
        actCalls: ui.actCalls,
        stringCalls: ui.stringCalls,
        verifyPrompts: general.calls.map((c) => c.instruction),
      };
    };

    const fromGherkin = await runWith(gherkinScenario, suite.registry);
    const fromJs = await runWith(jsScenario, jsRegistry);

    // Same prompts hit the "models", same variables end up in the table.
    expect(fromGherkin).toEqual(fromJs);
    expect(fromGherkin.status).toBe('passed');
    // The flow's declared return crossed file boundaries into the scenario.
    expect(fromGherkin.variables.price).toBe('$24.50');
    expect(fromGherkin.verifyPrompts).toContain(
      'the cart lists "Camp Mug" with quantity 1 at $24.50',
    );
  });
});

describe('example overlay: style-3 binds style-1 without drift', () => {
  it('applies the sparse overlay on top of the plain compile', async () => {
    const { bound } = await import(
      '../../example/style-3-overlay/checkout.overlay'
    );
    const plain = featureByFile('features/checkout.feature');

    const checkout = bound.scenarios.find(
      (s: ScenarioIR) => s.name === 'Checkout as admin',
    );
    expect(checkout?.vars?.couponCode).toMatch(/^E2E-\d{4}-\d{2}-\d{2}$/);

    // The coupon step is inserted directly after the anchored flow call.
    const flowCallIndex = checkout?.steps.findIndex(
      (s) => s.kind === 'callFlow' && s.flowName === 'Add product to cart',
    );
    expect(flowCallIndex).toBeGreaterThanOrEqual(0);
    expect(checkout?.steps[(flowCallIndex ?? 0) + 1]).toMatchObject({
      kind: 'prompt',
      node: 'ui',
      template: 'apply the coupon code {couponCode} in the cart',
    });

    // The exact-total verify is reworded and downgraded to soft.
    expect(checkout?.steps.at(-2)).toMatchObject({
      node: 'soft',
      template:
        'the cart total equals {price} minus the "{couponCode}" coupon discount',
    });

    // Per-scenario config and sparseness: the promo scenario is skipped,
    // and the overlay defines no flows (it reuses the suite registry).
    expect(
      bound.scenarios.find(
        (s: ScenarioIR) => s.name === 'Promo banner is advisory',
      )?.config,
    ).toEqual({ skip: true });
    expect(bound.flows).toEqual(plain.flows);
  });
});
