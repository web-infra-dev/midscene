import { getBasicEnvValue } from 'src/env/basic';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIDSCENE_RUN_DIR } from '../../../src/env';

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
