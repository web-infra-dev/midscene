import { createReportCliCommands } from '@midscene/core';
import type { BaseMidsceneTools } from '@midscene/shared/agent-tools/base-tools';
import { runToolsCLI } from '@midscene/shared/cli';
import { version } from '../package.json';
import { matchYamlFiles, parseProcessArgs } from './cli-utils';
import { createConfig, createFilesConfig } from './config-factory';
import { loadDotenvConfig } from './dotenv-loader';
import { createJsonResultPayload } from './execution-summary';
import { runFrameworkTestConfig } from './framework';
import { runModelCommand } from './model-command';

const withJsonOutputSilenced = async <T>(
  enabled: boolean,
  callback: () => Promise<T>,
): Promise<T> => {
  if (!enabled) return callback();

  const discardWrite = ((...args: unknown[]) => {
    const callback = args.find((arg) => typeof arg === 'function');
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  }) as typeof process.stdout.write;
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  process.stdout.write = discardWrite;
  process.stderr.write = discardWrite;

  try {
    return await callback();
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
};

Promise.resolve(
  (async () => {
    const rawArgs = process.argv.slice(2);
    const [firstArg] = rawArgs;
    if (firstArg === 'report-tool') {
      await runToolsCLI(
        {
          initTools: async () => undefined,
          destroy: async () => undefined,
          getToolDefinitions: () => [],
        } as unknown as BaseMidsceneTools,
        'midscene',
        {
          argv: rawArgs,
          version,
          extraCommands: createReportCliCommands(),
        },
      );
      return;
    }

    if (firstArg === 'model') {
      const exitCode = await runModelCommand(rawArgs);
      process.exit(exitCode);
      return;
    }

    const { options, path, files: cmdFiles } = await parseProcessArgs();
    const jsonOutput = options.json === true;

    const welcome = `\nWelcome to @midscene/cli v${version}\n`;
    if (!jsonOutput) {
      console.log(welcome);
    }

    if (options.url) {
      throw new Error(
        'the cli mode is no longer supported, please use yaml file instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
      );
    }

    const configFile = options.config as string | undefined;

    if (!configFile && !path && !(cmdFiles && cmdFiles.length > 0)) {
      throw new Error('No script path, files, or config provided');
    }

    // Extract new configuration options
    const configOptions = {
      concurrent: options.concurrent,
      continueOnError: options['continue-on-error'],
      retry: options.retry,
      summary: options.summary,
      shareBrowserContext: options['share-browser-context'],
      headed: options.headed,
      keepWindow: options['keep-window'],
      dotenvOverride: options['dotenv-override'],
      dotenvDebug: options['dotenv-debug'],
      web: options.web,
      android: options.android,
      ios: options.ios,
      iosAuto: options['ios-auto'],
      files: cmdFiles,
      setup: options.setup as string | undefined,
    };

    let config;

    if (configFile) {
      config = await withJsonOutputSilenced(jsonOutput, () =>
        createConfig(configFile, configOptions),
      );
      if (!jsonOutput) {
        console.log(`   Config file: ${configFile}`);
      }
    } else if (cmdFiles && cmdFiles.length > 0) {
      if (!jsonOutput) {
        console.log('   Executing YAML files from --files argument...');
      }
      config = await withJsonOutputSilenced(jsonOutput, () =>
        createFilesConfig(cmdFiles, configOptions),
      );
    } else if (path) {
      const files = await withJsonOutputSilenced(jsonOutput, () =>
        matchYamlFiles(path),
      );
      if (files.length === 0) {
        throw new Error(`No yaml files found in ${path}`);
      }
      if (!jsonOutput) {
        console.log('   Executing YAML files...');
      }
      config = await withJsonOutputSilenced(jsonOutput, () =>
        createFilesConfig(files, configOptions),
      );
    }

    if (!config) {
      throw new Error('Could not create a valid configuration.');
    }

    let jsonResult: string | undefined;
    const exitCode = await withJsonOutputSilenced(jsonOutput, async () => {
      loadDotenvConfig({
        dotenvDebug: config.dotenvDebug,
        dotenvOverride: config.dotenvOverride,
        log: console.log,
      });

      return runFrameworkTestConfig(config, {
        onComplete: ({ results, summaryPath }) => {
          if (!jsonOutput) return;
          jsonResult = `${JSON.stringify(
            createJsonResultPayload(results, summaryPath),
            null,
            2,
          )}\n`;
        },
      });
    });

    if (jsonResult) {
      process.stdout.write(jsonResult);
    }

    if (config.keepWindow) {
      // hang the process to keep the browser window open
      setInterval(() => {
        if (!jsonOutput) {
          console.log('browser is still running, use ctrl+c to stop it');
        }
      }, 5000);
    } else {
      process.exit(exitCode);
    }
  })().catch((e) => {
    if (process.argv.slice(2).includes('--json')) {
      process.stdout.write('null\n');
    } else {
      console.error(e);
    }
    process.exit(1);
  }),
);
