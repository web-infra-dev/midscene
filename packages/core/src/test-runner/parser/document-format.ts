export const nativeWorkflowRootKeys = [
  'beforeAll',
  'beforeEach',
  'cases',
  'afterEach',
  'afterAll',
] as const;

export type WorkflowDocumentFormat =
  | 'legacy'
  | 'legacy-batch'
  | 'native'
  | 'mixed'
  | 'unknown';

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Classify only the document envelope. Parsing and schema validation remain
 * owned by the selected command so this helper can never route execution.
 */
export const classifyWorkflowDocumentFormat = (
  value: unknown,
): WorkflowDocumentFormat => {
  if (!isMapping(value)) return 'unknown';

  const hasLegacyRoot = Object.hasOwn(value, 'tasks');
  const hasNativeRoot = nativeWorkflowRootKeys.some((key) =>
    Object.hasOwn(value, key),
  );

  if (hasLegacyRoot && hasNativeRoot) return 'mixed';
  if (hasLegacyRoot) return 'legacy';
  if (hasNativeRoot) return 'native';
  if (Array.isArray(value.files)) return 'legacy-batch';
  return 'unknown';
};
