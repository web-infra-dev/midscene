import 'dotenv/config';
import { matchYamlFiles, parseProcessArgs } from './cli-utils';
import { playYamlFiles } from './yaml-runner';

Promise.resolve(
  (async () => {
    const { options, path } = await parseProcessArgs();

    const welcome = '\nWelcome to @midscene/cli\n';
    console.log(welcome);

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

    const files = await matchYamlFiles(path);
    if (files.length === 0) {
      console.error(`no yaml files found in ${path}`);
      process.exit(1);
    }

    const success = await playYamlFiles(files, {
      headed: !!options.headed,
      keepWindow: !!options['keep-window'],
    });
    if (!success) {
      process.exit(1);
    }
    process.exit(0);
  })(),
);
