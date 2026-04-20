import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultWorkspaceRoot = path.resolve(__dirname, '../../..');
export const defaultWorkspaceBuildProjects = ['@midscene/playground-app'];

export const shouldBuildWorkspaceDeps = (env = process.env) =>
  !(
    env.NX_TASK_TARGET_PROJECT === 'studio' &&
    env.NX_TASK_TARGET_TARGET === 'build'
  );

/**
 * Direct `pnpm --dir apps/studio build` runs do not get Nx target dependency
 * expansion, so we proactively build the renderer package chain first. When
 * Nx is already orchestrating the `studio:build` target, skip this to avoid
 * rebuilding the same dependencies twice.
 */
export const buildWorkspaceDeps = ({
  env = process.env,
  runner = spawnSync,
  workspaceRoot = defaultWorkspaceRoot,
  projects = defaultWorkspaceBuildProjects,
} = {}) => {
  if (!shouldBuildWorkspaceDeps(env)) {
    return false;
  }

  const args = [
    'exec',
    'nx',
    'run-many',
    '--target=build',
    '--projects',
    projects.join(','),
  ];
  const result = runner('pnpm', args, {
    cwd: workspaceRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw new Error('Failed to launch the Studio workspace dependency build.', {
      cause: result.error,
    });
  }

  if (result.status !== 0) {
    throw new Error(
      `Studio workspace dependency build failed with exit code ${result.status}.`,
    );
  }

  return true;
};

const isDirectInvocation =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  buildWorkspaceDeps();
}
