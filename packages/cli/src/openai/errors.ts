import { inspect } from 'node:util';

export class SiwcError extends Error {}

export function describeSiwcError(error: unknown): string {
  return inspect(error, {
    depth: null,
    colors: false,
    maxArrayLength: null,
    maxStringLength: null,
  });
}

export async function withSiwcStage<T>(
  stage: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new SiwcError(`Stage: ${stage}`, { cause: error });
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
