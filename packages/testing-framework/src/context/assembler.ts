/**
 * Context assembly (RFC §7).
 *
 * When executing a `verify` / `agent` node, the agent sees EXACTLY:
 *   for each past step (in order):
 *     - node type + instruction (text, or object input for custom nodes)
 *     - that step's output (natural language; runtime nodes use conclusion)
 *     - if verify/soft: its pass/fail + reason
 *   + the current UI screenshot (handed separately as an image)
 *   + the skills pre-loaded into the agent
 *
 * Explicitly excluded ("nothing else"): execution traces, historical
 * screenshots, runtime `state`, intermediate skill-call results.
 *
 * Phase 0 does NOT truncate (predictability > compactness).
 */
import type { StepResult } from '../types';

export interface AssembleContextInput {
  /** The case name, for a small header. */
  caseName: string;
  /** All steps executed before the current node, in order. */
  pastSteps: ReadonlyArray<StepResult>;
  /** The current node's instruction. */
  instruction: string;
  /** The current node's kind, for framing. */
  kind: 'verify' | 'soft' | 'agent';
}

export function assembleContext(input: AssembleContextInput): string {
  const { caseName, pastSteps, instruction, kind } = input;
  const lines: string[] = [];

  lines.push(`# Test case: ${caseName}`);
  lines.push('');
  lines.push(
    'You are running inside a UI test. Below is the full history of previous ' +
      'steps and their outputs. You also receive the current UI screenshot as ' +
      'an image. This is everything you can see — there is no other hidden state.',
  );
  lines.push('');

  if (pastSteps.length === 0) {
    lines.push('## Previous steps');
    lines.push('(none — this is the first step)');
  } else {
    lines.push('## Previous steps');
    for (const step of pastSteps) {
      lines.push('');
      lines.push(`### Step ${step.index + 1}: ${step.node}`);
      lines.push(`- Intent: ${formatInput(step.input)}`);
      if (step.output?.text) {
        lines.push(`- Output: ${step.output.text}`);
      }
      if (step.output?.structured) {
        lines.push(`- Output fields: ${safeJson(step.output.structured)}`);
      }
      if (step.verdict) {
        lines.push(
          `- Verdict: ${step.verdict.pass ? 'PASS' : 'FAIL'} — ${step.verdict.reason}`,
        );
      }
      if (step.error) {
        lines.push(`- Error: ${step.error}`);
      }
    }
  }

  lines.push('');
  lines.push('## Current task');
  if (kind === 'agent') {
    lines.push(
      'Freely explore and analyze based on the history above and the current ' +
        'screenshot. Your output is advisory and does NOT decide pass/fail.',
    );
  } else {
    lines.push(
      'Make a judgment. You MUST finish by calling the `report_verdict` tool ' +
        'with `pass`, `reason`, and optional `evidence`. If you cannot ' +
        'confidently determine the result, report `pass: false`.',
    );
  }
  lines.push('');
  lines.push(instruction.trim());

  return lines.join('\n');
}

function formatInput(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (input === undefined) return '(no input)';
  return safeJson(input);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
