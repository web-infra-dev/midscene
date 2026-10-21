/** Signals an expired SIWC token that may be refreshed before replaying output. */
export class SiwcTokenExpiredError extends Error {
  override name = 'SiwcTokenExpiredError';
}
