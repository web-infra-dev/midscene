import type { ModelRuntime } from '../../../models';
import type { CallAIOptions } from '../../types';
import { siwcTokenManager } from './token-manager';

/** Build effective request settings without mutating the user's configuration. */
export async function prepareSiwcCall(
  modelRuntime: ModelRuntime,
  options?: CallAIOptions,
): Promise<{ modelRuntime: ModelRuntime; options?: CallAIOptions }> {
  if (modelRuntime.config.authMode !== 'siwc') {
    return { modelRuntime, options };
  }
  const baseURL = 'https://api.openai.com/v1';
  const apiKey = await siwcTokenManager.getAccessToken();
  return {
    modelRuntime: {
      ...modelRuntime,
      config: {
        ...modelRuntime.config,
        openaiBaseURL: baseURL,
        openaiApiKey: apiKey,
        openaiExtraConfig: {
          ...modelRuntime.config.openaiExtraConfig,
          baseURL,
          apiKey,
        },
        protocol: 'openai-responses',
        streamMode: 'stream',
      },
    },
    options: { ...options, stream: true },
  };
}
