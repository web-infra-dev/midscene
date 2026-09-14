import { z } from 'zod';
import type { ToolCliOption, ToolDefinition } from '../agent-tools/types';
import { getKeyAliases } from '../key-alias-utils';
import { CLIError } from './cli-error';
import { parseCliValue } from './cli-value';
export { parseValue } from './cli-value';

function walkCliArgs(
  args: string[],
  setArgValue: (key: string, value: string | true) => void,
): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const body = arg.slice(2);
    const eqIdx = body.indexOf('=');

    if (eqIdx >= 0) {
      const key = body.slice(0, eqIdx);
      setArgValue(key, body.slice(eqIdx + 1));
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      i++;
      setArgValue(body, args[i]);
    } else {
      setArgValue(body, true);
    }
  }
}

function buildCliFieldIndex(
  def: ToolDefinition,
): ReadonlyMap<string, z.ZodTypeAny> {
  const fieldByCliName = new Map<string, z.ZodTypeAny>();

  for (const [schemaKey, field] of Object.entries(def.schema)) {
    for (const cliName of getAcceptedCliOptionNames(
      schemaKey,
      def.cli?.options?.[schemaKey],
    )) {
      fieldByCliName.set(cliName, field);
    }
  }

  return fieldByCliName;
}

export function parseCliArgs(
  args: string[],
  def?: ToolDefinition,
): Record<string, unknown> {
  const fieldByCliName = def ? buildCliFieldIndex(def) : undefined;
  const tokensByName = new Map<string, Array<string | true>>();
  walkCliArgs(args, (key, raw) => {
    const tokens = tokensByName.get(key) ?? [];
    tokens.push(raw);
    tokensByName.set(key, tokens);
  });

  const result: Record<string, unknown> = {};
  for (const [key, tokens] of tokensByName) {
    let elementIndex = 0;
    for (const raw of tokens) {
      const existing = result[key];
      const value =
        raw === true
          ? true
          : parseCliValue(
              raw,
              fieldByCliName?.get(key),
              tokens.length > 1 ? elementIndex : undefined,
            );
      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
      elementIndex = Array.isArray(result[key]) ? result[key].length : 1;
    }
  }

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

/**
 * Move CLI args parsed under accepted alias spellings (kebab-case, alternate
 * casings, `cli.options.aliases` entries) onto the schema's canonical key so
 * tool handlers can read them with a single field name regardless of which
 * spelling the user typed. Throws `CLIError` on conflicting double-spellings
 * (e.g. both `--imageName` and `--image-name`).
 */
export function canonicalizeCliArgKeys(
  scriptName: string,
  commandName: string,
  def: ToolDefinition,
  rawArgs: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(def.schema).length === 0) return rawArgs;

  const result: Record<string, unknown> = { ...rawArgs };

  for (const schemaKey of Object.keys(def.schema)) {
    const cliOption = def.cli?.options?.[schemaKey];
    const acceptedSpellings = getAcceptedCliOptionNames(schemaKey, cliOption);

    let chosenSpelling: string | undefined;
    let chosenValue: unknown;

    for (const spelling of acceptedSpellings) {
      if (spelling === schemaKey) continue;
      if (!(spelling in result)) continue;
      if (chosenSpelling !== undefined) {
        throw new CLIError(
          `Conflicting CLI options "--${chosenSpelling}" and "--${spelling}" for ${scriptName} ${commandName}: both target "${schemaKey}". Use one spelling.`,
        );
      }
      chosenSpelling = spelling;
      chosenValue = result[spelling];
    }

    if (chosenSpelling === undefined) continue;

    if (schemaKey in result && result[schemaKey] !== chosenValue) {
      throw new CLIError(
        `Conflicting CLI options "--${schemaKey}" and "--${chosenSpelling}" for ${scriptName} ${commandName}: both target "${schemaKey}". Use one spelling.`,
      );
    }

    result[schemaKey] = chosenValue;
    delete result[chosenSpelling];
  }

  return result;
}
