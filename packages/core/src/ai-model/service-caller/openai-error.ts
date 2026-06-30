const MAX_ERROR_RESPONSE_BODY_LENGTH = 4000;

export interface OpenAIErrorResponseContext {
  rawResponseBodies?: Array<{
    attempt: number;
    body: string;
  }>;
}

function truncateErrorResponseBody(body: string): string {
  if (body.length <= MAX_ERROR_RESPONSE_BODY_LENGTH) {
    return body;
  }

  return `${body.slice(0, MAX_ERROR_RESPONSE_BODY_LENGTH)}... [truncated, ${body.length} chars total]`;
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
    const response = await baseFetch(input, init);

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
  if (!context.rawResponseBodies?.length) {
    return '';
  }

  if (context.rawResponseBodies.length === 1) {
    return `\nOpenAI raw error response body: ${truncateErrorResponseBody(
      context.rawResponseBodies[0].body,
    )}`;
  }

  const details = context.rawResponseBodies
    .map(
      ({ attempt, body }) =>
        `Attempt ${attempt}: ${truncateErrorResponseBody(body)}`,
    )
    .join('\n');

  return `\nOpenAI raw error response bodies:\n${details}`;
}
