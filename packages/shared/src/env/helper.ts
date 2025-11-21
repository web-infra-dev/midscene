import { assert } from '../utils';
import type { IModelConfig } from './types';

const maskKey = (key: string, maskChar = '*') => {
  if (typeof key !== 'string' || key.length === 0) {
    return key;
  }

  const prefixLen = 3;
  const suffixLen = 3;
  const keepLength = prefixLen + suffixLen;

  if (key.length <= keepLength) {
    return key;
  }

  const prefix = key.substring(0, prefixLen);
  const suffix = key.substring(key.length - suffixLen);
  const maskLength = key.length - keepLength;
  const mask = maskChar.repeat(maskLength);

  return `${prefix}${mask}${suffix}`;
};

export const maskConfig = (config: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      if (!value) return [key, value];

      if (typeof value === 'string' && /key/i.test(key)) {
        return [key, maskKey(value)];
      }
      if (typeof value === 'object') {
        const valueStr = JSON.stringify(value);
        if (/key/i.test(valueStr)) {
          return [key, maskKey(valueStr)];
        }
      }
      return [key, value];
    }),
  );
};

export const parseJson = (key: string, value: string | undefined) => {
  if (value) {
    try {
      return JSON.parse(value);
    } catch (e) {
      throw new Error(
        `Failed to parse ${key} as a JSON. ${(e as Error).message}`,
        {
          cause: e,
        },
      );
    }
  }
  return undefined;
};
