import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLIError } from '@midscene/shared/cli';
import type { DeviceDefinition } from './device';
import { coerceCliValue } from './schema';

/** Minimal `--key value` / `--key=value` / `--flag` parser. */
export function parseFlags(args: string[]) {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    else if (i + 1 < args.length && !args[i + 1].startsWith('--'))
      flags[arg.slice(2)] = args[++i];
    else flags[arg.slice(2)] = true;
  }
  return { positionals, flags };
}

const camel = (key: string) =>
  key.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
export const str = (value: string | true | undefined, name: string) => {
  if (value === true) throw new CLIError(`--${name} needs a value`);
  return value;
};

export async function loadDefinition(
  file: string,
): Promise<DeviceDefinition<any>> {
  const href = pathToFileURL(resolve(file)).href;
  const mod = await import(/* webpackIgnore: true */ href);
  const definition = mod.default ?? mod.device;
  if (!definition || typeof definition.connect !== 'function')
    throw new CLIError(
      `${file} must default-export a device definition with connect(options)`,
    );
  return definition;
}

/** Turn leftover CLI flags into instance options using the definition's schema. */
export function parseDeviceOptions(
  definition: DeviceDefinition<any>,
  flags: Record<string, string | true>,
) {
  const properties = definition.options?.properties ?? {};
  const options: Record<string, unknown> = {};
  for (const [flag, raw] of Object.entries(flags)) {
    const key = camel(flag);
    const schema = properties[key];
    if (!schema) {
      const known = Object.keys(properties);
      throw new CLIError(
        `Unknown option --${flag} for "${definition.name}".${known.length ? ` Available: ${known.map((k) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).join(', ')}` : ' This device takes no options.'}`,
      );
    }
    options[key] =
      raw === true
        ? 'type' in schema && schema.type === 'boolean'
          ? true
          : raw
        : coerceCliValue(schema, raw);
    if (
      options[key] === true &&
      !('type' in schema && schema.type === 'boolean')
    )
      throw new CLIError(`--${flag} needs a value`);
  }
  return options;
}
