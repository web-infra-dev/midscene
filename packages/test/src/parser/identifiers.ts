import { createHash } from 'node:crypto';

/** Internal invocation identity keeps repeated legacy files distinct. */
export const createCaseInvocationId = (
  projectId: string,
  sourcePath: string,
  caseIndex: number,
  invocationIndex = 0,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        projectId,
        sourcePath,
        caseIndex,
        ...(invocationIndex ? [invocationIndex] : []),
      ]),
    )
    .digest('hex');

export const createDocumentInvocationId = (
  projectId: string,
  sourcePath: string,
  invocationIndex = 0,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        projectId,
        sourcePath,
        ...(invocationIndex ? [invocationIndex] : []),
      ]),
    )
    .digest('hex');
