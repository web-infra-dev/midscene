/**
 * AgentRuntimeAdapter — the swappable general-purpose agent layer (RFC §6,
 * design doc "swappable agent framework"). The default implementation wraps
 * Pi; teams can replace it with another agent SDK via `agentRuntime` in
 * `midscene.config.ts`.
 *
 * Phase 0 keeps this interface deliberately minimal: a single `run` entry that
 * the engine calls for `verify` / `soft` / `agent` nodes.
 */
import type { Verdict } from '../types';

export interface AgentRunInput {
  /**
   * Node kind. `verify` and `soft` both must produce a verdict; `agent` is
   * advisory and never produces one.
   */
  kind: 'verify' | 'soft' | 'agent';
  /** The natural-language instruction from the YAML node. */
  instruction: string;
  /**
   * The assembled context (RFC §7): every past step's intent + output +
   * verify verdicts. Plain text.
   */
  context: string;
  /** Current UI screenshot as bare base64 PNG (no data: prefix). */
  screenshotBase64?: string;
  /** PNG media type override; defaults to image/png. */
  screenshotMediaType?: string;
  /** `$name` tokens referenced by the instruction (RFC §4). */
  referencedSkills: string[];
  /** Project root, used for skill discovery and the agent's cwd. */
  projectRoot: string;
}

export interface AgentRunResult {
  /** The agent's final natural-language message. */
  text: string;
  /**
   * For verify/soft: the structured verdict, or undefined when the agent
   * never reported one (the engine treats undefined as fail-closed, RFC §6).
   */
  verdict?: Verdict;
}

export interface AgentRuntimeAdapter {
  run(input: AgentRunInput): Promise<AgentRunResult>;
  /** Release any underlying resources. */
  dispose?(): Promise<void>;
}
