import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { execa } from 'execa';
import yargs from 'yargs/yargs';
import {
  type CreatePlatform,
  type NodePackageSpec,
  createPlatformLabels,
  createPlatforms,
  createProjectFiles,
  parseNodePackageSpec,
} from './create-template';
import type { TestCliIO } from './test-command';

const createParser = () =>
  yargs()
    .scriptName('midscene-test create')
    .usage('Usage: $0 [directory] [options]')
    .parserConfiguration({
      'parse-positional-numbers': false,
      'greedy-arrays': false,
      'camel-case-expansion': false,
      'boolean-negation': false,
    })
    .option('platform', {
      type: 'string',
      choices: createPlatforms,
      requiresArg: true,
      description: 'Platform preset (prompt if omitted)',
    })
    .option('with', {
      type: 'array',
      string: true,
      nargs: 1,
      requiresArg: true,
      description: 'npm Node package, optionally versioned (repeatable)',
    })
    .option('yes', {
      type: 'boolean',
      alias: 'y',
      default: false,
      description: 'Disable prompts; directory and platform must be supplied',
    })
    .demandCommand(0, 1, '', 'Only one project directory is allowed.')
    .example('$0', 'Choose a directory and platform interactively')
    .example('$0 my-tests --platform web', 'Create a Web project')
    .example(
      '$0 . --platform android --with @acme/test-nodes@1.2.0',
      'Include a Node package',
    )
    .epilogue(
      'Installs dependencies with pnpm and generates midscene-nodes.md.\nNode packages must export a synchronous createMidsceneTestNodes(options) factory.\nExisting files are never overwritten. Setup and tests are not run during creation.',
    )
    .help('help')
    .alias('help', 'h')
    .version(false)
    .strict()
    .exitProcess(false)
    .showHelpOnFail(false)
    .fail((message, error) => {
      throw error ?? new Error(message);
    })
    .wrap(100);

export interface CreateOptions {
  directory?: string;
  platform?: CreatePlatform;
  packages: NodePackageSpec[];
  yes: boolean;
  help: boolean;
}

export function parseCreateArgs(
  args: string[],
  onOutput?: (message: string) => void,
): CreateOptions {
  const values = createParser().parseSync(args, {}, (error, _argv, output) => {
    if (error) throw error;
    if (output) onOutput?.(output);
  });
  const directory = values._[0] === undefined ? undefined : String(values._[0]);
  if (directory !== undefined && !directory.trim()) {
    throw new Error('Project directory must not be empty.');
  }
  const packages = (values.with ?? []).map(parseNodePackageSpec);
  const seen = new Set<string>();
  for (const pkg of packages) {
    if (seen.has(pkg.name)) {
      throw new Error(
        `Node package "${pkg.name}" was specified more than once.`,
      );
    }
    seen.add(pkg.name);
  }
  return {
    directory,
    platform: values.platform,
    packages,
    yes: values.yes ?? false,
    help: values.help === true,
  };
}

export interface CreateServices {
  cwd: string;
  interactive: boolean;
  promptDirectory(): Promise<string>;
  selectPlatform(): Promise<CreatePlatform>;
  runPnpm(
    args: string[],
    cwd: string,
    captureOutput?: boolean,
  ): Promise<string>;
}

const promptDirectory = () =>
  input({
    message: 'Project directory:',
    default: 'my-tests',
    validate: (value) =>
      value.trim().length > 0 || 'Project directory must not be empty.',
  });

const selectPlatform = () =>
  select<CreatePlatform>({
    message: 'Select a platform:',
    choices: createPlatforms.map((platform) => ({
      name: createPlatformLabels[platform],
      value: platform,
    })),
  });

const runPnpm: CreateServices['runPnpm'] = async (
  args,
  cwd,
  captureOutput = false,
) => {
  const result = await execa('pnpm', args, {
    cwd,
    stdin: 'inherit',
    stdout: captureOutput ? 'pipe' : 'inherit',
    stderr: 'inherit',
    stripFinalNewline: false,
  });
  return result.stdout ?? '';
};

const statIfPresent = (path: string) => {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

/** Check every destination before writing anything, including dangling links. */
function checkDestinations(root: string, filenames: string[]): void {
  const conflicts: string[] = [];
  for (const filename of filenames) {
    const path = resolve(root, filename);
    if (statIfPresent(path)) conflicts.push(path);
    let parent = dirname(path);
    while (true) {
      const stat = statIfPresent(parent);
      if (stat && !stat.isDirectory()) conflicts.push(parent);
      if (parent === root || parent === dirname(parent)) break;
      parent = dirname(parent);
    }
  }
  if (conflicts.length) {
    throw new Error(
      `Cannot create project; these paths already exist or are not directories:\n${[...new Set(conflicts)].join('\n')}\nChoose another directory or move the conflicting files.`,
    );
  }
}

export async function runCreateCommand(
  args: string[],
  io: TestCliIO,
  overrides: Partial<CreateServices> = {},
): Promise<void> {
  const options = parseCreateArgs(args, (message) => io.log(message));
  if (options.help) return;
  const services: CreateServices = {
    cwd: process.cwd(),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    promptDirectory,
    selectPlatform,
    runPnpm,
    ...overrides,
  };
  if (
    (!options.directory || !options.platform) &&
    (options.yes || !services.interactive)
  ) {
    throw new Error(
      'Project directory and --platform are required without prompts. Example: midscene-test create my-tests --platform web',
    );
  }
  let directory: string;
  let platform: CreatePlatform;
  try {
    directory = options.directory ?? (await services.promptDirectory()).trim();
    platform = options.platform ?? (await services.selectPlatform());
  } catch (error) {
    if (
      error instanceof Error &&
      ['ExitPromptError', 'AbortPromptError'].includes(error.name)
    ) {
      throw new Error('Project creation cancelled.');
    }
    throw error;
  }
  const root = resolve(services.cwd, directory);
  const name =
    basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/^[._-]+/, '') || 'midscene-tests';
  const files = createProjectFiles(name, platform, options.packages);
  checkDestinations(root, [
    ...Object.keys(files),
    'midscene-nodes.md',
    'pnpm-lock.yaml',
  ]);
  for (const [filename, content] of Object.entries(files)) {
    const path = resolve(root, filename);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: 'wx' });
  }
  io.log(`Created ${platform} project files in ${root}`);
  io.log('Installing dependencies with pnpm...');
  try {
    await services.runPnpm(['install', '--ignore-workspace'], root);
  } catch (error) {
    throw new Error(
      `Dependency installation failed. Project files are preserved in ${root}.\nIn that directory, run pnpm install --ignore-workspace, then pnpm run describe-nodes.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  io.log('Generating Node reference...');
  try {
    const markdown = await services.runPnpm(
      ['exec', 'midscene-test', 'describe-nodes'],
      root,
      true,
    );
    if (
      !markdown.startsWith('<!-- Generated by `midscene-test describe-nodes`.')
    ) {
      throw new Error('describe-nodes did not return a valid Node reference.');
    }
    writeFileSync(resolve(root, 'midscene-nodes.md'), markdown, { flag: 'wx' });
  } catch (error) {
    throw new Error(
      `Node reference generation failed. Project files are preserved in ${root}.\nCheck that each Node package exports createMidsceneTestNodes(options), returns a Node array synchronously, and does not register duplicate names.\nFix midscene.config.ts, then run pnpm run describe-nodes in the project directory.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  io.log(
    `Project ready: ${root}\nNode reference: ${resolve(root, 'midscene-nodes.md')}\nNext: copy .env.example to .env and configure your model.${platform === 'web' ? '\nInstall Chromium: pnpm exec playwright install chromium' : platform === 'computer' ? '\nPrepare desktop dependencies and permissions as described in README.md.' : '\nConfigure your device connection in .env.'}\nRun tests from the project directory: pnpm test`,
  );
}
