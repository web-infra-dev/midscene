import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { execa } from 'execa';
import yargs from 'yargs/yargs';
import {
  type CreatePackageManager,
  createPackageManagers,
  detectPackageManager,
  packageManagerCommands,
} from './create-package-manager';
import {
  type CreatePlatform,
  createPlatformLabels,
  createPlatforms,
  createProjectFiles,
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
    .option('package-manager', {
      type: 'string',
      choices: createPackageManagers,
      requiresArg: true,
      description:
        'Package manager (prompt if omitted; detect without prompts, falling back to npm)',
    })
    .option('yes', {
      type: 'boolean',
      alias: 'y',
      default: false,
      description:
        'Disable prompts and install dependencies; directory and platform must be supplied',
    })
    .option('skip-install', {
      type: 'boolean',
      default: false,
      description:
        'Create files without installing dependencies or generating midscene-node-reference.md',
    })
    .demandCommand(0, 1, '', 'Only one project directory is allowed.')
    .example('$0', 'Choose a directory and platform interactively')
    .example('$0 my-tests --platform web', 'Create a Web project')
    .epilogue(
      'Optionally installs dependencies with the selected package manager. The generated postinstall script creates midscene-node-reference.md after installation.\nExisting files are never overwritten. Setup and tests are not run during creation.',
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
  packageManager?: CreatePackageManager;
  yes: boolean;
  skipInstall: boolean;
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
  return {
    directory,
    platform: values.platform,
    packageManager: values['package-manager'],
    yes: values.yes ?? false,
    skipInstall: values['skip-install'] ?? false,
    help: values.help === true,
  };
}

export interface CreateServices {
  cwd: string;
  interactive: boolean;
  userAgent: string | undefined;
  promptDirectory(): Promise<string>;
  selectPlatform(): Promise<CreatePlatform>;
  selectPackageManager(
    defaultValue: CreatePackageManager,
  ): Promise<CreatePackageManager>;
  confirmInstall(): Promise<boolean>;
  runPackageManager(
    packageManager: CreatePackageManager,
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

const selectPackageManager: CreateServices['selectPackageManager'] = (
  defaultValue,
) =>
  select<CreatePackageManager>({
    message: 'Select a package manager:',
    choices: createPackageManagers.map((value) => ({ name: value, value })),
    default: defaultValue,
  });

const runPackageManager: CreateServices['runPackageManager'] = async (
  packageManager,
  args,
  cwd,
  captureOutput = false,
) => {
  const result = await execa(packageManager, args, {
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
    userAgent: process.env.npm_config_user_agent,
    promptDirectory,
    selectPlatform,
    selectPackageManager,
    confirmInstall: () =>
      confirm({
        message:
          'Install dependencies and generate midscene-node-reference.md now?',
        default: true,
      }),
    runPackageManager,
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
  let packageManager: CreatePackageManager;
  try {
    directory = options.directory ?? (await services.promptDirectory()).trim();
    platform = options.platform ?? (await services.selectPlatform());
    const defaultPackageManager = detectPackageManager(services.userAgent);
    packageManager =
      options.packageManager ??
      (services.interactive && !options.yes
        ? await services.selectPackageManager(defaultPackageManager)
        : defaultPackageManager);
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
  const commands = packageManagerCommands[packageManager];
  const files = createProjectFiles(name, platform, packageManager);
  checkDestinations(root, [
    ...Object.keys(files),
    'midscene-node-reference.md',
    'pnpm-lock.yaml',
    'package-lock.json',
    'npm-shrinkwrap.json',
  ]);
  for (const [filename, content] of Object.entries(files)) {
    const path = resolve(root, filename);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: 'wx' });
  }
  io.log(`Created ${platform} project files in ${root}`);
  let install = !options.skipInstall;
  if (install && services.interactive && !options.yes) {
    try {
      install = await services.confirmInstall();
    } catch (error) {
      if (
        error instanceof Error &&
        ['ExitPromptError', 'AbortPromptError'].includes(error.name)
      ) {
        throw new Error(
          `Project creation cancelled. Project files are preserved in ${root}.\nIn that directory, run ${packageManager} ${commands.install.join(' ')} to install dependencies and generate midscene-node-reference.md.`,
        );
      }
      throw error;
    }
  }
  if (!install) {
    io.log(
      `Project files ready: ${root}\nNext: run ${packageManager} ${commands.install.join(' ')} in the project directory. The postinstall script will generate midscene-node-reference.md.\nThen follow README.md to configure your model and run tests.`,
    );
    return;
  }
  io.log(`Installing dependencies with ${packageManager}...`);
  try {
    await services.runPackageManager(packageManager, commands.install, root);
  } catch (error) {
    throw new Error(
      `Dependency installation or postinstall Node reference generation failed. Project files are preserved in ${root}.\nIn that directory, run ${packageManager} ${commands.install.join(' ')}, then ${packageManager} run nodes if lifecycle scripts are disabled.\nIf postinstall failed, check midscene.config.ts and the Node package factories, then run ${packageManager} run nodes.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const referencePath = resolve(root, 'midscene-node-reference.md');
    const generatedByPostinstall = Boolean(statIfPresent(referencePath));
    // Fall back to explicit generation if lifecycle scripts were disabled.
    if (!generatedByPostinstall) {
      io.log('Generating Node reference...');
      await services.runPackageManager(packageManager, commands.describe, root);
    }
    const markdown = readFileSync(referencePath, 'utf8');
    if (!markdown.startsWith('<!-- Generated by `midscene-test nodes`.')) {
      throw new Error('nodes did not generate a valid Node reference.');
    }
  } catch (error) {
    throw new Error(
      `Node reference generation failed. Project files are preserved in ${root}.\nCheck that each Node package exports createMidsceneTestNodes(options), returns a Node array synchronously, and does not register duplicate names.\nFix midscene.config.ts, then run ${packageManager} run nodes in the project directory.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  io.log(
    `Project ready: ${root}\nNode reference: ${resolve(root, 'midscene-node-reference.md')}\nNext: copy .env.example to .env and configure your model.${platform === 'web' ? `\nInstall Chromium: ${commands.installChromium}` : platform === 'computer' ? '\nPrepare desktop dependencies and permissions as described in README.md.' : '\nConfigure your device connection in .env.'}\nRun tests from the project directory: ${packageManager} test`,
  );
}
