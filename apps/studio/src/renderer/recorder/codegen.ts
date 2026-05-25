import type { IModelConfig } from '@midscene/shared/env';
import type { StudioRecorderCodeType } from '@shared/electron-contract';
import { toStudioRecorderCodegenInput } from './codegen-adapter';
import { resolveStudioRecorderModelConfig } from './model-config';
import type { StudioRecordingSession } from './types';

function normalizeGeneratedCode(content: string, type: StudioRecorderCodeType) {
  const trimmed = content.trim();
  const fenceLanguage =
    type === 'yaml' ? '(?:ya?ml)?' : '(?:ts|tsx|typescript|js|javascript)?';
  const fencedMatch = trimmed.match(
    new RegExp(`^\`\`\`${fenceLanguage}\\s*([\\s\\S]*?)\\s*\`\`\`$`, 'i'),
  );
  return `${(fencedMatch?.[1] ?? trimmed).trim()}\n`;
}

function requireStudioRuntime() {
  if (!window.studioRuntime) {
    throw new Error('Studio runtime bridge is unavailable.');
  }
  return window.studioRuntime;
}

function toSerializableModelConfig(modelConfig: IModelConfig): IModelConfig {
  const { createOpenAIClient: _createOpenAIClient, ...serializableConfig } =
    modelConfig;
  return serializableConfig;
}

export async function generateStudioRecorderCodeWithAI(
  session: StudioRecordingSession,
  options: {
    type?: StudioRecorderCodeType;
    language?: string;
    modelConfig?: IModelConfig;
    onChunk?: (content: string) => void;
  } = {},
) {
  const type = options.type || 'yaml';
  if (session.events.length === 0) {
    throw new Error(`No events provided for ${type} generation.`);
  }
  if (type === 'playwright' && session.target.platformId !== 'web') {
    throw new Error(
      'Playwright generation is only available for Web recordings.',
    );
  }

  const modelConfig = resolveStudioRecorderModelConfig(options.modelConfig);
  const input = toStudioRecorderCodegenInput(session, {
    language: options.language,
  });
  const runtime = requireStudioRuntime();
  const serializableModelConfig = toSerializableModelConfig(modelConfig);
  const code =
    typeof runtime.generateRecorderCode === 'function'
      ? (
          await runtime.generateRecorderCode({
            type,
            input,
            modelConfig: serializableModelConfig,
          })
        ).code
      : type === 'yaml' && typeof runtime.generateRecorderYaml === 'function'
        ? (
            await runtime.generateRecorderYaml({
              input,
              modelConfig: serializableModelConfig,
            })
          ).yaml
        : null;
  if (!code) {
    throw new Error('Studio recorder codegen bridge is unavailable.');
  }
  const normalizedCode = normalizeGeneratedCode(code, type);
  options.onChunk?.(normalizedCode);
  return normalizedCode;
}

export async function generateStudioRecorderYamlWithAI(
  session: StudioRecordingSession,
  options: {
    language?: string;
    modelConfig?: IModelConfig;
    onChunk?: (content: string) => void;
  } = {},
) {
  return generateStudioRecorderCodeWithAI(session, {
    ...options,
    type: 'yaml',
  });
}

export async function generateStudioRecorderMetadataWithAI(
  session: StudioRecordingSession,
  options: {
    modelConfig?: IModelConfig;
  } = {},
) {
  if (session.events.length === 0) {
    throw new Error('No events provided for recorder metadata generation.');
  }

  const runtime = requireStudioRuntime();
  if (typeof runtime.generateRecorderMetadata !== 'function') {
    throw new Error('Studio recorder metadata bridge is unavailable.');
  }

  const modelConfig = resolveStudioRecorderModelConfig(options.modelConfig);
  return runtime.generateRecorderMetadata({
    input: {
      target: session.target,
      events: session.events,
      fallbackName: session.name,
      maxScreenshots: 1,
    },
    modelConfig: toSerializableModelConfig(modelConfig),
  });
}
