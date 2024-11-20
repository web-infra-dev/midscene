import assert from 'node:assert';
import { glob } from 'glob';
import minimist from 'minimist';
import { findOnlyItemInArgs, orderMattersParse } from './args';
import 'dotenv/config';
import { statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import yargs from 'yargs/yargs';
import type {
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
} from './types';

const preferenceArgs = {
  url: 'url',
  serve: 'serve',
  headed: 'headed',
  viewportWidth: 'viewport-width',
  viewportHeight: 'viewport-height',
  viewportScale: 'viewport-scale',
  useragent: 'user-agent',
  output: 'output',
  cookie: 'cookie',
};

const removedArgs = {
  action: 'action',
  assert: 'assert',
  query: 'query',
  waitFor: 'wait-for',
};

const actionArgs = {
  ai: 'ai',
  aiAction: 'aiAction',
  aiAssert: 'aiAssert',
  aiQuery: 'aiQuery',
  aiWaitFor: 'aiWaitFor',
  sleep: 'sleep',
};

export const parseProcessArgs = async (): Promise<{
  path?: string;
  options: Record<string, any>;
}> => {
  const versionFromPkgJson = require('../package.json').version;
  const { hideBin } = require('yargs/helpers');

  const args = yargs(hideBin(process.argv))
    .usage(
      `Midscene.js helps you automate browser actions, assertions, and data extraction by AI. 
Homepage: https://midscenejs.com/
Github: https://github.com/web-infra-dev/midscene

Usage: $0 [options] <path-to-yaml-script-file-or-directory>`,
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
    })
    .version('version', 'Show version number', versionFromPkgJson)
    .help()
    .wrap(yargs().terminalWidth());

  const argv = await args.argv;

  return {
    path: argv._[0] as string | undefined,
    options: argv,
  };
};

export const parseArgsIntoYamlScript = async (
  input?: string[],
): Promise<string> => {
  const args = minimist(input || process.argv);

  if (findOnlyItemInArgs(args, 'version')) {
    const versionFromPkgJson = require('../package.json').version;
    console.log(`@midscene/cli version ${versionFromPkgJson}`);
    process.exit(0);
  }

  // check if any deprecated args are used
  Object.keys(removedArgs).forEach((arg) => {
    if (findOnlyItemInArgs(args, arg)) {
      throw new Error(
        `Parameter ${arg} has been removed, use --aiAction --aiAssert --aiQuery --aiWaitFor instead.`,
      );
    }
  });

  // check each arg is either in the preferenceArgs or actionArgs
  Object.keys(args).forEach((arg) => {
    if (arg === '_') return;
    assert(
      Object.values(preferenceArgs).includes(arg) ||
        Object.values(actionArgs).includes(arg),
      `Unknown argument: ${arg}`,
    );
  });

  const url = findOnlyItemInArgs(args, preferenceArgs.url) as
    | string
    | undefined;

  assert(url, 'url is required');
  const script: MidsceneYamlScript = {
    target: { url },
    flow: [],
  };

  Object.entries(preferenceArgs).forEach(([key, value]) => {
    const argValue = findOnlyItemInArgs(args, value);
    if (argValue) {
      Object.assign(script.target, {
        [key]: argValue,
      });
    }
  });

  const orderedArgs = orderMattersParse(process.argv);
  for (const arg of orderedArgs) {
    const argName = arg.name;
    const argValue = arg.value;
    if (argName === actionArgs.ai || argName === actionArgs.aiAction) {
      script.flow.push({
        aiAction: argValue,
      } as MidsceneYamlFlowItemAIAction);
    } else if (argName === actionArgs.aiAssert) {
      script.flow.push({
        aiAssert: argValue,
      } as MidsceneYamlFlowItemAIAssert);
    } else if (argName === actionArgs.aiQuery) {
      script.flow.push({
        aiQuery: argValue,
      } as MidsceneYamlFlowItemAIQuery);
    } else if (argName === actionArgs.aiWaitFor) {
      script.flow.push({
        aiWaitFor: argValue,
      } as MidsceneYamlFlowItemAIWaitFor);
    } else if (argName === actionArgs.sleep) {
      script.flow.push({
        sleep: argValue,
      } as MidsceneYamlFlowItemSleep);
    }
  }

  const yaml = dump(script);
  return yaml;
};

// match yml or yaml files
export async function matchYamlFiles(fileGlob: string) {
  if (existsSync(fileGlob) && statSync(fileGlob).isDirectory()) {
    fileGlob = join(fileGlob, '**/*.{yml,yaml}');
  }
  const files = await glob(fileGlob, {
    nodir: true,
  });
  return files.filter(
    (file) => file.endsWith('.yml') || file.endsWith('.yaml'),
  );
}
