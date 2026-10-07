import { isAbsolute } from 'node:path';
import type { NodeScopeTeardownResult } from './types';

export const reportPathsFromTeardown = (
  // biome-ignore lint/suspicious/noConfusingVoidType: this consumes the intentional void teardown return.
  result: NodeScopeTeardownResult | void,
): readonly string[] => {
  if (result === undefined) return [];
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new TypeError('Node teardown result must be an object or undefined.');
  }
  const paths = result.reportPaths;
  if (paths === undefined) return [];
  if (!Array.isArray(paths)) {
    throw new TypeError('Node teardown reportPaths must be an array.');
  }
  return paths.map((path, index) => {
    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new TypeError(
        `Node teardown reportPaths[${index}] must be a non-empty string.`,
      );
    }
    if (!isAbsolute(path)) {
      throw new TypeError(
        `Node teardown reportPaths[${index}] must be an absolute path.`,
      );
    }
    return path;
  });
};
