import { existsSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { version } from '../package.json';
import { BatchRunner } from './batch-runner';
import { matchYamlFiles, parseProcessArgs } from './cli-utils';
import { createConfig, createFilesConfig } from './config-factory';

Promise.resolve(
  (async () => {
    const { options, path, files: cmdFiles } = await parseProcessArgs();

    const welcome = `\nWelcome to @midscene/cli v${version}\n`;
    console.log(welcome);

    if (options.url) {
      console.error(
        'the cli mode is no longer supported, please use yaml file instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
      );
      process.exit(1);
    }

    const configFile = options.config as string | undefined;

    if (!configFile && !path && !(cmdFiles && cmdFiles.length > 0)) {
      console.error('No script path, files, or config provided');
      process.exit(1);
    }

    // Extract new configuration options
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

    const dotEnvConfigFile = join(process.cwd(), '.env');
    if (existsSync(dotEnvConfigFile)) {
      console.log(`   Env file: ${dotEnvConfigFile}`);
      dotenv.config({
        path: dotEnvConfigFile,
        debug: config.dotenvDebug,
        override: config.dotenvOverride,
      });
    }

    const executor = new BatchRunner(config);

    await executor.run();

    const success = executor.printExecutionSummary();

    if (config.keepWindow) {
      // hang the process to keep the browser window open
      setInterval(() => {
        console.log('browser is still running, use ctrl+c to stop it');
      }, 5000);
    } else {
      if (!success) {
        process.exit(1);
      }
      process.exit(0);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  }),
);
