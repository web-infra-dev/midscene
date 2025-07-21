import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import { glob } from 'glob';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

declare const __VERSION__: string;

const debug = getDebug('midscene:cli');

export const parseProcessArgs = async (): Promise<{
  path?: string;
  files?: string[];
  options: Record<string, any>;
}> => {
  const args = yargs(hideBin(process.argv))
    .usage(
      `Midscene.js helps you automate browser actions, assertions, and data extraction by AI. 
Homepage: https://midscenejs.com/
Github: https://github.com/web-infra-dev/midscene

Usage: $0 [options] <path-to-yaml-script-file-or-directory>
       $0 --files <file1> <file2 ...>
       $0 --config <path-to-config-file>`,
    )
    .options({
      headed: {
        type: 'boolean',
        default: false,
        description: 'Run the browser in headed mode to see the browser UI',
      },
      'keep-window': {
        type: 'boolean',
        default: false,
        description:
          'Keep the browser window open after the script finishes. This is useful when debugging, but will consume more resources',
      },
      'dotenv-override': {
        type: 'boolean',
        default: false,
        description:
          'Whether the variables in the .env file override the global variables, the default is false',
      },
      'dotenv-debug': {
        type: 'boolean',
        default: true,
        description:
          'Turn on logging to help debug why certain keys or values are not being set as you expect',
      },
      concurrent: {
        type: 'number',
        default: 1,
        description: 'Number of concurrent executions',
      },
      'continue-on-error': {
        type: 'boolean',
        default: false,
        description: 'Continue execution even if some tasks fail',
      },
      summary: {
        type: 'string',
        description: 'Path for the summary output file',
      },
      'share-browser-context': {
        type: 'boolean',
        default: false,
        description: 'Share browser context across multiple files',
      },
      files: {
        type: 'array',
        string: true,
        description: 'A list of yaml files to run, separated by space',
      },
      config: {
        type: 'string',
        description:
          'Path to a configuration file. Options in this file are used as defaults.',
      },
      'web.user-agent': {
        alias: 'web.userAgent',
        type: 'string',
        description: 'Override user agent for web environments.',
      },
      'web.viewport-width': {
        alias: 'web.viewportWidth',
        type: 'number',
        description: 'Override viewport width for web environments.',
      },
      'web.viewport-height': {
        alias: 'web.viewportHeight',
        type: 'number',
        description: 'Override viewport height for web environments.',
      },
      'android.device-id': {
        alias: 'android.deviceId',
        type: 'string',
        description: 'Override device ID for Android environments.',
      },
    })
    .version('version', 'Show version number', __VERSION__)
    .help()
    .wrap(yargs().terminalWidth());

  const argv = await args.argv;
  debug('argv', argv);

  return {
    path: argv._[0] as string | undefined,
    files: argv.files as string[] | undefined,
    options: argv,
  };
};

// match yml or yaml files
export async function matchYamlFiles(
  fileGlob: string,
  options?: {
    cwd?: string;
  },
) {
  if (existsSync(fileGlob) && statSync(fileGlob).isDirectory()) {
    fileGlob = join(fileGlob, '**/*.{yml,yaml}');
  }

  const { cwd } = options || {};
  const ignore = ['**/node_modules/**'];
  const files = await glob(fileGlob, {
    nodir: true,
    windowsPathsNoEscape: true,
    absolute: true,
    ignore,
    cwd,
  });

  return files
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
}
