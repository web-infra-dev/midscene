/** Parsed representation of a v2 case YAML (RFC §1). */
export interface FlowStep {
  /** Node type (ui/verify/soft/agent) or a custom runtime node name. */
  node: string;
  /**
   * The node's input. For built-in nodes this is always a string; for custom
   * nodes it may be a string, an object, or undefined (bare-name step).
   */
  input: unknown;
}

export interface ParsedCase {
  /** Optional human-readable name. */
  name?: string;
  flow: FlowStep[];
}

export const BUILTIN_NODES = ['ui', 'verify', 'soft', 'agent'] as const;
export type BuiltinNode = (typeof BUILTIN_NODES)[number];

export function isBuiltinNode(node: string): node is BuiltinNode {
  return (BUILTIN_NODES as readonly string[]).includes(node);
}
