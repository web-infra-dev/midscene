import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { getDebug } from '../logger';
import type { BaseMidsceneTools } from '../mcp/base-tools';
import type {
  ToolDefinition,
  ToolResult,
  ToolResultContent,
} from '../mcp/types';

const debug = getDebug('cli-runner');

interface CLICommand {
  name: string;
  def: ToolDefinition;
}

export interface CLIRunnerOptions {
  stripPrefix?: string;
  argv?: string[];
  version?: string;
}

export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode = 1,
  ) {
    super(message);
  }
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

export function parseCliArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const body = arg.slice(2);
    const eqIdx = body.indexOf('=');

    if (eqIdx >= 0) {
      // --key=value
      result[body.slice(0, eqIdx)] = parseValue(body.slice(eqIdx + 1));
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      // --key value
      i++;
      result[body] = parseValue(args[i]);
    } else {
      // --flag (boolean)
      result[body] = true;
    }
  }

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

function printCommandHelp(scriptName: string, cmd: CLICommand): void {
  const { def } = cmd;
  console.log(`\nUsage: ${scriptName} ${cmd.name} [options]\n`);
  console.log(def.description);

  const schemaEntries = Object.entries(def.schema);
  if (schemaEntries.length > 0) {
    console.log('\nOptions:');
    for (const [key, zodType] of schemaEntries) {
      const desc = zodType.description ?? '';
      console.log(`  --${key.padEnd(20)} ${desc}`);
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
  for (const { name, def } of commands) {
    console.log(`  ${name.padEnd(30)} ${def.description}`);
  }
  console.log(`  ${'version'.padEnd(30)} Show CLI version`);
  console.log(`\nRun "${scriptName} <command> --help" for more info.`);
}

export async function runToolsCLI(
  tools: BaseMidsceneTools,
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

  const parsedArgs = parseCliArgs(restArgs);
  debug('command: %s, args: %s', match.name, JSON.stringify(parsedArgs));

  if (parsedArgs.help === true) {
    debug('showing command help for: %s', match.name);
    printCommandHelp(scriptName, match);
    return;
  }

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
