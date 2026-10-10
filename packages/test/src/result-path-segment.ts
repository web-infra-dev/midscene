/** Whether a value can be used as one bounded result-directory segment. */
export const isSafeResultPathSegment = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
