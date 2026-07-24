export interface IOSSimulatorInputRetryContext {
  attempt: number;
  nextAttempt: number;
  actualValue: string | undefined;
}

export interface InputUntilObservedOptions {
  expectedValue: string;
  performInput: (attempt: number) => Promise<void>;
  readValue: (attempt: number) => Promise<string | undefined>;
  maxAttempts?: number;
  retryIntervalMs?: number;
  onRetry?: (context: IOSSimulatorInputRetryContext) => Promise<void> | void;
}

export interface ObservedInputValue {
  value: string;
  attempts: number;
}

export class IOSSimulatorInputValueError extends Error {
  constructor(
    readonly expectedValue: string,
    readonly actualValue: string | undefined,
    readonly attempts: number,
  ) {
    super(
      `iOS Simulator input did not reach ${JSON.stringify(expectedValue)} after ${attempts} attempts; last observed value: ${JSON.stringify(actualValue)}`,
    );
    this.name = 'IOSSimulatorInputValueError';
  }
}

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

export async function inputUntilObserved(
  options: InputUntilObservedOptions,
): Promise<ObservedInputValue> {
  const {
    expectedValue,
    performInput,
    readValue,
    maxAttempts = 3,
    retryIntervalMs = 500,
    onRetry,
  } = options;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(
      'iOS Simulator input maxAttempts must be a positive integer',
    );
  }

  let actualValue: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await performInput(attempt);
    actualValue = await readValue(attempt);
    if (actualValue === expectedValue) {
      return { value: actualValue, attempts: attempt };
    }

    if (attempt < maxAttempts) {
      await onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        actualValue,
      });
      await sleep(retryIntervalMs);
    }
  }

  throw new IOSSimulatorInputValueError(
    expectedValue,
    actualValue,
    maxAttempts,
  );
}
