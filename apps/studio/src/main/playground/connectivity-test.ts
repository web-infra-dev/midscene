import { runConnectivityTest as runCoreConnectivityTest } from '@midscene/core/ai-model';
import { ModelConfigManager } from '@midscene/shared/env';
import type {
  ConnectivityTestRequest,
  ConnectivityTestResult,
} from '@shared/electron-contract';
import {
  normalizeStudioModelProvider,
  resolveModelConnectionWithConfig,
} from '../../shared/model-connection';

export async function runConnectivityTest(
  request: ConnectivityTestRequest,
): Promise<ConnectivityTestResult> {
  const normalizedRequest = Object.fromEntries(
    Object.entries(normalizeStudioModelProvider(request)).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const resolvedWithConfig = resolveModelConnectionWithConfig(request);
  if ('error' in resolvedWithConfig) {
    return {
      passed: false,
      message: resolvedWithConfig.error,
    };
  }

  const modelConfigManager = new ModelConfigManager(normalizedRequest);

  return runCoreConnectivityTest({
    defaultModelConfig: modelConfigManager.getModelConfig('default'),
    planningModelConfig: modelConfigManager.getModelConfig('planning'),
    insightModelConfig: modelConfigManager.getModelConfig('insight'),
  });
}
