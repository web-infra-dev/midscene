import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { closeCommand } from './commands/close';
import { connectCommand } from './commands/connect';
import { doCommand } from './commands/do';
import { runCommand, runFromFallback } from './commands/run';
import { addGlobalOptions } from './global-options';

declare const __VERSION__: string;

function isYamlPath(arg: string | undefined): boolean {
  if (!arg) return false;
  return /\.(ya?ml)$/i.test(arg) || arg.includes('*');
}

const cli = yargs(hideBin(process.argv))
  .scriptName('midscene')
  .version('version', 'Show version number', __VERSION__);

addGlobalOptions(cli);

cli
  .command(doCommand)
  .command(runCommand)
  .command(connectCommand)
  .command(closeCommand)
  .command(
    '$0 [path]',
    false, // hidden — backward compat
    (yargs) => {
      return yargs.positional('path', {
        describe: 'Path to YAML script (backward compat)',
        type: 'string',
      });
    },
    async (argv) => {
      const path = argv.path as string | undefined;
      if (path && isYamlPath(path)) {
        await runFromFallback();
      } else if (!path) {
        // No args — show help
        cli.showHelp();
      } else {
        console.error(`Unknown command: ${path}`);
        console.error('Use "midscene --help" for usage information.');
        process.exit(1);
      }
    },
  )
  .usage(
    `Midscene CLI - AI-powered automation

Usage:
  $0 <command> [options]
  $0 <script.yaml>           (backward compat, same as: $0 run <script.yaml>)

Homepage: https://midscenejs.com
Github: https://github.com/web-infra-dev/midscene`,
  )
  .example('$0 do act "click the login button" -p web', 'Perform a browser action')
  .example('$0 do screenshot -p computer', 'Capture desktop screenshot')
  .example('$0 do query "what is the page title?"', 'Extract information')
  .example('$0 run script.yaml --headed', 'Run YAML script with headed browser')
  .example('$0 script.yaml', 'Backward compat: run YAML script')
  .strict(false)
  .help()
  .wrap(yargs().terminalWidth())
  .parse();
