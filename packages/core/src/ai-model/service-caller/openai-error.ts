import { getDebug } from '@midscene/shared/logger';

const MAX_ERROR_RESPONSE_BODY_LENGTH = 4000;
const MAX_FETCH_ERROR_LENGTH = 4000;

const debugOpenAIFetch = getDebug('ai:call');

export interface OpenAIErrorResponseContext {
  rawResponseBodies?: Array<{
    attempt: number;
    body: string;
  }>;
  fetchErrors?: Array<{
    attempt: number;
    error: string;
  }>;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}... [truncated, ${text.length} chars total]`;
}

function truncateErrorResponseBody(body: string): string {
  return truncateText(body, MAX_ERROR_RESPONSE_BODY_LENGTH);
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function formatErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const code = getErrorCode(error);
    const codeText = code ? ` [${code}]` : '';
    return `${error.name}${codeText}: ${error.message}`;
  }

  return String(error);
}

function formatFetchErrorForReport(error: unknown): string {
  const details = [formatErrorSummary(error)];
  const cause =
    error && typeof error === 'object'
      ? (error as { cause?: unknown }).cause
      : undefined;

  if (cause !== undefined) {
    details.push(`Cause: ${formatErrorSummary(cause)}`);
  }

  return truncateText(details.join('\n'), MAX_FETCH_ERROR_LENGTH);
}

// Mirrors OpenAI SDK's default fetch selection:
// openai@6.3.0 src/client.ts sets `this.fetch = options.fetch ?? Shims.getDefaultFetch()`,
// and src/internal/shims.ts resolves that default to global `fetch`.
function getDefaultFetch(): typeof fetch {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch;
  }

  throw new Error(
    '`fetch` is not defined as a global; check that the runtime provides globalThis.fetch or polyfill it before creating the OpenAI client',
  );
}

export function wrapOpenAICompatibleFetch(
  context: OpenAIErrorResponseContext,
): typeof fetch {
  const baseFetch = getDefaultFetch();
  let attempt = 0;

  return async (input, init) => {
    attempt += 1;
    let response: Response;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      const fetchErrorSummary = formatFetchErrorForReport(error);
      debugOpenAIFetch('OpenAI-compatible fetch failed', fetchErrorSummary);
      context.fetchErrors ??= [];
      context.fetchErrors.push({
        attempt,
        error: fetchErrorSummary,
      });
      throw error;
    }

    if (!response.ok) {
      // OpenAI SDK only exposes the `error` field for JSON error responses.
      // Non-standard provider bodies like `{ err: 'xxx' }` would otherwise be
      // hidden from Midscene's final error message.
      const rawResponseBody = await response
        .clone()
        .text()
        .catch(() => undefined);

      if (rawResponseBody !== undefined) {
        context.rawResponseBodies ??= [];
        context.rawResponseBodies.push({
          attempt,
          body: rawResponseBody,
        });
      }
    }

    return response;
  };
}

export function formatOpenAIAPIErrorDetails(
  _error: unknown,
  context: OpenAIErrorResponseContext,
): string {
  const details: string[] = [];

  if (context.rawResponseBodies?.length === 1) {
    details.push(
      `OpenAI raw error response body: ${truncateErrorResponseBody(
        context.rawResponseBodies[0].body,
      )}`,
    );
  } else if (context.rawResponseBodies?.length) {
    const rawResponseBodyDetails = context.rawResponseBodies
      .map(
        ({ attempt, body }) =>
          `Attempt ${attempt}: ${truncateErrorResponseBody(body)}`,
      )
      .join('\n');

    details.push(
      `OpenAI raw error response bodies:\n${rawResponseBodyDetails}`,
    );
  }

  if (context.fetchErrors?.length === 1) {
    details.push(
      `OpenAI fetch error (attempt ${context.fetchErrors[0].attempt}): ${context.fetchErrors[0].error}`,
    );
  } else if (context.fetchErrors?.length) {
    const fetchErrorDetails = context.fetchErrors
      .map(({ attempt, error }) => `Attempt ${attempt}: ${error}`)
      .join('\n');

    details.push(`OpenAI fetch errors:\n${fetchErrorDetails}`);
  }

  if (!details.length) {
    return '';
  }

  return `\n${details.join('\n')}`;
}
