import type { IModelConfig } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import { createProxyAgentIfNeeded } from '../proxy';
import { resolveSystemOneEndpoint } from './resolve-endpoint';
import type { SystemOneRequest } from './schema';
import { encodeSystemOneImages } from './utils';

export async function prepareSystemOne(
  config: IModelConfig,
  request: SystemOneRequest,
) {
  assert(config.openaiApiKey, 'Jev requires MIDSCENE_*_MODEL_API_KEY');
  assert(
    !config.protocol || config.protocol === 'openai-chat',
    'Jev uses System One, not the Responses API',
  );
  const url = resolveSystemOneEndpoint(config);
  const isOpenRouter = new URL(url).hostname === 'openrouter.ai';
  const { imageState, assets } = encodeSystemOneImages(
    request.images,
    isOpenRouter,
  );
  const body = {
    ...config.extraBody,
    model: config.modelName,
    state: { ...request.state, ...imageState },
    questions: request.questions,
    ...(!isOpenRouter && Object.keys(assets).length ? { assets } : {}),
  };
  const serializedBody = JSON.stringify(body);
  assert(
    new TextEncoder().encode(serializedBody).length <= 32 * 1024 * 1024,
    'Jev request exceeds the 32 MiB body limit',
  );
  return {
    url,
    body: serializedBody,
    questions: request.questions,
    headers: {
      ...(config.openaiExtraConfig?.defaultHeaders as
        | Record<string, string>
        | undefined),
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
      'TypeSafe-Danger-Zone-Images': 'true',
    },
    dispatcher: await createProxyAgentIfNeeded({
      socksProxy: config.socksProxy,
      httpProxy: config.httpProxy,
    }),
  };
}
