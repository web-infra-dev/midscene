/**
 * Parity check for the two example authoring surfaces: the Gherkin feature
 * (example/flows/shop.feature) and its JS counterpart
 * (example/flows/shop.flows.ts) must compile to equivalent IR and produce the
 * same execution trace against the same fake agents.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkoutAsAdmin,
  loginFlow,
  registry,
  shopFeature,
} from '../../example/flows/shop.flows';
import { createFlowRegistry, runScenario } from '../../src/flow-ir';
import type { ScenarioIR } from '../../src/flow-ir';
import type { FlowRegistry } from '../../src/flow-ir';
import { compileFeatureFile } from '../../src/frontends/gherkin';
import { FakeGeneralAgent, FakeUiAgent } from './helpers/fake-agents';

const FEATURE_FILE = join(__dirname, '../../example/flows/shop.feature');
const gherkin = compileFeatureFile(FEATURE_FILE);

describe('example overlay: shop.overlay.ts binds without drift', () => {
  it('applies the sparse overlay on top of the plain compile', async () => {
    const { bound } = await import('../../example/flows/shop.overlay');
    const checkout = bound.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    );
    expect(checkout?.vars?.couponCode).toMatch(/^E2E-\d{4}-\d{2}-\d{2}$/);
    expect(
      checkout?.steps.some(
        (s) =>
          s.kind === 'prompt' &&
          s.template === 'apply the coupon code {couponCode} in the cart',
      ),
    ).toBe(true);
    expect(checkout?.steps.at(-2)).toMatchObject({ node: 'soft' });
    expect(
      bound.scenarios.find((s) => s.name === 'Promo banner is advisory')
        ?.config,
    ).toEqual({ skip: true });
    // Sparse: the outline-expanded scenarios are untouched pure Gherkin.
    expect(
      bound.scenarios.filter((s) => s.name === 'Login greets every role'),
    ).toEqual(
      gherkin.scenarios.filter((s) => s.name === 'Login greets every role'),
    );
  });
});

describe('example parity: Gherkin vs JS front-end', () => {
  it('compiles the same Login flow signature', () => {
    expect(gherkin.flows).toHaveLength(1);
    const gherkinLogin = gherkin.flows[0];
    expect(gherkinLogin.name).toBe(loginFlow.name);
    expect(gherkinLogin.params).toEqual(loginFlow.params);
    expect(gherkinLogin.returns).toEqual(loginFlow.returns);
    // Background steps are excluded from @flow pickles, so the two surfaces
    // compile to the exact same flow body.
    expect(gherkinLogin.steps).toEqual(loginFlow.steps);
  });

  it('compiles the same checkout scenario steps', () => {
    const gherkinCheckout = gherkin.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    );
    expect(gherkinCheckout).toBeDefined();
    expect(gherkinCheckout?.steps).toEqual(checkoutAsAdmin.steps);
  });

  it('expands the outline to the same per-role scenarios as the JS map()', () => {
    const gherkinRoles = gherkin.scenarios
      .filter((s) => s.name === 'Login greets every role')
      .map((s) => s.steps);
    const jsRoles = shopFeature.scenarios
      .filter((s) => s.name.startsWith('Login greets every role'))
      .map((s) => s.steps);
    expect(gherkinRoles).toEqual(jsRoles);
  });

  it('produces identical execution traces through the shared IR executor', async () => {
    const gherkinCheckout = gherkin.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    ) as ScenarioIR;

    const runWith = async (s: ScenarioIR, reg: FlowRegistry) => {
      const ui = new FakeUiAgent(['Hello, Admin!', '129.00']);
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

    const fromGherkin = await runWith(
      gherkinCheckout,
      createFlowRegistry(gherkin.flows),
    );
    const fromJs = await runWith(checkoutAsAdmin, registry);

    // Same prompts hit the "models", same variables end up in the table.
    expect(fromGherkin.actCalls).toEqual(fromJs.actCalls);
    expect(fromGherkin.stringCalls).toEqual(fromJs.stringCalls);
    expect(fromGherkin.verifyPrompts).toEqual(fromJs.verifyPrompts);
    expect(fromGherkin.variables).toEqual(fromJs.variables);
    expect(fromGherkin.status).toBe('passed');
    expect(fromJs.status).toBe('passed');
    expect(fromJs.verifyPrompts).toContain('the cart total equals 129.00');
  });
});
