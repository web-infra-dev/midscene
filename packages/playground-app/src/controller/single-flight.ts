export function runSingleFlight<T>(
  pendingRef: { current: Promise<T> | null },
  task: () => Promise<T>,
): Promise<T> {
  if (pendingRef.current) {
    return pendingRef.current;
  }

  const taskPromise = task();
  const pendingState: { promise: Promise<T> | null } = {
    promise: null,
  };

  pendingState.promise = taskPromise.finally(() => {
    if (pendingRef.current === pendingState.promise) {
      pendingRef.current = null;
    }
  });

  pendingRef.current = pendingState.promise;
  return pendingState.promise;
}
