import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import { glob } from 'glob';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { defaultConfig } from './config-factory';

declare const __VERSION__: string;

const debug = getDebug('midscene:cli');

// Convert kebab-case to camelCase
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert camelCase to kebab-case
function camelToKebab(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^-/, ''); // Remove leading dash if present
}

export const parseProcessArgs = async (): Promise<{
  path?: string;
  files?: string[];
  options: Record<string, any>;
}> => {
  const args = yargs(hideBin(process.argv))
    .parserConfiguration({
      'dot-notation': true, // Enable dot notation to parse --web.userAgent as nested object
    })
    .usage(
      `Midscene.js helps you automate browser actions, assertions, and data extraction by AI. 
Homepage: https://midscenejs.com
Github: https://github.com/web-infra-dev/midscene

Usage: 
      $0 [options] <path-to-yaml-script-file-or-directory>
      $0 [options] --files <yaml-file1> <yaml-file2 ...>
      $0 [options] --config <path-to-config-yaml-file>`,
    )
    .options({
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
      summary: {
        type: 'string',
        description: 'Path for the summary output file',
      },
      concurrent: {
        type: 'number',
        description: `Number of concurrent executions, default is ${defaultConfig.concurrent}`,
      },
      'continue-on-error': {
        type: 'boolean',
        description: `Continue execution even if some tasks fail, default is ${defaultConfig.continueOnError}`,
      },
      headed: {
        type: 'boolean',
        description: `Run the browser in headed mode to see the browser UI, default is ${defaultConfig.headed}`,
      },
      'keep-window': {
        type: 'boolean',
        description: `Keep the browser window open after the script finishes. This option automatically enables --headed mode. This is useful when debugging, but will consume more resources, default is ${defaultConfig.keepWindow}`,
      },
      'share-browser-context': {
        type: 'boolean',
        description: `Share browser context across multiple yaml files, default is ${defaultConfig.shareBrowserContext}`,
      },
      'dotenv-override': {
        type: 'boolean',
        description: `Whether the variables in the .env file override the global variables, the default is ${defaultConfig.dotenvOverride}`,
      },
      'dotenv-debug': {
        type: 'boolean',
        description: `Turn on logging to help debug why certain keys or values are not being set as you expect, default is ${defaultConfig.dotenvDebug}`,
      },
    })
    .version('version', 'Show version number', __VERSION__)
    .help()
    .epilogue(`For complete list of configuration options, please visit:
  • Web options: https://midscenejs.com/automate-with-scripts-in-yaml#the-web-part
  • Android options: https://midscenejs.com/automate-with-scripts-in-yaml#the-android-part
  • iOS options: https://midscenejs.com/automate-with-scripts-in-yaml#the-ios-part

Examples:
  $0 script.yaml --web.user-agent "Custom Agent" --web.viewport-width 1920
  $0 script.yaml --android.device-id emulator-5554 --android.ime-strategy yadb-for-non-ascii
  $0 script.yaml --ios.wda-port 8100 --ios.auto-dismiss-keyboard`)
    .wrap(yargs().terminalWidth());

  const argv = await args.argv;
  debug('argv', argv);

  // Transform arguments: ensure both kebab-case and camelCase versions exist
  const transformedArgv: any = { ...argv };

  // Helper function to ensure both formats exist for all keys in an object
  const ensureBothFormats = (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    Object.keys(obj).forEach((key) => {
      const camelKey = kebabToCamel(key);
      const kebabKey = camelToKebab(key);
      // Store both formats
      result[kebabKey] = obj[key];
      result[camelKey] = obj[key];
    });
    return result;
  };

  // Process web, android, and ios options
  if (argv.web && typeof argv.web === 'object') {
    transformedArgv.web = ensureBothFormats(argv.web);
  }
  if (argv.android && typeof argv.android === 'object') {
    transformedArgv.android = ensureBothFormats(argv.android);
  }
  if (argv.ios && typeof argv.ios === 'object') {
    transformedArgv.ios = ensureBothFormats(argv.ios);
  }

  return {
    path: argv._[0] as string | undefined,
    files: argv.files as string[] | undefined,
    options: transformedArgv,
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
