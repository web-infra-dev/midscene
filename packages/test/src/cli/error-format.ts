import { inspect } from 'node:util';

/** Keep native Error stacks, causes, and aggregate errors in CLI diagnostics. */
export const formatCliError = (error: unknown): string =>
  typeof error === 'string'
    ? error
    : inspect(error, { colors: false, depth: null, customInspect: false });
