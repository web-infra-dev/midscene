export class RecorderMessageTimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(`Timed out waiting for ${operation} after ${timeoutMs}ms`);
    this.name = 'RecorderMessageTimeoutError';
  }
}

/**
 * Ensures a Chrome extension operation cannot leave a Recorder UI action
 * pending forever when Chrome or a content script never responds.
 */
export const withRecorderMessageTimeout = <T>(
  operation: Promise<T>,
  operationName: string,
  timeoutMs: number,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new RecorderMessageTimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    operation.then(
      (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
};
