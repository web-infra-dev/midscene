import { glob } from 'glob';
import 'dotenv/config';
import { statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

declare const __VERSION__: string;

export const parseProcessArgs = async (): Promise<{
  path?: string;
  options: Record<string, any>;
}> => {
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
    .version('version', 'Show version number', __VERSION__)
    .help()
    .wrap(yargs().terminalWidth());

  const argv = await args.argv;

  return {
    path: argv._[0] as string | undefined,
    options: argv,
  };
};

// match yml or yaml files
export async function matchYamlFiles(fileGlob: string) {
  if (existsSync(fileGlob) && statSync(fileGlob).isDirectory()) {
    fileGlob = join(fileGlob, '**/*.{yml,yaml}');
  }
  const files = await glob(fileGlob, {
    nodir: true,
    windowsPathsNoEscape: true,
    ignore: ['**/node_modules/**'],
  });
  return files
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
}
