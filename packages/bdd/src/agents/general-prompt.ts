/**
 * Pure prompt/verdict helpers for the general coding agent.
 *
 * Exports: `VERDICT_INSTRUCTIONS`, `buildGeneralPrompt`, `extractVerdict`,
 * `toGeneralResult`. No model or CLI dependencies — fully unit-testable.
 * Consumed by the CLI adapters in `opencode-agent.ts` / `codex-agent.ts`.
 */
import { getDebug } from '@midscene/shared/logger';
import { renderSkillsForPrompt } from '../skills';
import type { GeneralAgentRequest, GeneralAgentResult } from '../types';

export const VERDICT_INSTRUCTIONS = [
  'If your environment provides tools (e.g. a sandboxed shell or file access), use them to gather the evidence the task requires; otherwise reason only from the information given above.',
  'End your reply with a single-line JSON verdict: {"pass": true|false, "reason": "..."}.',
  'Verdicts are fail-closed: if you are unsure or lack evidence, report {"pass": false, "reason": "..."} explaining what is missing.',
].join('\n');

/**
 * Compose the prompt: step prompt (data table / doc string are already merged
 * in by the router), then skills, then verdict instructions for asserts.
 */
export function buildGeneralPrompt(req: GeneralAgentRequest): string {
  const parts: string[] = [req.prompt];
  if (req.skills.length > 0) {
    parts.push(renderSkillsForPrompt(req.skills));
  }
  if (req.kind === 'assert') {
    parts.push(VERDICT_INSTRUCTIONS);
  }
  return parts.join('\n\n');
}

/**
 * Find the last top-level `{...}` candidate in `text` that parses to an
 * object with a boolean `pass`. Brace-balanced scan: survives nested objects
 * and braces inside JSON strings, unlike a naive regex.
 */
export function extractVerdict(
  text: string,
): { pass: boolean; reason: string } | undefined {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      // Quotes in surrounding prose (depth 0) must not poison the scan.
      if (depth > 0) inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (!candidate.includes('"pass"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { pass?: unknown }).pass === 'boolean'
    ) {
      const reason = (parsed as { reason?: unknown }).reason;
      return {
        pass: (parsed as { pass: boolean }).pass,
        reason:
          typeof reason === 'string' && reason.trim().length > 0
            ? reason
            : '(no reason given)',
      };
    }
  }
  return undefined;
}

/** Wrap the raw reply; for asserts, extract the verdict (missing → warn — the engine fails the assertion). */
export function toGeneralResult(
  req: GeneralAgentRequest,
  text: string,
): GeneralAgentResult {
  if (req.kind !== 'assert') {
    return { text };
  }
  const verdict = extractVerdict(text);
  if (!verdict) {
    const warn = getDebug('bdd:general-agent', { console: true });
    warn(
      'general agent reply contained no JSON verdict; the engine treats this fail-closed (assertion fails)',
    );
  }
  return { text, verdict };
}
