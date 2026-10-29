import type { IModelConfig } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';

export function resolveSystemOneEndpoint(config: IModelConfig): string {
  if (config.endpoint) {
    return config.endpoint;
  }
  assert(
    config.openaiBaseURL,
    'When using the System One API, you must provide MIDSCENE_*_MODEL_ENDPOINT or MIDSCENE_*_MODEL_BASE_URL.',
  );
  return `${config.openaiBaseURL.replace(/\/+$/, '')}/systemone`;
}
