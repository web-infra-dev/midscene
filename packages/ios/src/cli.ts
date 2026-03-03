import { createRequire } from 'node:module';
import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { IOSMidsceneTools } from './mcp-tools';
const pkg = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const tools = new IOSMidsceneTools();
runToolsCLI(tools, 'midscene-ios', {
  stripPrefix: 'ios_',
  version: pkg.version,
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
