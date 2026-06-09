import { describe, expect, it } from 'vitest';
import { compileFeature } from '../../src/frontends/gherkin';

const FEATURE = `
Feature: Checkout

  Background:
    Given the demo shop is open on the home page

  @flow @param:role @returns:greeting
  Scenario: Login
    When I open the login page
    And I sign in as the "{role}" user
    Then the dashboard for the "{role}" role is visible
    When I remember the greeting shown in the header as "greeting"

  Scenario: Checkout as admin
    When I run the "Login" flow with role "admin"
    And I remember the price of the "Trail Backpack" product as "price"
    When I add the "Trail Backpack" to the cart
    Then the cart total equals {price}
    But the cart does not show an error banner

  @soft
  Scenario: Promo banner
    Then a promo banner is visible at the top of the page

  Scenario Outline: Login works for each role
    When I run the "Login" flow with role "<role>"
    Then the header greets the user with {greeting}

    Examples:
      | role  |
      | admin |
      | guest |
`;

describe('Gherkin front-end', () => {
  const compiled = compileFeature(FEATURE, 'checkout.feature');

  it('separates @flow definitions from runnable scenarios', () => {
    expect(compiled.name).toBe('Checkout');
    expect(compiled.flows.map((f) => f.name)).toEqual(['Login']);
    expect(compiled.scenarios.map((s) => s.name)).toEqual([
      'Checkout as admin',
      'Promo banner',
      'Login works for each role',
      'Login works for each role',
    ]);
  });

  it('reads params and returns from @param:/@returns: tags', () => {
    const login = compiled.flows[0];
    expect(login.params).toEqual(['role']);
    expect(login.returns).toEqual(['greeting']);
    // Background steps are excluded from flow definitions: a reusable flow
    // invoked mid-scenario must not replay the feature's setup.
    expect(login.steps[0]).toMatchObject({
      kind: 'prompt',
      node: 'ui',
      role: 'action',
      template: 'I open the login page',
    });
    // `I remember ... as "greeting"` becomes a capture step.
    expect(login.steps.at(-1)).toEqual({
      kind: 'capture',
      template: 'the greeting shown in the header',
      varName: 'greeting',
    });
  });

  it('maps keywords to node kinds, with And/But inheriting the last primary keyword', () => {
    const checkout = compiled.scenarios[0];
    // Background Given → ui/setup leading step.
    expect(checkout.steps[0]).toMatchObject({ node: 'ui', role: 'setup' });
    // `And I remember ...` after a When still parses as capture.
    expect(checkout.steps[2]).toMatchObject({
      kind: 'capture',
      varName: 'price',
    });
    // Then → verify (fail-closed), template keeps the {price} placeholder.
    expect(checkout.steps[4]).toMatchObject({
      kind: 'prompt',
      node: 'verify',
      template: 'the cart total equals {price}',
    });
    // `But` after a Then inherits Outcome → verify.
    expect(checkout.steps[5]).toMatchObject({
      kind: 'prompt',
      node: 'verify',
      template: 'the cart does not show an error banner',
    });
  });

  it('compiles flow invocation steps with parsed args', () => {
    const checkout = compiled.scenarios[0];
    expect(checkout.steps[1]).toEqual({
      kind: 'callFlow',
      flowName: 'Login',
      args: { role: 'admin' },
    });
  });

  it('turns Then into soft nodes for @soft scenarios', () => {
    const promo = compiled.scenarios[1];
    expect(promo.tags).toContain('@soft');
    expect(promo.steps.at(-1)).toMatchObject({ kind: 'prompt', node: 'soft' });
  });

  it('expands Scenario Outline examples into the step text', () => {
    const [adminRun, guestRun] = compiled.scenarios.slice(2);
    expect(adminRun.steps[1]).toMatchObject({
      kind: 'callFlow',
      args: { role: 'admin' },
    });
    expect(guestRun.steps[1]).toMatchObject({
      kind: 'callFlow',
      args: { role: 'guest' },
    });
    // `{greeting}` (curly braces) is left for the runtime variable table.
    expect(guestRun.steps[2]).toMatchObject({
      node: 'verify',
      template: 'the header greets the user with {greeting}',
    });
  });

  it('parses multiple flow args joined with "and"', () => {
    const multi = compileFeature(
      `Feature: f
  Scenario: s
    When I run the "Login" flow with role "admin" and region "eu-west"
`,
      'multi.feature',
    );
    expect(multi.scenarios[0].steps[0]).toEqual({
      kind: 'callFlow',
      flowName: 'Login',
      args: { role: 'admin', region: 'eu-west' },
    });
  });

  it('throws on an unparseable arg clause', () => {
    expect(() =>
      compileFeature(
        `Feature: f
  Scenario: s
    When I run the "Login" flow with gibberish
`,
        'bad.feature',
      ),
    ).toThrow(/could not parse arguments/);
  });

  it('throws on invalid Gherkin', () => {
    expect(() => compileFeature('Feature broken\n  nonsense')).toThrow(
      /Failed to parse Gherkin/,
    );
  });
});
