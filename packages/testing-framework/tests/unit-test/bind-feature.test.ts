import { describe, expect, it } from 'vitest';
import { createFlowRegistry, runScenario } from '../../src/flow-ir';
import { compileFeature } from '../../src/frontends/gherkin';
import { Soft, bindFeature, remember } from '../../src/frontends/js';
import { FakeGeneralAgent, FakeUiAgent } from './helpers/fake-agents';

const FEATURE = `
Feature: Checkout

  @flow @param:role @returns:greeting
  Scenario: Login
    When I sign in as the "{role}" user
    When I remember the greeting shown in the header as "greeting"

  Scenario: Checkout as admin
    When I run the "Login" flow with role "admin"
    And I remember the price of the "Trail Backpack" product as "price"
    When I add the "Trail Backpack" to the cart
    Then the cart total equals {price}

  Scenario: Browse anonymously
    When I open the catalog page
    Then the product grid is visible
`;

describe('bindFeature: parity and sparseness', () => {
  it('an empty (or omitted) overlay produces IR identical to the plain compile', () => {
    const plain = compileFeature(FEATURE, '<inline>');
    expect(bindFeature(FEATURE)).toEqual(plain);
    expect(bindFeature(FEATURE, {})).toEqual(plain);
    expect(bindFeature(FEATURE, { scenarios: {} })).toEqual(plain);
  });

  it('leaves unmentioned scenarios byte-identical to pure Gherkin', () => {
    const plain = compileFeature(FEATURE, '<inline>');
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Checkout as admin': { vars: { coupon: 'SAVE10' } },
      },
    });
    const untouched = bound.scenarios.find(
      (s) => s.name === 'Browse anonymously',
    );
    expect(untouched).toEqual(
      plain.scenarios.find((s) => s.name === 'Browse anonymously'),
    );
    // Flows are never touched by overlays.
    expect(bound.flows).toEqual(plain.flows);
  });
});

describe('bindFeature: overlay application', () => {
  it('overrides a step template and node kind by text anchor', () => {
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Checkout as admin': {
          steps: [
            {
              at: 'the cart total equals {price}',
              node: 'soft',
              template: 'the cart total equals {price} within $0.01',
            },
          ],
        },
      },
    });
    const checkout = bound.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    );
    expect(checkout?.steps.at(-1)).toEqual({
      kind: 'prompt',
      node: 'soft',
      role: 'assertion',
      template: 'the cart total equals {price} within $0.01',
    });
    // Earlier steps untouched.
    expect(checkout?.steps[0]).toMatchObject({ kind: 'callFlow' });
  });

  it('injects computed variables and flow-call args', () => {
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Checkout as admin': {
          vars: { coupon: 'SAVE10', qty: 2 },
          steps: [{ at: 'Login', args: { role: 'auditor' } }],
        },
      },
    });
    const checkout = bound.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    );
    expect(checkout?.vars).toEqual({ coupon: 'SAVE10', qty: '2' });
    expect(checkout?.steps[0]).toEqual({
      kind: 'callFlow',
      flowName: 'Login',
      args: { role: 'auditor' },
    });
  });

  it('inserts extra steps before/after anchored steps without shifting other anchors', () => {
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Checkout as admin': {
          steps: [
            {
              at: 'I add the "Trail Backpack" to the cart',
              before: [remember('the current cart badge count', 'badgeBefore')],
              after: ['apply the coupon code {coupon} in the cart'],
            },
            // Anchors resolve against the ORIGINAL list: this index is the
            // Then step pre-insertion.
            { at: 3, node: 'soft' },
          ],
        },
      },
    });
    const steps = bound.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    )?.steps;
    expect(steps?.map((s) => (s.kind === 'prompt' ? s.node : s.kind))).toEqual([
      'callFlow',
      'capture',
      'capture', // inserted before
      'ui',
      'ui', // inserted after (bare string → When)
      'soft', // index-anchored override of the original Then
    ]);
    expect(steps?.[4]).toMatchObject({
      template: 'apply the coupon code {coupon} in the cart',
      role: 'action',
    });
  });

  it('attaches per-scenario config flags at the IR level', () => {
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Browse anonymously': { skip: true },
        'Checkout as admin': { only: true },
      },
    });
    expect(
      bound.scenarios.find((s) => s.name === 'Browse anonymously')?.config,
    ).toEqual({ skip: true });
    expect(
      bound.scenarios.find((s) => s.name === 'Checkout as admin')?.config,
    ).toEqual({ only: true });
    // No config attached unless asked for.
    for (const s of bindFeature(FEATURE).scenarios) {
      expect(s.config).toBeUndefined();
    }
  });

  it('executes a bound scenario with overrides and injected vars (fake agents)', async () => {
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Checkout as admin': {
          vars: { coupon: 'SAVE10' },
          steps: [
            {
              at: 'I add the "Trail Backpack" to the cart',
              after: ['apply the coupon code {coupon} in the cart'],
            },
            { at: 'the cart total equals {price}', node: 'soft' },
          ],
        },
      },
    });
    const ui = new FakeUiAgent(['Hello, Admin!', '129.00']);
    const general = new FakeGeneralAgent(() => ({
      text: 'mismatch',
      verdict: { pass: false, reason: 'totals differ' },
    }));

    const checkout = bound.scenarios.find(
      (s) => s.name === 'Checkout as admin',
    );
    if (!checkout) throw new Error('scenario not found');
    const result = await runScenario({
      scenario: checkout,
      registry: createFlowRegistry(bound.flows),
      uiAgent: ui.asAgent(),
      generalAgent: general,
      env: {},
    });

    // Injected variable was substituted into the inserted step's prompt.
    expect(ui.actCalls).toContain('apply the coupon code SAVE10 in the cart');
    // The verify→soft override means the failing verdict only warns.
    expect(result.status).toBe('passed');
    expect(result.warnings[0]).toMatch(/totals differ/);
  });
});

describe('bindFeature: drift validation with codegen', () => {
  it('rejects unknown scenario titles with closest match and a starter overlay', () => {
    let error: Error | undefined;
    try {
      bindFeature(FEATURE, {
        scenarios: { 'Checkout as admn': { skip: true } },
      });
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toMatch(/unknown scenario "Checkout as admn"/);
    expect(error?.message).toMatch(/Did you mean "Checkout as admin"\?/);
    // Codegen: a ready-to-paste overlay skeleton with real anchors.
    expect(error?.message).toContain('"Checkout as admin": {');
    expect(error?.message).toContain(
      '{ at: "the cart total equals {price}" },',
    );
  });

  it('explains when the overlay targets a @flow definition', () => {
    expect(() =>
      bindFeature(FEATURE, { scenarios: { Login: { skip: true } } }),
    ).toThrow(/@flow definition; overlays only target runnable scenarios/);
  });

  it('rejects unknown step anchors with closest match and the anchor listing', () => {
    let error: Error | undefined;
    try {
      bindFeature(FEATURE, {
        scenarios: {
          'Checkout as admin': {
            steps: [{ at: 'the cart total equals {prce}', node: 'soft' }],
          },
        },
      });
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toMatch(/no step matches anchor/);
    expect(error?.message).toMatch(
      /Did you mean "the cart total equals \{price\}"\?/,
    );
    expect(error?.message).toContain('Available anchors:');
    expect(error?.message).toContain('// 0: flow call Login(role)');
  });

  it('rejects out-of-range index anchors', () => {
    expect(() =>
      bindFeature(FEATURE, {
        scenarios: {
          'Browse anonymously': { steps: [{ at: 9, node: 'soft' }] },
        },
      }),
    ).toThrow(/anchor 9 is out of range.*indices 0–1/s);
  });

  it('rejects ambiguous text anchors and suggests index anchors', () => {
    const duplicated = `
Feature: dup
  Scenario: twice
    When I click "Next"
    When I click "Next"
`;
    expect(() =>
      bindFeature(duplicated, {
        scenarios: {
          twice: { steps: [{ at: 'I click "Next"', template: 'x' }] },
        },
      }),
    ).toThrow(/ambiguous \(matches steps 0, 1\).*\{ at: 0 \}/s);
  });

  it('rejects overlay fields that do not fit the anchored step kind', () => {
    expect(() =>
      bindFeature(FEATURE, {
        scenarios: {
          'Checkout as admin': {
            steps: [{ at: 'Login', node: 'soft' }],
          },
        },
      }),
    ).toThrow(/`node` can only override prompt steps/);

    expect(() =>
      bindFeature(FEATURE, {
        scenarios: {
          'Checkout as admin': {
            steps: [{ at: 'Login', template: 'nope' }],
          },
        },
      }),
    ).toThrow(/use `args` to adjust a flow call/);

    expect(() =>
      bindFeature(FEATURE, {
        scenarios: {
          'Browse anonymously': {
            steps: [{ at: 'I open the catalog page', args: { x: '1' } }],
          },
        },
      }),
    ).toThrow(/`args` only applies to flow-call steps/);
  });

  it('applies an overlay to every expansion of a Scenario Outline title', () => {
    const outline = `
Feature: outline
  Scenario Outline: visit page
    When I open the "<page>" page
    Then the "<page>" page is visible

    Examples:
      | page  |
      | home  |
      | about |
`;
    const bound = bindFeature(outline, {
      scenarios: { 'visit page': { steps: [{ at: 1, node: 'soft' }] } },
    });
    expect(bound.scenarios).toHaveLength(2);
    for (const s of bound.scenarios) {
      expect(s.steps[1]).toMatchObject({ node: 'soft' });
    }
  });
});

describe('bindFeature: Soft helper interop', () => {
  it('accepts IR steps from the fluent API as inserts', () => {
    const bound = bindFeature(FEATURE, {
      scenarios: {
        'Browse anonymously': {
          steps: [
            {
              at: 'the product grid is visible',
              before: [Soft('no broken product images are visible')],
            },
          ],
        },
      },
    });
    const steps = bound.scenarios.find(
      (s) => s.name === 'Browse anonymously',
    )?.steps;
    expect(steps?.[1]).toMatchObject({
      node: 'soft',
      template: 'no broken product images are visible',
    });
  });
});
