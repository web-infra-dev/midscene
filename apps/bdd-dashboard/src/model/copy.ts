/**
 * Shared routing copy. The header chips, step badges, and legend all
 * describe the same router semantics; composing from these fragments keeps
 * the wording from drifting between the three.
 */

export const AGENT_MARKER_HINT = 'marked with # @agent or a $skill token';
export const NOAI_MARKER_HINT = 'marked with # @no-ai';

export const AGENT_ROUTE_LABEL = 'general coding agent (e.g. Codex)';
export const NOAI_ROUTE_LABEL =
  'user-registered classic callback (Given/When/Then/defineStep) — no AI involved';

/** The CLI command that produces this page (footer, errors, hints). */
export const DASHBOARD_CLI_COMMAND = 'midscene-bdd dashboard';

/** Text-only helper shared by error paths. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
