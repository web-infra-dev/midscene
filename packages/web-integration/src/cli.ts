import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { WebMidsceneTools } from './mcp-tools';
import { WebPuppeteerMidsceneTools } from './mcp-tools-puppeteer';

const isBridge = process.argv.includes('--bridge');
const tools = isBridge ? new WebMidsceneTools() : new WebPuppeteerMidsceneTools();
runToolsCLI(tools, 'midscene-web', { stripPrefix: 'web_' }).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
