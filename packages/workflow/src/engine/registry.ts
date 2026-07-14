import { DuplicateNodeError, NodeNotFoundError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition } from '../node/types';

export class NodeRegistry {
  readonly #nodes = new Map<string, NodeDefinition<any, any>>();

  constructor(nodes: readonly NodeDefinition<any, any>[] = []) {
    for (const node of nodes) {
      this.register(node);
    }
  }

  register<TInput, TData>(node: NodeDefinition<TInput, TData>): this {
    defineNode(node);

    if (this.#nodes.has(node.name)) {
      throw new DuplicateNodeError(node.name);
    }

    this.#nodes.set(node.name, node);
    return this;
  }

  get(name: string): NodeDefinition<any, any> | undefined {
    return this.#nodes.get(name);
  }

  require(name: string): NodeDefinition<any, any> {
    const node = this.get(name);
    if (!node) {
      throw new NodeNotFoundError(name);
    }
    return node;
  }

  has(name: string): boolean {
    return this.#nodes.has(name);
  }

  names(): string[] {
    return [...this.#nodes.keys()];
  }
}
