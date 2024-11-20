import 'dotenv/config';
import minimist from 'minimist';
import { matchYamlFiles } from './cli-utils';
import { playYamlFiles } from './yaml-player';

const welcome = '\nWelcome to @midscene/cli\n';
console.log(welcome);

Promise.resolve(
  (async () => {
    const args = minimist(process.argv);
    if (args.url) {
      console.error(
        'the cli mode is no longer supported, please use yaml file instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
      );
      process.exit(1);
    }

    const path = args._[2];
    const files = await matchYamlFiles(path);
    if (files.length === 0) {
      console.error(`no yaml files found in ${path}`);
      process.exit(1);
    }

    const success = await playYamlFiles(files, {
      headed: !!args.headed,
      keepWindow: !!args['keep-window'],
    });
    if (!success) {
      process.exit(1);
    }
    process.exit(0);
  })(),
);
