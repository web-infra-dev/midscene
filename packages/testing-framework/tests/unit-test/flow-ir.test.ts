import { describe, expect, it } from 'vitest';
import {
  FlowRegistry,
  createFlowRegistry,
  listPlaceholders,
  substitute,
} from '../../src/flow-ir';
import type { FlowDefIR } from '../../src/flow-ir';

const loginFlow: FlowDefIR = {
  name: 'Login',
  params: ['role'],
  returns: [],
  steps: [
    {
      kind: 'prompt',
      node: 'ui',
      template: 'log in as {role}',
    },
  ],
};

describe('substitute', () => {
  it('replaces known placeholders mechanically', () => {
    const vars = new Map([
      ['role', 'admin'],
      ['price', '42.00'],
    ]);
    expect(
      substitute('sign in as {role}; the total is {price}', vars, 'test'),
    ).toBe('sign in as admin; the total is 42.00');
  });

  it('replaces repeated placeholders', () => {
    const vars = new Map([['x', 'A']]);
    expect(substitute('{x} and {x}', vars, 'test')).toBe('A and A');
  });

  it('throws on unknown placeholders (fail fast on typos)', () => {
    const vars = new Map([['role', 'admin']]);
    expect(() => substitute('sign in as {rolle}', vars, 'step 3')).toThrow(
      /step 3: unknown variable \{rolle\}.*role/,
    );
  });

  it('leaves non-placeholder braces alone', () => {
    const vars = new Map<string, string>();
    expect(substitute('json like {"a": 1} stays', vars, 'test')).toBe(
      'json like {"a": 1} stays',
    );
  });
});

describe('listPlaceholders', () => {
  it('lists placeholder names in order', () => {
    expect(listPlaceholders('the {a} of {b} and {a}')).toEqual(['a', 'b', 'a']);
  });
});

describe('FlowRegistry', () => {
  it('registers and resolves flows', () => {
    const registry = createFlowRegistry([loginFlow]);
    expect(registry.has('Login')).toBe(true);
    expect(registry.get('Login').params).toEqual(['role']);
  });

  it('rejects duplicate registration', () => {
    const registry = createFlowRegistry([loginFlow]);
    expect(() => registry.register(loginFlow)).toThrow(/already registered/);
  });

  it('throws for unknown flows with the registered names listed', () => {
    const registry = createFlowRegistry([loginFlow]);
    expect(() => registry.get('Checkout')).toThrow(
      /Unknown flow "Checkout".*Login/,
    );
  });

  it('rejects empty flows and invalid identifiers', () => {
    const registry = new FlowRegistry();
    expect(() =>
      registry.register({ ...loginFlow, name: 'Empty', steps: [] }),
    ).toThrow(/no steps/);
    expect(() =>
      registry.register({ ...loginFlow, name: 'Bad', params: ['not ok'] }),
    ).toThrow(/not a valid variable name/);
  });
});
