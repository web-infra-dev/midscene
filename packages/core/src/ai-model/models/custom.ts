import {
  CUSTOM_MODEL_ADAPTER_REF_PREFIX,
  type TCustomModelAdapterRef,
  isCustomModelAdapterRef,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { ModelAdapterDefinition } from './types';

export { isCustomModelAdapterRef };

const warnCustomModelAdapter = getDebug('ai:model-adapter:custom', {
  console: true,
});

function getRuntimeRequire(): NodeRequire {
  const runtimeRequire = typeof require === 'function' ? require : undefined;

  if (!runtimeRequire) {
    throw new Error(
      'Custom model adapter requires a Node.js CommonJS runtime because it loads a CommonJS adapter file synchronously.',
    );
  }

  return runtimeRequire;
}

export function resolveCustomModelAdapterSpecifier(
  ref: TCustomModelAdapterRef,
): string {
  const specifier = ref.slice(CUSTOM_MODEL_ADAPTER_REF_PREFIX.length);

  if (!specifier) {
    throw new Error('Custom model adapter specifier is empty after "custom:".');
  }

  return getRuntimeRequire().resolve(specifier, {
    paths: [process.cwd()],
  });
}

export function getCustomModelAdapterCacheKey(
  ref: TCustomModelAdapterRef,
): string {
  return `custom:${resolveCustomModelAdapterSpecifier(ref)}`;
}

function normalizeCustomModelAdapterModule(
  mod: unknown,
  adapterPath: string,
): ModelAdapterDefinition {
  if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
    throw new Error(
      `Custom model adapter module must export a ModelAdapterDefinition object: ${adapterPath}`,
    );
  }

  return mod as ModelAdapterDefinition;
}

export function loadCustomModelAdapterDefinition(
  ref: TCustomModelAdapterRef,
): ModelAdapterDefinition {
  const adapterSpecifier = resolveCustomModelAdapterSpecifier(ref);

  try {
    const mod = getRuntimeRequire()(adapterSpecifier);
    const adapterDefinition = normalizeCustomModelAdapterModule(
      mod,
      adapterSpecifier,
    );
    warnCustomModelAdapter(
      `Using custom model adapter from ${adapterSpecifier}. This is an experimental feature and its API may change.`,
    );
    return adapterDefinition;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;

    if (code === 'ERR_REQUIRE_ESM') {
      throw new Error(
        `Custom model adapter currently supports CommonJS only. Use a .cjs adapter file instead of ESM: ${adapterSpecifier}`,
      );
    }

    if (error instanceof Error) {
      throw new Error(
        `Failed to load custom model adapter from ${adapterSpecifier}: ${error.message}`,
      );
    }

    throw new Error(
      `Failed to load custom model adapter from ${adapterSpecifier}`,
    );
  }
}
