import { createReportCliCommands } from '@midscene/core';
import { BaseMidsceneTools } from '@midscene/shared/agent-tools/base-tools';
import type { BaseAgent, BaseDevice } from '@midscene/shared/agent-tools/types';
import { runToolsCLI } from '@midscene/shared/cli';
import { version } from '../package.json';
import { matchYamlFiles, parseProcessArgs } from './cli-utils';
import { createConfig, createFilesConfig } from './config-factory';
import { loadDotenvConfig } from './dotenv-loader';
import {
  JSON_KEEP_WINDOW_ERROR,
  runFrameworkTestConfigDetailed,
} from './framework/command';
import {
  type CliJsonOutput,
  createCliJsonErrorOutput,
  createCliJsonRunOutput,
} from './json-output';
import { runModelCommand } from './model-command';

export interface CliOutput {
  log(message: string): void;
  error(error: unknown): void;
  writeJson(output: CliJsonOutput): void | Promise<void>;
}

export interface CliRunOutcome {
  exitCode: number;
  keepAlive: boolean;
}

class ReportCommandTools extends BaseMidsceneTools<BaseAgent> {
  public override async initTools(): Promise<void> {}

  public override getToolDefinitions() {
    return [];
  }

  public override getCliToolDefinitions() {
    return [];
  }

  protected override createTemporaryDevice(): BaseDevice {
    throw new Error('Report commands do not initialize a Device.');
  }

  protected override async ensureAgent(): Promise<BaseAgent> {
    throw new Error('Report commands do not initialize an Agent.');
  }
}

const defaultOutput: CliOutput = {
  log: (message) => console.log(message),
  error: (error) => console.error(error),
  writeJson: (output) =>
    new Promise((resolve, reject) => {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    }),
};

const rawArgsRequestJson = (rawArgs: string[]): boolean =>
  rawArgs.some((arg) => arg === '--json' || arg === '--json=true');

export async function runCli(
  rawArgs: string[] = process.argv.slice(2),
  output: CliOutput = defaultOutput,
): Promise<CliRunOutcome> {
  let jsonOutput = rawArgsRequestJson(rawArgs);

  try {
    const [firstArg] = rawArgs;
    if (firstArg === 'report-tool') {
      await runToolsCLI(new ReportCommandTools(), 'midscene', {
        argv: rawArgs,
        version,
        extraCommands: createReportCliCommands(),
      });
      return { exitCode: 0, keepAlive: false };
    }

    if (firstArg === 'model') {
      return {
        exitCode: await runModelCommand(rawArgs),
        keepAlive: false,
      };
    }

    const {
      options,
      path,
      files: cmdFiles,
    } = await parseProcessArgs([process.execPath, 'midscene', ...rawArgs]);
    jsonOutput = options.json === true;

    if (!jsonOutput) {
      output.log(`\nWelcome to @midscene/cli v${version}\n`);
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
      files: cmdFiles,
      setup: options.setup as string | undefined,
    };

    let config;
    if (configFile) {
      config = await createConfig(configFile, configOptions);
      if (!jsonOutput) {
        output.log(`   Config file: ${configFile}`);
      }
    } else if (cmdFiles && cmdFiles.length > 0) {
      if (!jsonOutput) {
        output.log('   Executing YAML files from --files argument...');
      }
      config = await createFilesConfig(cmdFiles, configOptions);
    } else if (path) {
      const files = await matchYamlFiles(path);
      if (files.length === 0) {
        throw new Error(`No yaml files found in ${path}`);
      }
      if (!jsonOutput) {
        output.log('   Executing YAML files...');
      }
      config = await createFilesConfig(files, configOptions);
    }

    if (!config) {
      throw new Error('Could not create a valid configuration.');
    }
    if (jsonOutput && config.keepWindow) {
      throw new Error(JSON_KEEP_WINDOW_ERROR);
    }
    if (jsonOutput && config.dotenvDebug) {
      throw new Error(
        '--json cannot be used with --dotenv-debug because dotenv debug logs are not machine-readable.',
      );
    }

    loadDotenvConfig({
      dotenvDebug: config.dotenvDebug,
      dotenvOverride: config.dotenvOverride,
      log: jsonOutput ? undefined : output.log,
    });

    const run = await runFrameworkTestConfigDetailed(config, {
      outputMode: jsonOutput ? 'json' : 'human',
    });
    if (jsonOutput) {
      await output.writeJson(createCliJsonRunOutput(run));
    }

    if (config.keepWindow) {
      setInterval(() => {
        output.log('browser is still running, use ctrl+c to stop it');
      }, 5000);
    }

    return {
      exitCode: run.exitCode,
      keepAlive: config.keepWindow,
    };
  } catch (error) {
    if (jsonOutput) {
      await output.writeJson(createCliJsonErrorOutput(error));
    } else {
      output.error(error);
    }
    return { exitCode: 1, keepAlive: false };
  }
}
