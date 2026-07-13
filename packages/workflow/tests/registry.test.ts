import { describe, expect, it } from 'vitest';
import {
  DuplicateNodeError,
  NodeDefinitionError,
  NodeNotFoundError,
  NodeRegistry,
  defineNode,
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
});
