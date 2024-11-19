import 'dotenv/config';
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getLogDirByType } from '@midscene/core/utils';
import minimist from 'minimist';
import { matchYamlFiles, parseArgsIntoYamlScript } from './cli-utils';
import { playYamlFiles } from './yaml-player';

const welcome = '\nWelcome to @midscene/cli\n';
console.log(welcome);

Promise.resolve(
  (async () => {
    const args = minimist(process.argv);
    if (args.url) {
      console.error(
        'the cli mode is no longer supported, please use yaml file instead. See https://midscenejs.com/scripts-in-yaml for more information. Sorry for the inconvenience.',
      );
      process.exit(1);
    }

    const path = args._[2];
    const files = await matchYamlFiles(path);
    if (files.length === 0) {
      console.error(`no yaml files found in ${path}`);
      process.exit(1);
    }

    const success = await playYamlFiles(files);
    if (!success) {
      process.exit(1);
    }
    process.exit(0);
  })(),
);
