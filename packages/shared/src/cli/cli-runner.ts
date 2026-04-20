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
import {
  formatCliValidationError,
  getCliOptionDisplay,
  parseCliArgs,
} from './cli-args';
import { CLIError } from './cli-error';

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

export { parseCliArgs, parseValue } from './cli-args';
export { CLIError, reportCLIError } from './cli-error';

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

  const parsedArgs = parseCliArgs(restArgs);
  if (parsedArgs.help === true) {
    debug('showing command help for: %s', match.name);
    printCommandHelp(scriptName, match);
    return;
  }

  const cliValidationError = formatCliValidationError(
    scriptName,
    match.name,
    match.def,
    parsedArgs,
  );
  if (cliValidationError) {
    throw new CLIError(cliValidationError);
  }

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
