import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStudioRuntimeEnv,
  resolveDefaultStudioRunDir,
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

  it('defaults the Studio run directory to a system temp directory', () => {
    const env = buildStudioRuntimeEnv({
      baseEnv: {},
      studioRootDir,
    });

    expect(env.MIDSCENE_RUN_DIR).toBe(resolveDefaultStudioRunDir());
  });

  it('preserves an existing MIDSCENE_RUN_DIR override', () => {
    const env = buildStudioRuntimeEnv({
      baseEnv: { MIDSCENE_RUN_DIR: '/custom/studio-run' },
      studioRootDir,
    });

    expect(env.MIDSCENE_RUN_DIR).toBe('/custom/studio-run');
  });

  it('strips NODE_PATH so Electron resolves workspace packages deterministically', () => {
    const env = buildStudioRuntimeEnv({
      baseEnv: {
        FOO: 'bar',
        NODE_PATH: '/tmp/global-node-path',
      },
      studioRootDir,
    });

    expect(env.FOO).toBe('bar');
    expect(env.NODE_PATH).toBeUndefined();
  });
});
