import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../model-adapter/types';
import { defaultOpenAICompatibleAdapterConfig } from './default';

export const gemmaAdapters = {
  gemma: defaultOpenAICompatibleAdapterConfig,
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gemma'>;
