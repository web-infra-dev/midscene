import fs from 'node:fs';
import path from 'node:path';

export const resolveRepoEnvPath = (studioRootDir) =>
  path.resolve(studioRootDir, '..', '..', '.env');

export const buildStudioRuntimeEnv = ({
  baseEnv = process.env,
  envPathExists = fs.existsSync,
  overrides = {},
  studioRootDir,
} = {}) => {
  const { NODE_PATH: _ignoredNodePath, ...baseEnvWithoutNodePath } = baseEnv;
  const env = {
    ...baseEnvWithoutNodePath,
    ...overrides,
  };

  // Studio should resolve workspace packages from the repo, not from global
  // wrapper environments that inject unrelated module search paths.
  if ('NODE_PATH' in env) {
    const { NODE_PATH: _ignoredOverrideNodePath, ...envWithoutNodePath } = env;
    return finalizeStudioRuntimeEnv(
      envWithoutNodePath,
      envPathExists,
      studioRootDir,
    );
  }

  return finalizeStudioRuntimeEnv(env, envPathExists, studioRootDir);
};

function finalizeStudioRuntimeEnv(env, envPathExists, studioRootDir) {
  if (!env.DOTENV_CONFIG_PATH && studioRootDir) {
    const repoEnvPath = resolveRepoEnvPath(studioRootDir);
    if (envPathExists(repoEnvPath)) {
      env.DOTENV_CONFIG_PATH = repoEnvPath;
    }
  }

  return env;
}
