import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { getKeyAliases, isRecord } from '../key-alias-utils';
import { getDebug } from '../logger';
import type { BaseMidsceneTools } from '../mcp/base-tools';
import type {
  ToolCliOption,
  ToolDefinition,
  ToolResult,
  ToolResultContent,
} from '../mcp/types';

const debug = getDebug('cli-runner');

interface CLICommand {
  name: string;
  def: ToolDefinition;
  hidden?: boolean;
}

export interface CLIExtraCommand {
  name: string;
  def: ToolDefinition;
  aliases?: string[];
  hidden?: boolean;
}

export interface CLIRunnerOptions {
  stripPrefix?: string;
  argv?: string[];
  version?: string;
  extraCommands?: CLIExtraCommand[];
}

export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode = 1,
  ) {
    super(message);
  }
}

export function reportCLIError(
  error: unknown,
  log: (
    message?: unknown,
    ...optionalParams: unknown[]
  ) => void = console.error,
): number {
  if (error instanceof CLIError) {
    log(error.message);
    return error.exitCode;
  }

  log(error);
  return 1;
}

export function parseValue(raw: string): unknown {
  // JSON objects/arrays
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      // Not valid JSON, treat as string below
    }
  }

  // Numbers
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
      // --key=value
      setArgValue(body.slice(0, eqIdx), parseValue(body.slice(eqIdx + 1)));
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      // --key value
      i++;
      setArgValue(body, parseValue(args[i]));
    } else {
      // --flag (boolean)
      setArgValue(body, true);
    }
  }
}

function parseRawCliArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  walkCliArgs(args, (key, value) => {
    result[key] = value;
  });
  return result;
}

export function parseCliArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  walkCliArgs(args, (key, value) => {
    if (!key.includes('.')) {
      result[key] = value;
      return;
    }

    const segments = key.split('.');
    let current = result;

    for (const segment of segments.slice(0, -1)) {
      const aliases = getKeyAliases(segment);
      const existing = aliases.map((alias) => current[alias]);
      const nestedRecord = existing.find(isRecord);
      const conflictingScalar = existing.find(
        (entry) => entry !== undefined && !isRecord(entry),
      );
      if (conflictingScalar !== undefined) {
        throw new CLIError(
          `Conflicting CLI args: "${segment}" is used both as a value and as a namespace`,
        );
      }
      const target = nestedRecord ?? {};

      for (const alias of aliases) {
        current[alias] = target;
      }

      current = target;
    }

    const leafSegment = segments[segments.length - 1];
    for (const alias of getKeyAliases(leafSegment)) {
      current[alias] = value;
    }
  });

  return result;
}

function outputContentItem(item: ToolResultContent, isError: boolean): void {
  switch (item.type) {
    case 'text':
      if (isError) {
        console.error(item.text);
      } else {
        console.log(item.text);
      }
      break;

    case 'image': {
      const filename = `screenshot-${Date.now()}.png`;
      const filepath = join(tmpdir(), filename);
      writeFileSync(filepath, Buffer.from(item.data, 'base64'));
      console.log(`Screenshot saved: ${filepath}`);
      break;
    }

    default:
      console.log(`[${item.type} content not displayed in CLI]`);
  }
}

function outputResult(result: ToolResult): void {
  for (const item of result.content) {
    outputContentItem(item, result.isError ?? false);
  }
}

export function removePrefix(name: string, prefix?: string): string {
  if (prefix && name.startsWith(prefix)) {
    return name.slice(prefix.length);
  }
  return name;
}

function formatCliOptionName(name: string): string {
  return `--${name}`;
}

function getCliOptionDisplay(
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

function buildDisallowedCliSpellings(def: ToolDefinition): Map<string, string> {
  const disallowedSpellings = new Map<string, string>();

  for (const [key] of Object.entries(def.schema)) {
    const cliOption = def.cli?.options?.[key];
    const preferredLabel = formatCliOptionName(cliOption?.preferredName ?? key);
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
        disallowedSpellings.set(spelling, preferredLabel);
      }
    }
  }

  return disallowedSpellings;
}

function formatCliValidationError(
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
        const preferredLabel = disallowedSpellings.get(key);
        if (preferredLabel) {
          return `Unsupported option "--${key}" for ${scriptName} ${commandName}. Use "${preferredLabel}" instead.`;
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

function printCommandHelp(scriptName: string, cmd: CLICommand): void {
  const { def } = cmd;
  console.log(`\nUsage: ${scriptName} ${cmd.name} [options]\n`);
  console.log(def.description);

  const schemaEntries = Object.entries(def.schema);
  if (schemaEntries.length > 0) {
    const optionWidth = Math.max(
      22,
      ...schemaEntries.map(
        ([key]) =>
          getCliOptionDisplay(key, def.cli?.options?.[key]).label.length,
      ),
    );
    console.log('\nOptions:');
    for (const [key, zodType] of schemaEntries) {
      const { label, aliases } = getCliOptionDisplay(
        key,
        def.cli?.options?.[key],
      );
      const desc = zodType.description ?? '';
      const aliasText =
        aliases.length > 0 ? ` (aliases: ${aliases.join(', ')})` : '';
      console.log(`  ${label.padEnd(optionWidth)} ${desc}${aliasText}`);
    }
  }
}

function printVersion(scriptName: string, version: string): void {
  console.log(`${scriptName} v${version}`);
}

function printHelp(
  scriptName: string,
  commands: CLICommand[],
  version?: string,
): void {
  if (version) {
    printVersion(scriptName, version);
    console.log('');
  }
  console.log(`\nUsage: ${scriptName} <command> [options]\n`);
  console.log('Commands:');
  for (const { name, def } of commands.filter((command) => !command.hidden)) {
    console.log(`  ${name.padEnd(30)} ${def.description}`);
  }
  console.log(`  ${'version'.padEnd(30)} Show CLI version`);
  console.log(`\nRun "${scriptName} <command> --help" for more info.`);
}

type AnyMidsceneTools = BaseMidsceneTools<any, any>;

export async function runToolsCLI(
  tools: AnyMidsceneTools,
  scriptName: string,
  options?: CLIRunnerOptions,
): Promise<void> {
  const rawArgs = options?.argv ?? process.argv.slice(2);
  debug('CLI invoked: %s %s', scriptName, rawArgs.join(' '));

  // Load .env from cwd before any tool initialization
  const envFile = join(process.cwd(), '.env');
  if (existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }

  await tools.initTools();

  const commands: CLICommand[] = tools.getToolDefinitions().map((def) => ({
    name: removePrefix(def.name, options?.stripPrefix).toLowerCase(),
    def,
  }));
  if (options?.extraCommands?.length) {
    commands.push(
      ...options.extraCommands.flatMap((cmd) => [
        {
          name: cmd.name.toLowerCase(),
          def: cmd.def,
          hidden: cmd.hidden,
        },
        ...(cmd.aliases ?? []).map((alias) => ({
          name: alias.toLowerCase(),
          def: cmd.def,
          hidden: true,
        })),
      ]),
    );
  }
  const cliVersion = options?.version;

  const [commandName, ...restArgs] = rawArgs;

  if (!commandName || commandName === '--help' || commandName === '-h') {
    debug('showing help (no command or --help flag)');
    printHelp(scriptName, commands, cliVersion);
    return;
  }

  if (
    commandName === '--version' ||
    commandName === '-v' ||
    commandName.toLowerCase() === 'version'
  ) {
    if (!cliVersion) {
      throw new CLIError('Failed to determine CLI version');
    }
    printVersion(scriptName, cliVersion);
    return;
  }

  const match = commands.find(
    (c) => c.name.toLowerCase() === commandName.toLowerCase(),
  );
  if (!match) {
    debug('unknown command: %s', commandName);
    console.error(`Unknown command: ${commandName}`);
    printHelp(scriptName, commands, cliVersion);
    throw new CLIError(`Unknown command: ${commandName}`);
  }

  const rawCliArgs = parseRawCliArgs(restArgs);
  if (rawCliArgs.help === true) {
    debug('showing command help for: %s', match.name);
    printCommandHelp(scriptName, match);
    return;
  }

  const cliValidationError = formatCliValidationError(
    scriptName,
    match.name,
    match.def,
    rawCliArgs,
  );
  if (cliValidationError) {
    throw new CLIError(cliValidationError);
  }

  const parsedArgs = parseCliArgs(restArgs);
  debug('command: %s, args: %s', match.name, JSON.stringify(parsedArgs));

  const result = await match.def.handler(parsedArgs);
  debug(
    'command %s completed, isError: %s',
    match.name,
    result.isError ?? false,
  );
  outputResult(result);
  await tools.destroy();
  if (result.isError) {
    throw new CLIError('Command failed', 1);
  }
}
