import 'dotenv/config';
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
    const verb = args._[2];

    let files: string[] = [];
    if (verb === 'run') {
      const path = args._[3];
      files = await matchYamlFiles(path);
    } else {
      const script = await parseArgsIntoYamlScript();
      const logDir = getLogDirByType('tmp');
      const tmpYamlPath = join(logDir, `script-${Date.now()}.yaml`);
      const relativeTmpYamlPath = relative(process.cwd(), tmpYamlPath);
      writeFileSync(tmpYamlPath, script);
      files.push(relativeTmpYamlPath);
    }

    const success = await playYamlFiles(files);
    if (!success) {
      process.exit(1);
    }
    process.exit(0);
  })(),
);
