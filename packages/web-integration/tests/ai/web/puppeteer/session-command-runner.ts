import path from 'node:path';
import dotenv from 'dotenv';
import { WebPuppeteerMidsceneTools } from '../../../../src/mcp-tools-puppeteer';

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

dotenv.config({
  path: path.join(REPO_ROOT, '.env'),
});

function parseArgs(argv: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const value = argv[i + 1];

    if (value && !value.startsWith('--')) {
      result[key] = value;
      i++;
    } else {
      result[key] = true;
    }
  }

  return result;
}

function resolveToolName(commandName: string): string {
  switch (commandName) {
    case 'connect':
      return 'web_connect';
    case 'disconnect':
      return 'web_disconnect';
    case 'export_session_report':
      return 'export_session_report';
    case 'close':
      return 'web_close';
    default:
      return commandName;
  }
}

async function writeMarkedLine(
  stream: NodeJS.WriteStream,
  prefix: string,
  payload: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(`${prefix}${JSON.stringify(payload)}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const [commandName, ...restArgs] = process.argv.slice(2);
  if (!commandName) {
    throw new Error('A command name is required');
  }

  const tools = new WebPuppeteerMidsceneTools();
  await tools.initTools();

  const toolName = resolveToolName(commandName);
  const tool = tools
    .getToolDefinitions()
    .find((definition) => definition.name === toolName);

  if (!tool) {
    throw new Error(`Unknown tool command: ${commandName}`);
  }

  const args = parseArgs(restArgs);
  const result = await tool.handler(args);

  await writeMarkedLine(process.stdout, '__RESULT__', {
    isError: !!result.isError,
    text: result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text),
    imageCount: result.content.filter((item) => item.type === 'image').length,
  });

  // Force exit because Puppeteer DevTools connections keep the event loop alive.
  process.exit(result.isError ? 1 : 0);
}

main().catch(async (error) => {
  await writeMarkedLine(process.stderr, '__ERROR__', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
