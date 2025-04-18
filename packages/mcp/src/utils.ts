// Deep merge utility function
export function deepMerge(target: any, source: any): any {
  const output = Object.assign({}, target);
  if (typeof target !== 'object' || typeof source !== 'object') return source;

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
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
