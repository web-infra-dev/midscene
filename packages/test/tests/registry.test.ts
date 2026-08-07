import { describe, expect, it } from 'vitest';
import {
  DuplicateNodeError,
  NodeDefinitionError,
  NodeNotFoundError,
  NodeRegistry,
  defineNode,
  z,
} from '../src';

describe('node definitions and registry', () => {
  const node = defineNode({
    name: 'test.node',
    execute() {},
  });

  it('defines and registers a node', () => {
    const registry = new NodeRegistry([node]);

    expect(registry.get('test.node')).toBe(node);
    expect(registry.has('test.node')).toBe(true);
    expect(registry.names()).toEqual(['test.node']);
    expect(registry.definitions()).toEqual([node]);
    expect(registry.definitions()).not.toBe(registry.definitions());
  });

  it('rejects invalid definitions, duplicates, and unknown nodes', () => {
    expect(() => defineNode({ name: '', execute() {} })).toThrow(
      NodeDefinitionError,
    );
    expect(() => new NodeRegistry([{ name: 'invalid.node' } as never])).toThrow(
      NodeDefinitionError,
    );

    const registry = new NodeRegistry([node]);
    expect(() => registry.register(node)).toThrow(DuplicateNodeError);
    expect(() => registry.require('missing.node')).toThrow(NodeNotFoundError);
  });

  it('validates optional node documentation metadata', () => {
    const inputSchema = z.strictObject({ value: z.string() });
    expect(
      defineNode({
        name: 'documented.node',
        title: 'Documented node',
        description: 'Runs a documented action.',
        inputSchema,
        execute() {},
      }).inputSchema,
    ).toBe(inputSchema);

    expect(() =>
      defineNode({
        name: 'invalid.title',
        title: '   ',
        execute() {},
      }),
    ).toThrow('title must be a non-empty string');
    expect(() =>
      defineNode({
        name: 'invalid.schema',
        inputSchema: {} as never,
        execute() {},
      }),
    ).toThrow('inputSchema must be a Zod object schema');
    expect(() =>
      defineNode({
        name: 'invalid.meta',
        inputSchema: z.strictObject({ $: z.string() }),
        execute() {},
      }),
    ).toThrow('must not declare "$"');
  });
});
