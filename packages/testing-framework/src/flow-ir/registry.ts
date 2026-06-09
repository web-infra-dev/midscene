/**
 * POC: registry of named flows. Both front-ends register {@link FlowDefIR}s
 * here; the IR executor resolves `callFlow` steps against it.
 */
import { type FlowDefIR, assertIdentifier } from './types';

export class FlowRegistry {
  private readonly flows = new Map<string, FlowDefIR>();

  register(flow: FlowDefIR): void {
    if (!flow.name.trim()) {
      throw new Error('[midscene] FlowRegistry: a flow must have a name.');
    }
    if (this.flows.has(flow.name)) {
      throw new Error(
        `[midscene] FlowRegistry: flow "${flow.name}" is already registered.`,
      );
    }
    if (flow.steps.length === 0) {
      throw new Error(
        `[midscene] FlowRegistry: flow "${flow.name}" has no steps.`,
      );
    }
    for (const param of flow.params) {
      assertIdentifier(param, `flow "${flow.name}" params`);
    }
    for (const ret of flow.returns) {
      assertIdentifier(ret, `flow "${flow.name}" returns`);
    }
    this.flows.set(flow.name, flow);
  }

  registerAll(flows: Iterable<FlowDefIR>): void {
    for (const flow of flows) {
      this.register(flow);
    }
  }

  has(name: string): boolean {
    return this.flows.has(name);
  }

  get(name: string): FlowDefIR {
    const flow = this.flows.get(name);
    if (!flow) {
      const known = [...this.flows.keys()].join(', ') || '(none)';
      throw new Error(
        `[midscene] Unknown flow "${name}". Registered flows: ${known}.`,
      );
    }
    return flow;
  }
}

/** Convenience: build a registry from a list of flow definitions. */
export function createFlowRegistry(flows: FlowDefIR[] = []): FlowRegistry {
  const registry = new FlowRegistry();
  registry.registerAll(flows);
  return registry;
}
