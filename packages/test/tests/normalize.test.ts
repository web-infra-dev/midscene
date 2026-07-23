import { describe, expect, it } from 'vitest';
import { WorkflowParseError, normalizeStep, normalizeSteps } from '../src';

describe('step normalization', () => {
  it('expands string shorthand to prompt input', () => {
    const result = normalizeSteps([
      { 'agent.verify': 'verify the order' },
      { 'agent.explain': 'explain line one\nand line two\n' },
    ]);

    expect(result).toEqual([
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
    ]);
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

  it('rejects malformed step lists and common prompt input', () => {
    expect(normalizeSteps([])).toEqual([]);
    expect(() => normalizeSteps({})).toThrow('Steps must be an array');
    expect(() => normalizeStep({ first: {}, second: {} })).toThrow(
      'exactly one node',
    );
    expect(() => normalizeStep({ node: { prompt: 42 } })).toThrow('prompt');
  });
});
