import {
  type ChatCompletionMessageParam,
  callAIWithStringResponse,
} from '@midscene/core/ai-model';
import type {
  ConnectivityTestRequest,
  ConnectivityTestResult,
} from '@shared/electron-contract';
import {
  connectivityRequestToModelConfig,
  resolveModelConnectionWithConfig,
} from '../../shared/model-connection';

const CONNECTIVITY_TIMEOUT_MS = 30_000;
const CONNECTIVITY_PROMPT: ChatCompletionMessageParam[] = [
  {
    role: 'system',
    content: 'Reply with the exact token the user asks for.',
  },
  {
    role: 'user',
    content: 'Return exactly CONNECTIVITY_OK',
  },
];

export async function runConnectivityTest(
  request: ConnectivityTestRequest,
): Promise<ConnectivityTestResult> {
  const resolvedWithConfig = resolveModelConnectionWithConfig(
    connectivityRequestToModelConfig(request),
  );
  if ('error' in resolvedWithConfig) {
    return { ok: false, error: resolvedWithConfig.error };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONNECTIVITY_TIMEOUT_MS,
  );

  try {
    const { content } = await callAIWithStringResponse(
      CONNECTIVITY_PROMPT,
      {
        ...resolvedWithConfig.modelConfig,
        timeout: Math.min(
          resolvedWithConfig.modelConfig.timeout ?? CONNECTIVITY_TIMEOUT_MS,
          CONNECTIVITY_TIMEOUT_MS,
        ),
      },
      {
        abortSignal: controller.signal,
      },
    );

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
