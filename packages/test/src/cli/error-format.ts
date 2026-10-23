import { inspect } from 'node:util';

/** Keep native Error stacks, causes, and aggregate errors in CLI diagnostics. */
export const formatCliError = (error: unknown): string =>
  typeof error === 'string'
    ? error
    : inspect(error, { colors: false, depth: null, customInspect: false });

/** Keep actionable messages and distinct causes; verbose output retains full stacks. */
export function formatConciseError(error: unknown): string {
  const seen = new Set<unknown>();
  const messages: string[] = [];
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    // Node wrappers add location already shown by the reporter, sometimes twice.
    if (
      (current as Error & { code?: string }).code === 'NODE_EXECUTION_ERROR' &&
      current.cause !== undefined
    ) {
      current = current.cause;
      continue;
    }
    if (current.message && !messages.includes(current.message))
      messages.push(current.message);
    if (current instanceof AggregateError) {
      for (const nested of current.errors) {
        if (nested === current || seen.has(nested)) continue;
        seen.add(nested);
        messages.push(
          nested instanceof Error ? nested.message : String(nested),
        );
      }
    }
    current = current.cause;
  }
  if (!messages.length)
    return current instanceof Error ? current.message : formatCliError(current);
  return messages.join('\nCaused by: ');
}
