export function getTemperatureWithSemanticRetry<T>({
  temperature,
  userTemperature,
  semanticRetryAttempt = 0,
}: {
  temperature: T;
  userTemperature?: number;
  semanticRetryAttempt?: number;
}): T | number {
  // Only perturb the default deterministic request after a semantic parse
  // failure: preserve an explicit user temperature, and avoid adding a
  // temperature to adapters whose normal parameters do not include one.
  if (
    semanticRetryAttempt > 0 &&
    userTemperature === undefined &&
    temperature === 0
  ) {
    return 0.2;
  }
  return temperature;
}
