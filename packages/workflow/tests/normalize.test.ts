import { describe, expect, it } from 'vitest';
import { WorkflowParseError, normalizeStep, normalizeWorkflow } from '../src';

describe('workflow normalization', () => {
  it('expands string and block scalar shorthand to prompt input', () => {
    const result = normalizeWorkflow(`
cases:
  - agent.verify: verify the order
  - agent.explain: |
      explain line one
      and line two
`);

    expect(result).toEqual({
      cases: [
        {
          node: 'agent.verify',
          input: { prompt: 'verify the order' },
          meta: { continueOnError: false },
        },
        {
          node: 'agent.explain',
          input: { prompt: 'explain line one\nand line two\n' },
          meta: { continueOnError: false },
        },
      ],
    });
  });

  it('separates and normalizes engine metadata from node input', () => {
    expect(
      normalizeStep({
        'http.request': {
          prompt: 'create an order',
          $: { timeout: 20_000, 'continue-on-error': true },
          method: 'POST',
        },
      }),
    ).toEqual({
      node: 'http.request',
      input: { prompt: 'create an order', method: 'POST' },
      meta: { timeoutMs: 20_000, continueOnError: true },
    });
  });

  it.each([null, 42, true, ['prompt']])(
    'rejects invalid shorthand value %j',
    (value) => {
      expect(() => normalizeStep({ node: value })).toThrow(WorkflowParseError);
    },
  );

  it.each([
    [{ timeout: '20s' }, 'positive number'],
    [{ timeout: 0 }, 'positive number'],
    [{ 'continue-on-error': 'yes' }, 'boolean'],
    [{ retries: 3 }, 'unsupported engine metadata'],
  ])('rejects invalid engine metadata %j', (meta, message) => {
    expect(() => normalizeStep({ node: { $: meta } })).toThrow(message);
  });

  it('rejects malformed workflow and common prompt input', () => {
    expect(normalizeWorkflow('cases: []')).toEqual({ cases: [] });
    expect(() => normalizeWorkflow('{}')).toThrow('cases array');
    expect(() => normalizeWorkflow('cases: {}')).toThrow('cases array');
    expect(() => normalizeStep({ first: {}, second: {} })).toThrow(
      'exactly one node',
    );
    expect(() => normalizeStep({ node: { prompt: 42 } })).toThrow('prompt');
    expect(() => normalizeWorkflow('cases: [')).toThrow(
      'Failed to parse workflow YAML',
    );
    expect(() =>
      normalizeWorkflow(
        'cases:\n  - node: first\n  - node: second\n    node: duplicate',
      ),
    ).toThrow('Failed to parse workflow YAML');
  });

  it('rejects the old workflow field with a migration error', () => {
    expect(() => normalizeWorkflow('workflow: []')).toThrow(
      'no longer supports "workflow". Use "cases" instead',
    );
    expect(() =>
      normalizeWorkflow({
        cases: [],
        workflow: [],
      } as never),
    ).toThrow('no longer supports "workflow". Use "cases" instead');
  });

  it('rejects unknown standalone workflow fields', () => {
    expect(() => normalizeWorkflow('cases: []\ncase: []')).toThrow(
      'unsupported field "case"',
    );
  });
});
