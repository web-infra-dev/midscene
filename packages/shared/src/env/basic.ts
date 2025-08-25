import { BASIC_ENV_KEYS } from './types';

/**
 * get basic env value from process.env
 * use a single file to avoid circular dependency
 */
export const getBasicEnvValue = (key: (typeof BASIC_ENV_KEYS)[number]) => {
  if (!BASIC_ENV_KEYS.includes(key)) {
    throw new Error(`getBasicEnvValue with key ${key} is not supported.`);
  }
  return process.env[key];
};
