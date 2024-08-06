export type ArgumentValueType = string | boolean | number;

export interface Argument {
  name: string;
  value: ArgumentValueType;
}

export function parse(args: string[]): Argument[] {
  const orderedArgs: Argument[] = [];
  args.forEach((arg, index) => {
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      let value: ArgumentValueType =
        args[index + 1] && !args[index + 1].startsWith('--')
          ? args[index + 1]
          : true;

      if (typeof value === 'string' && /^\d+$/.test(value)) {
        value = Number.parseInt(value, 10);
      }
      orderedArgs.push({ name: key, value });
    }
  });

  return orderedArgs;
}

export function findOnlyItemInArgs(
  args: Argument[],
  name: string,
): ArgumentValueType {
  const found = args.filter((arg) => arg.name === name);
  if (found.length === 0) {
    return false;
  }

  if (found.length > 1) {
    throw new Error(`Multiple values found for ${name}`);
  }

  return found[0].value;
}
