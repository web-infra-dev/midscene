import {
  type IModelConfig,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
  ModelConfigManager,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  type TModelConfig,
} from '@midscene/shared/env';
import type { ConnectivityTestRequest } from './electron-contract';

const LEGACY_MODEL_NAME_KEYS = ['MIDSCENE_MODEL', 'OPENAI_MODEL'] as const;

export interface ModelConnectionParams {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ResolvedModelConnection extends ModelConnectionParams {
  modelConfig: IModelConfig;
}

export function connectivityRequestToModelConfig(
  request: ConnectivityTestRequest,
): TModelConfig {
  return {
    [MIDSCENE_MODEL_API_KEY]: request.apiKey,
    [MIDSCENE_MODEL_BASE_URL]: request.baseUrl,
    [MIDSCENE_MODEL_NAME]: request.model,
  };
}

export function resolveModelConnection(
  provider: Record<string, string | number | undefined>,
): ModelConnectionParams | { error: string } {
  const resolved = resolveModelConnectionWithConfig(provider);
  if ('error' in resolved) {
    return resolved;
  }

  return {
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl,
    model: resolved.model,
  };
}

export function resolveModelConnectionWithConfig(
  provider: Record<string, string | number | undefined>,
): ResolvedModelConnection | { error: string } {
  const normalizedProvider = normalizeStudioModelProvider(provider);
  const apiKey = normalizedProvider[MIDSCENE_MODEL_API_KEY]?.trim() || '';
  const baseUrl = normalizedProvider[MIDSCENE_MODEL_BASE_URL]?.trim() || '';
  const model = normalizedProvider[MIDSCENE_MODEL_NAME]?.trim() || '';

  const missing: string[] = [];
  if (!apiKey) missing.push(OPENAI_API_KEY);
  if (!baseUrl) missing.push(OPENAI_BASE_URL);
  if (!model) missing.push(MIDSCENE_MODEL_NAME);

  if (missing.length > 0) {
    return { error: `Missing required keys: ${missing.join(', ')}` };
  }

  const modelConfigManager = new ModelConfigManager(
    normalizedProvider as TModelConfig,
  );
  const modelConfig: IModelConfig = {
    ...modelConfigManager.getModelConfig('default'),
    intent: 'default',
  };

  return {
    apiKey,
    baseUrl,
    model,
    modelConfig,
  };
}

function normalizeStudioModelProvider(
  provider: Record<string, string | number | undefined>,
): Record<string, string | undefined> {
  const normalizedProvider = {
    ...Object.fromEntries(
      Object.entries(provider).map(([key, value]) => [
        key,
        value === undefined ? undefined : String(value),
      ]),
    ),
  };

  normalizedProvider[MIDSCENE_MODEL_API_KEY] = stringifyProviderValue(
    provider[MIDSCENE_MODEL_API_KEY] || provider[OPENAI_API_KEY],
  );
  normalizedProvider[MIDSCENE_MODEL_BASE_URL] = stringifyProviderValue(
    provider[MIDSCENE_MODEL_BASE_URL] || provider[OPENAI_BASE_URL],
  );

  const legacyModelName = LEGACY_MODEL_NAME_KEYS.map((key) =>
    stringifyProviderValue(provider[key]),
  ).find((value) => value && value.trim().length > 0);
  normalizedProvider[MIDSCENE_MODEL_NAME] =
    stringifyProviderValue(provider[MIDSCENE_MODEL_NAME]) || legacyModelName;

  return normalizedProvider;
}

function stringifyProviderValue(
  value: string | number | undefined,
): string | undefined {
  return value === undefined ? undefined : String(value);
}
