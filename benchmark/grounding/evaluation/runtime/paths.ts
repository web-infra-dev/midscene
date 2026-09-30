import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const groundingRoot = path.resolve(currentDir, '../..');
export const workspaceRoot = path.resolve(groundingRoot, '../..');
export const publicDataDir = path.join(groundingRoot, '_data');
export const privateDataDir = path.join(groundingRoot, '_private');
export const casesDir = path.join(publicDataDir, 'cases');
export const modelsFilePath = process.env.GROUNDING_MODELS_FILE
  ? path.resolve(process.env.GROUNDING_MODELS_FILE)
  : path.join(privateDataDir, 'models.json');

export function resolveTaskOutputRoot(
  taskOutputRoot = process.env.TASK_OUTPUT_ROOT,
): string {
  const normalizedTaskOutputRoot = taskOutputRoot?.trim();
  if (!normalizedTaskOutputRoot) {
    return path.join(groundingRoot, 'output');
  }

  if (path.isAbsolute(normalizedTaskOutputRoot)) {
    return normalizedTaskOutputRoot;
  }

  return path.resolve(groundingRoot, normalizedTaskOutputRoot);
}

export const outputRootDir = resolveTaskOutputRoot();
export const outputCacheDir = process.env.GROUNDING_CACHE_ROOT
  ? path.resolve(process.env.GROUNDING_CACHE_ROOT)
  : path.join(outputRootDir, 'cache');
export const outputRunsDir = path.join(outputRootDir, 'runs');

export const datasetDir = path.join(publicDataDir, 'dataset');
