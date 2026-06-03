/**
 * Core contracts for the v2 testing framework (Phase 0).
 *
 * These types formalize the decisions in RFC 0001. They intentionally model
 * "what must be agreed before building": the node model, the verify verdict
 * contract, the output contract, and the context-assembly contract.
 */
import type { Agent } from '@midscene/core/agent';

/** Built-in node types plus the open-ended custom (runtime) node name. */
export type BuiltinNodeType = 'ui' | 'verify' | 'soft' | 'agent';

/**
 * A verify/soft verdict. `verify` gates the case; `soft` only records a warning.
 * See RFC §6.
 */
export interface Verdict {
  pass: boolean;
  /** Human-readable rationale. Always written into the report. */
  reason: string;
  /** Optional: screenshot refs, skill response fragments, etc. */
  evidence?: unknown;
}

/**
 * The context-facing output of a single step (RFC §5, §7).
 *
 * Output is plain natural language by design — there is no schema. `text`
 * is the natural-language conclusion; `structured` is an optional bag of
 * fields a runtime node chose to expose (it also flows into context).
 */
export interface StepOutput {
  text: string;
  structured?: Record<string, unknown>;
}

/** Status of a single executed step. */
export type StepStatus = 'passed' | 'failed' | 'warning' | 'info';

/** Result of executing one flow step. */
export interface StepResult {
  index: number;
  /** Node type or custom node name. */
  node: string;
  /** The instruction given to the node (text, or object for custom nodes). */
  input: unknown;
  status: StepStatus;
  /** Context-facing output of this step (RFC §7). */
  output?: StepOutput;
  /** Present for verify/soft nodes. */
  verdict?: Verdict;
  /** Error message when the step threw. */
  error?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/** Result of executing a single case (one YAML file / flow). */
export interface CaseResult {
  name: string;
  file: string;
  status: 'passed' | 'failed';
  steps: StepResult[];
  /** Warnings collected from `soft` failures and `agent` errors. */
  warnings: string[];
  durationMs: number;
  /** Path to the Midscene HTML report for the UI agent, if generated. */
  reportFile?: string;
}

/** Aggregate run summary written to `output.summary`. */
export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  cases: CaseResult[];
}

/**
 * The accumulated, read-only view of the case so far, handed to runtime nodes
 * (RFC §3) and used to assemble agent context (RFC §7).
 */
export interface TestResultSoFar {
  name: string;
  file: string;
  steps: ReadonlyArray<StepResult>;
}

/** Read-only store of every past step's context-facing output (RFC §3). */
export interface OutputStore {
  /** All outputs in flow order. */
  all(): ReadonlyArray<{ node: string; index: number; output: StepOutput }>;
  /** The most recent output, if any. */
  latest(): StepOutput | undefined;
}

export type { Agent };
