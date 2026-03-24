import type { IModelConfig } from '@midscene/shared/env';

export function shouldForceOriginalImageDetail(
  modelConfig: Pick<IModelConfig, 'intent' | 'modelFamily'>,
): boolean {
  return (
    modelConfig.modelFamily === 'gpt-5' && modelConfig.intent === 'default'
  );
}
