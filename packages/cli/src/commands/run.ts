import type { CommandModule } from 'yargs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { BatchRunner } from '../batch-runner';
import { loadEnv, matchYamlFiles } from '../cli-utils';
import { createConfig, createFilesConfig, defaultConfig } from '../config-factory';

// Convert kebab-case to camelCase
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert camelCase to kebab-case
function camelToKebab(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^-/, '');
}

// Helper function to ensure both formats exist for all keys in an object
function ensureBothFormats(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const camelKey = kebabToCamel(key);
    const kebabKey = camelToKebab(key);
    result[kebabKey] = obj[key];
    result[camelKey] = obj[key];
  }
  return result;
}

declare const __VERSION__: string;

export async function parseRunArgs(rawArgs: string[]): Promise<{
  path?: string;
  files?: string[];
  options: Record<string, any>;
}> {
  const args = yargs(rawArgs)
    .parserConfiguration({
      'dot-notation': true,
    })
    .options({
      files: {
        type: 'array',
        string: true,
        description: 'A list of yaml files to run, separated by space',
      },
      config: {
        type: 'string',
        description: 'Path to a configuration file',
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
        description: `Run the browser in headed mode, default is ${defaultConfig.headed}`,
      },
      'keep-window': {
        type: 'boolean',
        description: `Keep the browser window open after the script finishes, default is ${defaultConfig.keepWindow}`,
      },
      'share-browser-context': {
        type: 'boolean',
        description: `Share browser context across multiple yaml files, default is ${defaultConfig.shareBrowserContext}`,
      },
      'dotenv-override': {
        type: 'boolean',
        description: `Whether .env variables override globals, default is ${defaultConfig.dotenvOverride}`,
      },
      'dotenv-debug': {
        type: 'boolean',
        description: `Turn on logging for dotenv, default is ${defaultConfig.dotenvDebug}`,
      },
    })
    .help(false)
    .version(false);

  const argv = await args.argv;

  const transformedArgv: any = { ...argv };
  if (argv.web && typeof argv.web === 'object') {
    transformedArgv.web = ensureBothFormats(argv.web as Record<string, unknown>);
  }
  if (argv.android && typeof argv.android === 'object') {
    transformedArgv.android = ensureBothFormats(argv.android as Record<string, unknown>);
  }
  if (argv.ios && typeof argv.ios === 'object') {
    transformedArgv.ios = ensureBothFormats(argv.ios as Record<string, unknown>);
  }

  return {
    path: argv._[0] as string | undefined,
    files: argv.files as string[] | undefined,
    options: transformedArgv,
  };
}

async function executeRun(rawArgs: string[]): Promise<void> {
  const { options, path, files: cmdFiles } = await parseRunArgs(rawArgs);

  const welcome = `\nWelcome to @midscene/cli v${__VERSION__}\n`;
  console.log(welcome);

  if (options.url) {
    console.error(
      'the cli mode is no longer supported, please use yaml file instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information.',
    );
    process.exit(1);
  }

  const configFile = options.config as string | undefined;

  if (!configFile && !path && !(cmdFiles && cmdFiles.length > 0)) {
    console.error('No script path, files, or config provided');
    process.exit(1);
  }

  const configOptions = {
    concurrent: options.concurrent,
    continueOnError: options['continue-on-error'],
    summary: options.summary,
    shareBrowserContext: options['share-browser-context'],
    headed: options.headed,
    keepWindow: options['keep-window'],
    dotenvOverride: options['dotenv-override'],
    dotenvDebug: options['dotenv-debug'],
    web: options.web,
    android: options.android,
    ios: options.ios,
    files: cmdFiles,
  };

  let config;

  if (configFile) {
    config = await createConfig(configFile, configOptions);
    console.log(`   Config file: ${configFile}`);
  } else if (cmdFiles && cmdFiles.length > 0) {
    console.log('   Executing YAML files from --files argument...');
    config = await createFilesConfig(cmdFiles, configOptions);
  } else if (path) {
    const files = await matchYamlFiles(path);
    if (files.length === 0) {
      console.error(`No yaml files found in ${path}`);
      process.exit(1);
    }
    console.log('   Executing YAML files...');
    config = await createFilesConfig(files, configOptions);
  }

  if (!config) {
    console.error('Could not create a valid configuration.');
    process.exit(1);
  }

  loadEnv({
    debug: config.dotenvDebug,
    override: config.dotenvOverride,
    verbose: true,
  });

  const executor = new BatchRunner(config);
  await executor.run();
  const success = executor.printExecutionSummary();

  if (config.keepWindow) {
    setInterval(() => {
      console.log('browser is still running, use ctrl+c to stop it');
    }, 5000);
  } else {
    if (!success) {
      process.exit(1);
    }
    process.exit(0);
  }
}

export const runCommand: CommandModule = {
  command: 'run [path]',
  describe: 'Run a YAML script',
  builder: (yargs) => {
    return yargs
      .positional('path', {
        describe: 'Path to YAML script file or directory',
        type: 'string',
      })
      .option('files', {
        type: 'array',
        string: true,
        description: 'A list of yaml files to run',
      })
      .option('config', {
        type: 'string',
        description: 'Path to a configuration file',
      })
      .option('summary', {
        type: 'string',
        description: 'Path for the summary output file',
      })
      .option('concurrent', {
        type: 'number',
        description: `Number of concurrent executions (default: ${defaultConfig.concurrent})`,
      })
      .option('continue-on-error', {
        type: 'boolean',
        description: 'Continue execution even if some tasks fail',
      })
      .option('headed', {
        type: 'boolean',
        description: 'Run the browser in headed mode',
      })
      .option('keep-window', {
        type: 'boolean',
        description: 'Keep the browser window open after script finishes',
      })
      .option('share-browser-context', {
        type: 'boolean',
        description: 'Share browser context across multiple yaml files',
      })
      .option('dotenv-override', {
        type: 'boolean',
        description: 'Whether .env variables override globals',
      })
      .option('dotenv-debug', {
        type: 'boolean',
        description: 'Turn on logging for dotenv',
      })
      .parserConfiguration({
        'dot-notation': true,
      })
      .example('$0 run script.yaml', 'Run a YAML script')
      .example('$0 run scripts/', 'Run all YAML files in directory')
      .example('$0 run --files a.yaml b.yaml', 'Run specific files')
      .example('$0 run script.yaml --headed', 'Run with visible browser');
  },
  handler: async (argv) => {
    // Pass all args after 'run' to parseRunArgs for full yargs dot-notation handling
    const runIndex = process.argv.indexOf('run');
    const rawArgs = runIndex >= 0 ? process.argv.slice(runIndex + 1) : [];
    await executeRun(rawArgs).catch((e) => {
      console.error(e);
      process.exit(1);
    });
  },
};

// Exported for backward compat ($0 fallback)
export async function runFromFallback(): Promise<void> {
  // In fallback mode, we skip the 'run' subcommand and parse all args
  const rawArgs = hideBin(process.argv);
  await executeRun(rawArgs).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
