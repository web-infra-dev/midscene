import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { midsceneYamlTargetKeys } from '@midscene/core/yaml';
import { loadDotenvConfig } from '../runtime/dotenv-loader';
import { parseLegacyArguments } from '../runtime/legacy-arguments';
import {
  type LegacyConfigFactoryOptions,
  type LegacyTestRunPlan,
  createLegacyConfigFactory,
  pickLegacyYamlTargetConfig,
} from '../runtime/legacy-config';

// Legacy compatibility stops here: the resulting plan is consumed by Test's
// Project scheduler, without importing the old CLI or its Rstest host.
const booleanOptions = new Set([
  '--continue-on-error',
  '--headed',
  '--keep-window',
  '--share-browser-context',
  '--dotenv-override',
  '--dotenv-debug',
]);
const valueOptions = new Set([
  '--concurrent',
  '--retry',
  '--summary',
  '--setup',
]);

export function collectLegacyCliOption(
  args: string[],
  index: number,
  collected: string[],
): number | undefined {
  const token = args[index];
  const name = token.split('=', 1)[0];
  const positiveName = name.replace(/^--no-/, '--');
  const isBoolean = booleanOptions.has(positiveName);
  const isTarget = midsceneYamlTargetKeys.some((key) =>
    positiveName.startsWith(`--${key}.`),
  );
  if (!isBoolean && !valueOptions.has(name) && name !== '--files' && !isTarget)
    return undefined;
  collected.push(token);
  const next = args[index + 1];
  if (name === '--files') {
    if (!token.includes('=') && (!next || next.startsWith('-')))
      throw new Error(`${name} requires a value.`);
    while (args[index + 1] && !args[index + 1].startsWith('-'))
      collected.push(args[++index]);
    return index;
  }
  if (token.includes('=')) return index;
  // yargs treats --no-target.field as a complete boolean switch. Its next
  // positional argument is still the YAML input, not a value for this option.
  if (isTarget && name !== positiveName) return index;
  if (isBoolean) {
    if (next === 'true' || next === 'false') collected.push(args[++index]);
    return index;
  }
  if (!next || next.startsWith('--')) {
    if (isTarget) return index;
    throw new Error(`${name} requires a value.`);
  }
  collected.push(args[++index]);
  return index;
}

export function parseLegacyCliOptions(
  args: string[],
): LegacyConfigFactoryOptions {
  const { options, files } = parseLegacyArguments(args, { help: false });
  return {
    ...pickLegacyYamlTargetConfig(options),
    concurrent: options.concurrent,
    continueOnError: options['continue-on-error'],
    retry: options.retry,
    summary: options.summary,
    shareBrowserContext: options['share-browser-context'],
    headed: options.headed,
    keepWindow: options['keep-window'],
    dotenvOverride: options['dotenv-override'],
    dotenvDebug: options['dotenv-debug'],
    files,
    setup: options.setup,
  };
}

export async function createLegacyTestRunPlan(options: {
  cwd: string;
  projectRoot?: string;
  configPath?: string;
  legacyOptions?: LegacyConfigFactoryOptions;
}): Promise<LegacyTestRunPlan | undefined> {
  const yamlConfig = options.configPath && /\.ya?ml$/i.test(options.configPath);
  const input = options.projectRoot;
  const pattern = input && !existsSync(input) && /[*?{}[\]]/.test(input);
  if (!yamlConfig && !options.legacyOptions && !pattern) return undefined;
  if (options.configPath && !yamlConfig)
    throw new Error(
      'Legacy YAML CLI options cannot be combined with a native TypeScript config.',
    );
  const overrides = options.legacyOptions ?? {};
  // Load before config interpolation; apply a config's override policy again
  // before collecting its scripts so .env and shell precedence stay explicit.
  loadDotenvConfig({ cwd: options.cwd, ...overrides });
  const factory = createLegacyConfigFactory();
  const config = yamlConfig
    ? await factory.createConfig(
        resolve(options.cwd, options.configPath!),
        overrides,
      )
    : await factory.createFilesConfig(
        overrides.files?.length ? overrides.files : [input ?? options.cwd],
        overrides,
        options.cwd,
      );
  if (config.files.length === 0)
    throw new Error('No YAML files found matching the selected files.');
  if (!Number.isInteger(config.concurrent) || config.concurrent < 1)
    throw new Error('Legacy concurrent must be a positive integer.');
  if (!Number.isInteger(config.retry) || config.retry < 0)
    throw new Error('Legacy retry must be a non-negative integer.');
  if (
    config.setup &&
    config.files.some((file) => resolve(file) === resolve(config.setup!))
  )
    throw new Error('The setup YAML file must not also appear in files.');
  loadDotenvConfig({ cwd: options.cwd, ...config });
  return { ...config, bail: config.continueOnError ? 0 : 1 };
}

export function legacyPlanProjectRoot(
  input: string | undefined,
  cwd: string,
): string {
  return input && existsSync(input) && statSync(input).isDirectory()
    ? input
    : cwd;
}
