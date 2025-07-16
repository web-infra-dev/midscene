import { existsSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { BatchRunner } from './batch-runner';
import { isIndexYamlFile, matchYamlFiles, parseProcessArgs } from './cli-utils';
import { createFilesConfig, createIndexConfig } from './config-factory';

Promise.resolve(
  (async () => {
    const { options, path } = await parseProcessArgs();

    const welcome = '\nWelcome to @midscene/cli\n';
    console.log(welcome);

    const dotEnvConfigFile = join(process.cwd(), '.env');
    if (existsSync(dotEnvConfigFile)) {
      console.log(`loading .env file from ${dotEnvConfigFile}`);
      dotenv.config({
        path: dotEnvConfigFile,
        debug: options.dotenvDebug ?? true,
        override: options.dotenvOverride ?? false,
      });
    }

    if (options.url) {
      console.error(
        'the cli mode is no longer supported, please use yaml file instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
      );
      process.exit(1);
    }

    if (!path) {
      console.error('no script path provided');
      process.exit(1);
    }

    const keepWindow = options['keep-window'] || false;
    const headed = options.headed || false;

    // Check if the path is an index YAML file
    if (isIndexYamlFile(path)) {
      console.log('📋 Detected index YAML file, executing batch workflow...\n');

      const config = await createIndexConfig(path);
      const executor = new BatchRunner(config);

      await executor.run({
        keepWindow,
        headed,
      });

      const success = executor.printExecutionSummary();

      if (!success) {
        process.exit(1);
      }

      process.exit(0);
    }

    // Handle regular YAML files
    const files = await matchYamlFiles(path);
    if (files.length === 0) {
      console.error(`No yaml files found in ${path}`);
      process.exit(1);
    }

    console.log('📄 Executing YAML files...\n');

    const config = createFilesConfig(files);
    const executor = new BatchRunner(config);

    await executor.run({
      keepWindow,
      headed,
    });

    const success = executor.printExecutionSummary();

    if (keepWindow) {
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
