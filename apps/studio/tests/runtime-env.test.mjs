import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStudioRuntimeEnv,
  resolveRepoEnvPath,
} from '../scripts/runtime-env.mjs';

const studioRootDir = '/repo/apps/studio';
const repoEnvPath = path.resolve('/repo/.env');

describe('runtime-env', () => {
  it('resolves the repo root env path from the studio root', () => {
    expect(resolveRepoEnvPath(studioRootDir)).toBe(repoEnvPath);
  });

  it('injects DOTENV_CONFIG_PATH when repo env exists', () => {
    const env = buildStudioRuntimeEnv({
      baseEnv: { FOO: 'bar' },
      envPathExists: (candidate) => candidate === repoEnvPath,
      overrides: { BAR: 'baz' },
      studioRootDir,
    });

    expect(env.FOO).toBe('bar');
    expect(env.BAR).toBe('baz');
    expect(env.DOTENV_CONFIG_PATH).toBe(repoEnvPath);
  });

  it('preserves an existing DOTENV_CONFIG_PATH override', () => {
    const env = buildStudioRuntimeEnv({
      baseEnv: { DOTENV_CONFIG_PATH: '/custom/.env' },
      envPathExists: () => true,
      studioRootDir,
    });

    expect(env.DOTENV_CONFIG_PATH).toBe('/custom/.env');
  });
});
