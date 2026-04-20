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
  const env = {
    ...baseEnv,
    ...overrides,
  };

  if (!env.DOTENV_CONFIG_PATH && studioRootDir) {
    const repoEnvPath = resolveRepoEnvPath(studioRootDir);
    if (envPathExists(repoEnvPath)) {
      env.DOTENV_CONFIG_PATH = repoEnvPath;
    }
  }

  return env;
};
