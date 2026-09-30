import type { ImageType } from '../types.js';
import { DEFAULT_MIDSCENE_RUN_CONFIG } from './run-config.js';
import type { MidsceneRunConfig } from './types.js';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function normalizeImageTypes(value: unknown): ImageType[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MIDSCENE_RUN_CONFIG.selection.imageTypes];
  }

  const supported = value.filter(
    (item): item is ImageType => item === 'sd' || item === 'hd',
  );

  return uniqueStrings(supported).length > 0
    ? (uniqueStrings(supported) as ImageType[])
    : [...DEFAULT_MIDSCENE_RUN_CONFIG.selection.imageTypes];
}

function normalizePromptSource(value: unknown): 'primary' | 'fallback' {
  return value === 'primary' || value === 'fallback'
    ? value
    : DEFAULT_MIDSCENE_RUN_CONFIG.selection.promptSource;
}

function normalizeLocateImplementation(value: unknown): 'aiLocate' | 'aiAct' {
  return value === 'aiAct' || value === 'aiLocate'
    ? value
    : DEFAULT_MIDSCENE_RUN_CONFIG.locate.implementation;
}

function normalizeProviderConcurrency(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MIDSCENE_RUN_CONFIG.execution.providerConcurrency;
  }

  return Math.min(5, Math.max(1, Math.floor(parsed)));
}

export function normalizeMidsceneRunConfig(raw: unknown): MidsceneRunConfig {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const meta =
    source.meta && typeof source.meta === 'object'
      ? (source.meta as Record<string, unknown>)
      : {};
  const selection =
    source.selection && typeof source.selection === 'object'
      ? (source.selection as Record<string, unknown>)
      : {};
  const execution =
    source.execution && typeof source.execution === 'object'
      ? (source.execution as Record<string, unknown>)
      : {};
  const locate =
    source.locate && typeof source.locate === 'object'
      ? (source.locate as Record<string, unknown>)
      : {};
  const modelConfig =
    source.modelConfig && typeof source.modelConfig === 'object'
      ? (source.modelConfig as Record<string, unknown>)
      : {};
  const debug =
    source.debug && typeof source.debug === 'object'
      ? (source.debug as Record<string, unknown>)
      : {};

  return {
    meta: {
      title:
        typeof meta.title === 'string'
          ? meta.title.trim()
          : DEFAULT_MIDSCENE_RUN_CONFIG.meta.title,
      objective:
        typeof meta.objective === 'string'
          ? meta.objective.trim()
          : DEFAULT_MIDSCENE_RUN_CONFIG.meta.objective,
      note:
        typeof meta.note === 'string'
          ? meta.note.trim()
          : DEFAULT_MIDSCENE_RUN_CONFIG.meta.note,
    },
    selection: {
      modelIds: uniqueStrings(normalizeStringArray(selection.modelIds)),
      caseNames: uniqueStrings(normalizeStringArray(selection.caseNames)),
      excludeCaseNames: uniqueStrings(
        normalizeStringArray(selection.excludeCaseNames),
      ),
      imageTypes: normalizeImageTypes(selection.imageTypes),
      promptSource: normalizePromptSource(selection.promptSource),
    },
    execution: {
      iterations: Math.max(
        1,
        Math.floor(Number(execution.iterations)) ||
          DEFAULT_MIDSCENE_RUN_CONFIG.execution.iterations,
      ),
      providerConcurrency: normalizeProviderConcurrency(
        execution.providerConcurrency,
      ),
      runId:
        typeof execution.runId === 'string'
          ? execution.runId.trim()
          : DEFAULT_MIDSCENE_RUN_CONFIG.execution.runId,
    },
    locate: {
      useDeepLocate:
        typeof locate.useDeepLocate === 'boolean'
          ? locate.useDeepLocate
          : DEFAULT_MIDSCENE_RUN_CONFIG.locate.useDeepLocate,
      implementation: normalizeLocateImplementation(locate.implementation),
      aiActDeepThink:
        typeof locate.aiActDeepThink === 'boolean'
          ? locate.aiActDeepThink
          : DEFAULT_MIDSCENE_RUN_CONFIG.locate.aiActDeepThink,
    },
    modelConfig: {
      reasoningEnabled:
        typeof modelConfig.reasoningEnabled === 'boolean'
          ? modelConfig.reasoningEnabled
          : undefined,
    },
    debug: {
      enableLangSmith:
        typeof debug.enableLangSmith === 'boolean'
          ? debug.enableLangSmith
          : DEFAULT_MIDSCENE_RUN_CONFIG.debug.enableLangSmith,
    },
  };
}
