import type {
  ConnectivityTestRequest,
  ConnectivityTestResult,
} from '@shared/electron-contract';

const CONNECTIVITY_TIMEOUT_MS = 30_000;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function runConnectivityTest(
  request: ConnectivityTestRequest,
): Promise<ConnectivityTestResult> {
  const { apiKey, baseUrl, model } = request;

  if (!apiKey) {
    return { ok: false, error: 'API key is missing.' };
  }

  if (!baseUrl) {
    return { ok: false, error: 'Base URL is missing.' };
  }

  if (!model) {
    return { ok: false, error: 'Model name is missing.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONNECTIVITY_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${normalizeBaseUrl(baseUrl)}/chat/completions`,
      {
        body: JSON.stringify({
          messages: [{ content: 'Hello, how are you?', role: 'user' }],
          model,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      },
    );

    const rawBody = await response.text();

    if (!response.ok) {
      return {
        error: `HTTP ${response.status}: ${rawBody.slice(0, 200) || response.statusText}`,
        ok: false,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { error: 'Response is not valid JSON.', ok: false };
    }

    const content = extractCompletionContent(parsed);
    if (!content) {
      return {
        error: 'Response did not contain any completion text.',
        ok: false,
      };
    }

    return { ok: true, sample: content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { error: 'Request timed out.', ok: false };
    }

    const message = error instanceof Error ? error.message : String(error);
    return { error: message || 'Unknown error', ok: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractCompletionContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const firstChoice = choices[0] as
    | { message?: { content?: unknown } }
    | undefined;
  const content = firstChoice?.message?.content;

  if (typeof content === 'string' && content.trim().length > 0) {
    return content;
  }

  return null;
}
