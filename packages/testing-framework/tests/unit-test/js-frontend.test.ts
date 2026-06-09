import { describe, expect, it } from 'vitest';
import {
  Advisory,
  Given,
  Soft,
  Then,
  When,
  callFlow,
  defineFlow,
  feature,
  remember,
  scenario,
} from '../../src/frontends/js';

describe('JS front-end: keyword→node mapping', () => {
  it('maps given/when/then/soft/advisory to engine node kinds', () => {
    expect(Given('the shop is open')).toEqual({
      kind: 'prompt',
      node: 'ui',
      template: 'the shop is open',
    });
    expect(When('I add the item to the cart').node).toBe('ui');
    expect(Then('the cart shows 1 item').node).toBe('verify');
    expect(Soft('a promo banner is visible').node).toBe('soft');
    expect(Advisory('summarize risks').node).toBe('agent');
  });

  it('rejects empty prompts', () => {
    expect(() => When('   ')).toThrow(/must not be empty/);
  });
});

describe('JS front-end: remember / callFlow', () => {
  it('builds capture steps', () => {
    expect(remember('the order id shown in the banner', 'orderId')).toEqual({
      kind: 'capture',
      template: 'the order id shown in the banner',
      varName: 'orderId',
    });
  });

  it('rejects invalid variable names', () => {
    expect(() => remember('something', 'not a name')).toThrow(
      /not a valid variable name/,
    );
  });

  it('builds callFlow steps and stringifies arg values', () => {
    expect(callFlow('Login', { role: 'admin', retries: 2 })).toEqual({
      kind: 'callFlow',
      flowName: 'Login',
      args: { role: 'admin', retries: '2' },
    });
  });
});

describe('JS front-end: scenario / feature builders', () => {
  it('normalizes bare strings to when (ui action) steps', () => {
    const s = scenario('quick', ['open the home page', Then('it loaded')]);
    expect(s.steps[0]).toEqual({
      kind: 'prompt',
      node: 'ui',
      template: 'open the home page',
    });
    expect(s.steps[1].kind).toBe('prompt');
  });

  it('stringifies seed vars', () => {
    const s = scenario('seeded', ['x'], { vars: { qty: 3, flag: true } });
    expect(s.vars).toEqual({ qty: '3', flag: 'true' });
  });

  it('supports dynamic build-time authoring (map over data)', () => {
    const roles = ['admin', 'guest'];
    const f = feature(
      'login matrix',
      roles.map((role) =>
        scenario(`login as ${role}`, [
          callFlow('Login', { role }),
          Then(`the dashboard for the "${role}" role is visible`),
        ]),
      ),
    );
    expect(f.scenarios).toHaveLength(2);
    expect(f.scenarios[1].steps[0]).toMatchObject({
      kind: 'callFlow',
      args: { role: 'guest' },
    });
  });

  it('rejects empty step lists', () => {
    expect(() => scenario('empty', [])).toThrow(/non-empty/);
  });
});

describe('JS front-end: defineFlow static checks', () => {
  it('builds a flow definition', () => {
    const flow = defineFlow({
      name: 'Login',
      params: ['role'],
      returns: ['greeting'],
      steps: [
        When('open the login page'),
        When('sign in as the {role} user'),
        remember('the greeting in the header', 'greeting'),
      ],
    });
    expect(flow.params).toEqual(['role']);
    expect(flow.returns).toEqual(['greeting']);
    expect(flow.steps).toHaveLength(3);
  });

  it('rejects placeholders that are neither params nor earlier captures', () => {
    expect(() =>
      defineFlow({
        name: 'Broken',
        params: ['role'],
        steps: [When('sign in as {role} with {password}')],
      }),
    ).toThrow(/\{password\}.*fresh scope/);
  });

  it('rejects returns that are never produced', () => {
    expect(() =>
      defineFlow({
        name: 'Broken',
        params: ['role'],
        returns: ['token'],
        steps: [When('sign in as {role}')],
      }),
    ).toThrow(/return "token"/);
  });

  it('goes lenient when the flow calls other flows', () => {
    const flow = defineFlow({
      name: 'Composite',
      params: [],
      returns: ['greeting'],
      steps: [
        callFlow('Login', { role: 'admin' }),
        Then('the greeting {greeting} is shown'),
      ],
    });
    expect(flow.steps[0].kind).toBe('callFlow');
  });
});
