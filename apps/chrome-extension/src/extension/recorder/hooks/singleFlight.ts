export interface InFlightOperation<T> {
  current: Promise<T> | null;
}

/**
 * Shares an in-progress operation with concurrent callers.
 *
 * This keeps asynchronous UI actions, such as stopping a recording, from
 * running twice before their state update has reached the UI.
 */
export const runSingleFlight = <T>(
  inFlightOperation: InFlightOperation<T>,
  action: () => Promise<T>,
): Promise<T> => {
  if (inFlightOperation.current) {
    return inFlightOperation.current;
  }

  const operation = action();
  const guardedOperation = operation.finally(() => {
    if (inFlightOperation.current === guardedOperation) {
      inFlightOperation.current = null;
    }
  });
  inFlightOperation.current = guardedOperation;

  return guardedOperation;
};
