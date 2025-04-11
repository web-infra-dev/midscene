export function deepMerge(target: unknown, source: unknown): any {
  const output = Object.assign({}, target as Record<string, unknown>);
  if (
    typeof target !== 'object' ||
    target === null ||
    typeof source !== 'object' ||
    source === null
  ) {
    return source;
  }

  const sourceRecord = source as Record<string, unknown>;
  const targetRecord = target as Record<string, unknown>;

  for (const key of Object.keys(sourceRecord)) {
    const targetVal = targetRecord[key];
    const sourceVal = sourceRecord[key];
    if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      // Deduplicate args/ignoreDefaultArgs, prefer source values
      output[key] = Array.from(
        new Set([
          ...(key === 'args' || key === 'ignoreDefaultArgs'
            ? targetVal.filter(
                (arg: string) =>
                  !sourceVal.some(
                    (launchArg: string) =>
                      arg.startsWith('--') &&
                      launchArg.startsWith(arg.split('=')[0]),
                  ),
              )
            : targetVal),
          ...sourceVal,
        ]),
      );
    } else if (sourceVal instanceof Object && key in target) {
      output[key] = deepMerge(targetVal, sourceVal);
    } else {
      output[key] = sourceVal;
    }
  }
  return output;
}
