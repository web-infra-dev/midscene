import { z } from 'zod';
import { getKeyAliases } from '../key-alias-utils';
import type { ToolCliOption, ToolDefinition } from '../mcp/types';

export function parseValue(raw: string): unknown {
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      // Not valid JSON, treat as string below
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  return raw;
}

function walkCliArgs(
  args: string[],
  setArgValue: (key: string, value: unknown) => void,
): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const body = arg.slice(2);
    const eqIdx = body.indexOf('=');

    if (eqIdx >= 0) {
      setArgValue(body.slice(0, eqIdx), parseValue(body.slice(eqIdx + 1)));
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      i++;
      setArgValue(body, parseValue(args[i]));
    } else {
      setArgValue(body, true);
    }
  }
}

export function parseCliArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  walkCliArgs(args, (key, value) => {
    result[key] = value;
  });

  return result;
}

function formatCliOptionName(name: string): string {
  return `--${name}`;
}

export function getCliOptionDisplay(
  key: string,
  cliOption?: ToolCliOption,
): { label: string; aliases: string[] } {
  const label = formatCliOptionName(cliOption?.preferredName ?? key);
  const aliases = [...new Set(cliOption?.aliases ?? [])]
    .map((alias) => formatCliOptionName(alias))
    .filter((alias) => alias !== label);

  return { label, aliases };
}

function getAcceptedCliOptionNames(
  key: string,
  cliOption?: ToolCliOption,
): string[] {
  return [
    ...new Set(
      cliOption
        ? [cliOption.preferredName ?? key, ...(cliOption.aliases ?? [])]
        : [key, ...getKeyAliases(key)],
    ),
  ];
}

function toOptionalCliSchemaField(field: unknown): z.ZodTypeAny {
  if (
    typeof field === 'object' &&
    field !== null &&
    typeof (field as z.ZodTypeAny).optional === 'function'
  ) {
    return (field as z.ZodTypeAny).optional();
  }

  const description =
    typeof field === 'object' &&
    field !== null &&
    'description' in field &&
    typeof (field as { description?: unknown }).description === 'string'
      ? (field as { description: string }).description
      : undefined;
  return description ? z.any().describe(description) : z.any();
}

function buildCliArgSchema(def: ToolDefinition): Record<string, z.ZodTypeAny> {
  return Object.fromEntries(
    Object.entries(def.schema).flatMap(([key, zodType]) =>
      getAcceptedCliOptionNames(key, def.cli?.options?.[key]).map((cliKey) => [
        cliKey,
        toOptionalCliSchemaField(zodType),
      ]),
    ),
  );
}

function buildDisallowedCliSpellings(def: ToolDefinition): Set<string> {
  const disallowedSpellings = new Set<string>();

  for (const [key] of Object.entries(def.schema)) {
    const cliOption = def.cli?.options?.[key];
    const acceptedNames = new Set(getAcceptedCliOptionNames(key, cliOption));
    const knownSpellings = new Set<string>([
      key,
      ...getKeyAliases(key),
      ...(cliOption?.preferredName
        ? getKeyAliases(cliOption.preferredName)
        : []),
      ...(cliOption?.aliases ?? []),
    ]);

    for (const spelling of knownSpellings) {
      if (!acceptedNames.has(spelling)) {
        disallowedSpellings.add(spelling);
      }
    }
  }

  return disallowedSpellings;
}

export function formatCliValidationError(
  scriptName: string,
  commandName: string,
  def: ToolDefinition,
  rawArgs: Record<string, unknown>,
): string | undefined {
  if (Object.keys(def.schema).length === 0) {
    return undefined;
  }

  const cliSchema = z.object(buildCliArgSchema(def)).strict();
  const parsed = cliSchema.safeParse(rawArgs);
  if (parsed.success) {
    return undefined;
  }

  const disallowedSpellings = buildDisallowedCliSpellings(def);
  const unknownKeys = parsed.error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys : [],
  );

  if (unknownKeys.length > 0) {
    return unknownKeys
      .map((key) => {
        if (disallowedSpellings.has(key)) {
          return `Unsupported option "--${key}" for ${scriptName} ${commandName}.`;
        }
        return `Unknown option "--${key}" for ${scriptName} ${commandName}.`;
      })
      .join('\n');
  }

  const [issue] = parsed.error.issues;
  const optionName =
    typeof issue?.path[0] === 'string' ? `--${issue.path[0]}` : 'CLI arguments';
  return `Invalid value for "${optionName}" in ${scriptName} ${commandName}: ${issue?.message ?? parsed.error.message}`;
}
