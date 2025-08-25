import { getBasicEnvValue } from 'src/env/basic';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIDSCENE_RUN_DIR } from '../../../src/env';
import {
  getIsUseQwenVl,
  uiTarsModelVersion,
  vlLocateMode,
} from '../../../src/env/utils';

describe('getBasicEnvValue', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('should return the value of the given env key', () => {
    vi.stubEnv(MIDSCENE_RUN_DIR, '<test-run-dir>');
    expect(getBasicEnvValue(MIDSCENE_RUN_DIR)).toBe('<test-run-dir>');
  });

  it('should throw if key is not in BASIC_ENV_KEYS', () => {
    expect(() =>
      // @ts-expect-error NOT_EXIST_KEY will cause ts err
      getBasicEnvValue('NOT_EXIST_KEY'),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getBasicEnvValue with key NOT_EXIST_KEY is not supported.]',
    );
  });
});

describe('uiTarsModelVersion', () => {
  it('uiTarsModelVersion will return undefined if globalConfig is not initialized', () => {
    expect(uiTarsModelVersion({ intent: 'planning' })).toBeUndefined();
  });
});

describe('vlLocateMode', () => {
  it('vlLocateMode will return undefined if globalConfig is not initialized', () => {
    expect(vlLocateMode({ intent: 'planning' })).toBeUndefined();
  });
});

describe('getIsUseQwenVl', () => {
  it('getIsUseQwenVl will return false if globalConfig is not initialized', () => {
    expect(getIsUseQwenVl({ intent: 'planning' })).toBe(false);
  });
});
