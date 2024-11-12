import type minimist from 'minimist';

export type ArgumentValueType = string | boolean | number;
export function findOnlyItemInArgs(
  args: minimist.ParsedArgs,
  name: string,
): string | boolean | number | undefined {
  const found = args[name];
  if (found === undefined) {
    return false;
  }

  if (Array.isArray(found) && found.length > 1) {
    throw new Error(`Multiple values found for ${name}`);
  }

  return found;
}

export interface OrderedArgumentItem {
  name: string;
  value: ArgumentValueType;
}

export function orderMattersParse(args: string[]): OrderedArgumentItem[] {
  const orderedArgs: OrderedArgumentItem[] = [];
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
