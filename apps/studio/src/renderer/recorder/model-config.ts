import {
  type IModelConfig,
  globalModelConfigManager,
} from '@midscene/shared/env';
import { useEnvConfig } from '@midscene/visualizer';
import { resolveModelConnectionWithConfig } from '../../shared/model-connection';
import { parseEnvText } from '../components/ShellLayout/connectivity-env';
import { loadModelEnvText } from '../components/ShellLayout/model-env-storage';

function resolveModelConfigFromProvider(
  provider: Record<string, string | number | undefined>,
): IModelConfig | null {
  const resolved = resolveModelConnectionWithConfig(provider);
  if ('error' in resolved) {
    if (resolved.kind === 'invalid-config') {
      throw new Error(resolved.error);
    }
    return null;
  }
  return resolved.modelConfig;
}

export function resolveStudioRecorderModelConfig(
  modelConfig?: IModelConfig,
): IModelConfig {
  if (modelConfig) {
    return modelConfig;
  }

  const savedEnvText = loadModelEnvText();
  if (savedEnvText.trim()) {
    const resolved = resolveModelConfigFromProvider(parseEnvText(savedEnvText));
    if (resolved) {
      return resolved;
    }
  }

  const visualizerEnvConfig = useEnvConfig.getState().config;
  const resolved = resolveModelConfigFromProvider(visualizerEnvConfig);
  if (resolved) {
    return resolved;
  }

  return globalModelConfigManager.getModelConfig('default');
}
