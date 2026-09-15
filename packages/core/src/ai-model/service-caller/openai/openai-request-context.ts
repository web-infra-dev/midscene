import { getDebug } from '@midscene/shared/logger';

const MAX_ERROR_RESPONSE_BODY_LENGTH = 4000;
const MAX_FETCH_ERROR_LENGTH = 4000;

const debugOpenAIFetch = getDebug('ai:call');

export interface OpenAIRequestContext {
  recordEvent?: (event: Record<string, unknown>) => void;
  responseRequestId?: {
    requestId: string;
    status: number;
    ok: boolean;
  };
  rawResponseBody?: string;
  fetchError?: string;
  httpResponse?: {
    status: number;
    ok: boolean;
    headers: Array<[string, string]>;
    body?: string;
  };
}

function headersToEntries(
  headers: HeadersInit | undefined,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  new Headers(headers).forEach((value, key) => entries.push([key, value]));
  return entries;
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
  context: OpenAIRequestContext,
): typeof fetch {
  const baseFetch = getDefaultFetch();

  return async (input, init) => {
    if (context.recordEvent) {
      // Midscene does not expose a custom fetch hook. The OpenAI SDK therefore
      // always invokes this wrapper with standard Fetch API input and init.
      const request = new Request(input, init);
      context.recordEvent({
        type: 'request',
        request: {
          url: request.url,
          method: request.method,
          body: await request
            .clone()
            .text()
            .catch(() => undefined),
        },
      });
    }
    let response: Response;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      const fetchErrorSummary = formatFetchErrorForReport(error);
      debugOpenAIFetch('OpenAI-compatible fetch failed', fetchErrorSummary);
      context.fetchError = fetchErrorSummary;
      context.recordEvent?.({
        type: 'error',
        error: fetchErrorSummary,
      });
      throw error;
    }

    const requestId =
      response.headers.get('x-request-id') ??
      response.headers.get('x-model-request-id');

    if (requestId) {
      context.responseRequestId = {
        requestId,
        status: response.status,
        ok: response.ok,
      };
    }

    if (!response.ok) {
      // OpenAI SDK only exposes the `error` field for JSON error responses.
      // Non-standard provider bodies like `{ err: 'xxx' }` would otherwise be
      // hidden from Midscene's final error message.
      const rawResponseBody = await response
        .clone()
        .text()
        .catch(() => undefined);

      context.rawResponseBody = rawResponseBody;
    }

    if (context.recordEvent) {
      const isStream = response.headers
        .get('content-type')
        ?.includes('text/event-stream');
      const body = isStream
        ? undefined
        : await response
            .clone()
            .text()
            .catch(() => undefined);
      const httpResponse = {
        status: response.status,
        ok: response.ok,
        headers: headersToEntries(response.headers),
        ...(body === undefined ? {} : { body }),
      };
      context.httpResponse = httpResponse;
      if (!response.ok) {
        context.recordEvent({ type: 'error', ...httpResponse });
      }
    }

    return response;
  };
}

export function formatOpenAIAPIErrorDetails(
  _error: unknown,
  context: OpenAIRequestContext,
): string {
  const details: string[] = [];

  if (context.rawResponseBody !== undefined) {
    details.push(
      `OpenAI raw error response body: ${truncateErrorResponseBody(context.rawResponseBody)}`,
    );
  }

  if (context.responseRequestId && !context.responseRequestId.ok) {
    const { requestId, status } = context.responseRequestId;
    details.push(
      `OpenAI error response request ID (status ${status}): ${requestId}`,
    );
  }

  if (context.fetchError !== undefined) {
    details.push(`OpenAI fetch error: ${context.fetchError}`);
  }

  if (!details.length) {
    return '';
  }

  return `\n${details.join('\n')}`;
}
