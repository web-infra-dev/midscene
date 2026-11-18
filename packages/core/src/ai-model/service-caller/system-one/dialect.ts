import type { IModelConfig } from '@midscene/shared/env';

/**
 * Jev (TypeSafe) and Drex (nace.ai) speak the same System One protocol but
 * attach images differently and accept different question types.
 */
export type SystemOneDialect = 'jev' | 'drex';

export function getSystemOneDialect(
  config: Pick<IModelConfig, 'modelFamily'>,
): SystemOneDialect {
  return config.modelFamily === 'drex' ? 'drex' : 'jev';
}

export function getSystemOneLabel(
  config: Pick<IModelConfig, 'modelFamily'>,
): 'Jev' | 'Drex' {
  return getSystemOneDialect(config) === 'drex' ? 'Drex' : 'Jev';
}
