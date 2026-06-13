import { describe, expect, it } from 'vitest';
import { parseCaseYaml } from '../../src/yaml/parse';

describe('parseCaseYaml', () => {
  it('parses name + flow with built-in and custom nodes', () => {
    const parsed = parseCaseYaml(`
name: Create Order
flow:
  - prepareOrderFixture:
      scenario: paid-order
  - ui: Search for "running shoes"
  - verify: The Add to cart button is visible
  - soft: No obvious layout glitches
  - agent: Inspect the page for anything off
  - notifySlack
`);
    expect(parsed.name).toBe('Create Order');
    expect(parsed.flow).toHaveLength(6);
    expect(parsed.flow[0]).toEqual({
      node: 'prepareOrderFixture',
      input: { scenario: 'paid-order' },
    });
    expect(parsed.flow[1]).toEqual({
      node: 'ui',
      input: 'Search for "running shoes"',
    });
    expect(parsed.flow[5]).toEqual({ node: 'notifySlack', input: undefined });
  });

  it('allows multi-line natural-language instructions', () => {
    const parsed = parseCaseYaml(`
flow:
  - ui: |
      Create a test order.
      Record orderId and pageState.
`);
    expect(parsed.flow[0].node).toBe('ui');
    expect(parsed.flow[0].input).toContain('Record orderId');
  });

  it('rejects v1 environment fields', () => {
    expect(() =>
      parseCaseYaml(`
web:
  url: https://example.com
flow:
  - ui: do something
`),
    ).toThrow(/not allowed in a v2 case file/);
  });

  it('rejects a built-in node with object input', () => {
    expect(() =>
      parseCaseYaml(`
flow:
  - verify:
      foo: bar
`),
    ).toThrow(/must take a natural-language string/);
  });

  it('rejects a built-in bare name without instruction', () => {
    expect(() =>
      parseCaseYaml(`
flow:
  - verify
`),
    ).toThrow(/requires a natural-language instruction/);
  });

  it('rejects a step with multiple keys', () => {
    expect(() =>
      parseCaseYaml(`
flow:
  - ui: do
    verify: check
`),
    ).toThrow(/exactly one key/);
  });

  it('requires a flow list', () => {
    expect(() => parseCaseYaml('name: x')).toThrow(/must be a list of steps/);
  });

  it('requires at least one step', () => {
    expect(() => parseCaseYaml('flow: []')).toThrow(/at least one step/);
  });
});
