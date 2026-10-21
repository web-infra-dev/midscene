/** Signals an expired SIWC token that may be refreshed before replaying output. */
export class SiwcTokenExpiredError extends Error {
  override name = 'SiwcTokenExpiredError';
}

export class SiwcError extends Error {
  override name = 'SiwcError';
}

export async function withSiwcStage<T>(
  stage: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    // Browser callers often display only message; keep the cause readable there too.
    throw new SiwcError(
      `Stage: ${stage}\n${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function tokenResponseError(
  response: Response,
): Promise<SiwcError> {
  try {
    const body = await response.text();
    return new SiwcError(
      `HTTP status: ${response.status}\nResponse body: ${body}`,
    );
  } catch (error) {
    return new SiwcError(
      `HTTP status: ${response.status}\nUnable to read response body.`,
      { cause: error },
    );
  }
}
