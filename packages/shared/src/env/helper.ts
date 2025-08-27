import { assert } from '../utils';
import type { IModelConfig } from './model-config';

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

export const maskConfig = (config: IModelConfig) => {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      if (['openaiApiKey', 'azureOpenaiKey', 'anthropicApiKey'].includes(key)) {
        return [key, maskKey(value)];
      } else if (['openaiExtraConfig', 'azureExtraConfig'].includes(key)) {
        return [key, maskKey(JSON.stringify(value))];
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

export const createAssert =
  (
    modelNameKey: string,
    provider: 'process.env' | 'modelConfig',
    modelName?: string,
  ) =>
  (value: string | undefined, key: string, modelVendorFlag?: string) => {
    if (modelName) {
      if (modelVendorFlag) {
        assert(
          value,
          `The ${key} must be a non-empty string because of the ${modelNameKey} is declared as ${modelName} and ${modelVendorFlag} has also been specified in ${provider}, but got: ${value}. Please check your config.`,
        );
      } else {
        assert(
          value,
          `The ${key} must be a non-empty string because of the ${modelNameKey} is declared as ${modelName} in ${provider}, but got: ${value}. Please check your config.`,
        );
      }
    } else {
      // assert(
      //   value,
      //   `The ${key} must be a non-empty string, but got: ${value}. Please check your config.`,
      // );
    }
  };
