import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BaseMidsceneTools } from '../mcp/base-tools';
import type { ToolDefinition, ToolResult } from '../mcp/types';

function parseCliArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const withoutDashes = arg.slice(2);
    const eqIdx = withoutDashes.indexOf('=');

    let key: string;
    let rawValue: string;

    if (eqIdx >= 0) {
      key = withoutDashes.slice(0, eqIdx);
      rawValue = withoutDashes.slice(eqIdx + 1);
    } else {
      key = withoutDashes;
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        rawValue = next;
        i++;
      } else {
        result[key] = true;
        continue;
      }
    }

    // Try JSON parse for objects/arrays
    if (rawValue.startsWith('{') || rawValue.startsWith('[')) {
      try {
        result[key] = JSON.parse(rawValue);
        continue;
      } catch {}
    }
    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      result[key] = Number(rawValue);
      continue;
    }
    result[key] = rawValue;
  }
  return result;
}

function outputResult(result: ToolResult): void {
  for (const item of result.content) {
    if (item.type === 'text') {
      if (result.isError) {
        console.error(item.text);
      } else {
        console.log(item.text);
      }
    } else if (item.type === 'image') {
      const filename = `screenshot-${Date.now()}.png`;
      const filepath = join(process.cwd(), filename);
      writeFileSync(filepath, Buffer.from(item.data, 'base64'));
      console.log(`Screenshot saved: ${filepath}`);
    }
  }
}

function stripToolPrefix(name: string, prefix?: string): string {
  if (prefix && name.startsWith(prefix)) {
    return name.slice(prefix.length);
  }
  return name;
}

function printHelp(
  scriptName: string,
  tools: { cliName: string; def: ToolDefinition }[],
): void {
  console.log(`\nUsage: ${scriptName} <command> [options]\n`);
  console.log('Commands:');
  for (const { cliName, def } of tools) {
    const desc =
      def.description.length > 60
        ? `${def.description.slice(0, 57)}...`
        : def.description;
    console.log(`  ${cliName.padEnd(30)} ${desc}`);
  }
  console.log(`\nRun "${scriptName} <command> --help" for more info.`);
}

interface CLIRunnerOptions {
  stripPrefix?: string;
}

export async function runToolsCLI(
  tools: BaseMidsceneTools,
  scriptName: string,
  options?: CLIRunnerOptions,
): Promise<void> {
  await tools.initTools();
  const toolDefs = tools.getToolDefinitions();

  const cliTools = toolDefs.map((def) => ({
    cliName: stripToolPrefix(def.name, options?.stripPrefix),
    def,
  }));

  const args = process.argv.slice(2);
  const commandName = args[0];

  if (!commandName || commandName === '--help' || commandName === '-h') {
    printHelp(scriptName, cliTools);
    return;
  }

  const match = cliTools.find((t) => t.cliName === commandName);
  if (!match) {
    console.error(`Unknown command: ${commandName}`);
    printHelp(scriptName, cliTools);
    process.exit(1);
  }

  const parsedArgs = parseCliArgs(args.slice(1));

  try {
    const result = await match.def.handler(parsedArgs);
    outputResult(result);
    if (result.isError) process.exit(1);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
