import type { TestProjectRunOptions } from './execution-plan';

const validateUniqueStrings = (
  values: readonly string[] | undefined,
  label: string,
): readonly string[] | undefined => {
  if (values === undefined) return undefined;
  if (
    !Array.isArray(values) ||
    values.some(
      (value) => typeof value !== 'string' || value.trim().length === 0,
    )
  ) {
    throw new TypeError(`${label} must be an array of non-empty strings.`);
  }
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} must not contain duplicates.`);
  }
  return values;
};

export const validateRunSelection = (
  options: TestProjectRunOptions,
): Pick<TestProjectRunOptions, 'paths' | 'caseIds' | 'tags'> => {
  const paths = validateUniqueStrings(options.paths, 'Test selection paths');
  const caseIds = validateUniqueStrings(
    options.caseIds,
    'Test selection caseIds',
  );
  const include = validateUniqueStrings(
    options.tags?.include,
    'Test selection tags.include',
  );
  const exclude = validateUniqueStrings(
    options.tags?.exclude,
    'Test selection tags.exclude',
  );
  return {
    ...(paths ? { paths } : {}),
    ...(caseIds ? { caseIds } : {}),
    ...(include || exclude
      ? {
          tags: {
            ...(include ? { include } : {}),
            ...(exclude ? { exclude } : {}),
          },
        }
      : {}),
  };
};
