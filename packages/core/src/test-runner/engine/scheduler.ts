/** A rejected attempt is an infrastructure failure and is never replayed. */
export async function runDocumentAttempts(
  options: { retry: number; signal: AbortSignal; shouldStop(): boolean },
  run: (attemptIndex: number) => Promise<'success' | 'failed' | undefined>,
): Promise<void> {
  for (let attemptIndex = 0; attemptIndex <= options.retry; attemptIndex++) {
    if (options.signal.aborted || options.shouldStop()) return;
    const status = await run(attemptIndex);
    if (status !== 'failed') return;
  }
}

/** Ordered admission, bounded concurrency, results in invocation order. */
export async function runConcurrentJobs<T>(
  items: readonly T[],
  options: { concurrency: number; shouldStop(): boolean },
  run: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !options.shouldStop()) {
      const index = next++;
      await run(items[index], index);
    }
  };
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(options.concurrency, items.length) }, worker),
  );
  const errors = workers.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (errors.length === 1) throw errors[0];
  if (errors.length)
    throw new AggregateError(errors, 'Document scheduling failed');
}
