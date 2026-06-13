/**
 * `defineRuntime` — custom YAML nodes (RFC §3).
 *
 * A runtime node owns a whole step's execution. Its handler receives two
 * arguments: `input` (this node's own YAML value) and `context` (the ambient
 * execution context). It has two output channels:
 *  - `conclusion` (+ optional `output`): context-facing, flows into later
 *    verify/agent nodes.
 *  - `state`: engineering-facing TypeScript state shared between runtime
 *    nodes; the agent never sees it.
 */
import type { Agent, OutputStore, TestResultSoFar } from './types';

export interface RuntimeNodeContext {
  /** The UI Agent — runtime nodes may also drive the page. */
  uiAgent: Agent;
  /** All past context-facing outputs (read-only). */
  outputs: OutputStore;
  /**
   * Engineering-facing TS state shared across runtime nodes. NOT visible to
   * the agent. Use `conclusion` to expose anything to later verify/agent.
   */
  state: Record<string, unknown>;
  /** The case's accumulated result so far. */
  result: TestResultSoFar;
  /** Process environment. */
  env: NodeJS.ProcessEnv;
}

export interface RuntimeNodeResult {
  /** Context-facing output. Enters later verify/agent context. */
  conclusion: string;
  /** Optional structured output (also enters context). */
  output?: Record<string, unknown>;
}

export type RuntimeNode = (
  /** This node's YAML value (string or object). */
  input: unknown,
  context: RuntimeNodeContext,
) => Promise<RuntimeNodeResult>;

/**
 * Identity helper that gives a custom node full type inference. Mirrors the
 * `defineRuntime` entry described in the design doc.
 */
export function defineRuntime(node: RuntimeNode): RuntimeNode {
  return node;
}
