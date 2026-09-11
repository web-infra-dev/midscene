import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type {
  MidsceneYamlConfig,
  MidsceneYamlTargetConfig,
} from '@midscene/core';
import {
  interpolateEnvVars,
  midsceneYamlTargetKeys,
  resolveWebTarget,
} from '@midscene/core/yaml';
import { glob } from 'glob';
import { load as yamlLoad } from 'js-yaml';
import merge from 'lodash.merge';

// Legacy compatibility: these are the old CLI's input and selection semantics.
// This module produces configuration only; Test owns execution and scheduling.
export const defaultLegacyConfig = {
  concurrent: 1,
  continueOnError: false,
  retry: 0,
  shareBrowserContext: false,
  headed: false,
  keepWindow: false,
  dotenvOverride: false,
  dotenvDebug: false,
};

export type LegacyConfigFactoryOptions = MidsceneYamlTargetConfig & {
  concurrent?: number;
  continueOnError?: boolean;
  retry?: number;
  summary?: string;
  shareBrowserContext?: boolean;
  headed?: boolean;
  keepWindow?: boolean;
  dotenvOverride?: boolean;
  dotenvDebug?: boolean;
  files?: string[];
  setup?: string;
};

export interface LegacyYamlBatchConfig {
  /** Absolute paths in invocation order, including repeated files. */
  files: string[];
  setup?: string;
  concurrent: number;
  continueOnError: boolean;
  retry: number;
  summary: string;
  shareBrowserContext: boolean;
  globalConfig?: MidsceneYamlTargetConfig;
  headed: boolean;
  keepWindow: boolean;
  dotenvOverride: boolean;
  dotenvDebug: boolean;
}

export interface LegacyTestRunPlan extends LegacyYamlBatchConfig {
  bail: number;
}

export type LegacyParsedConfig = MidsceneYamlTargetConfig &
  Omit<LegacyYamlBatchConfig, 'globalConfig'> & { patterns: string[] };

export function pickLegacyYamlTargetConfig(
  config: MidsceneYamlTargetConfig,
): MidsceneYamlTargetConfig {
  const targetConfig: MidsceneYamlTargetConfig = {};
  for (const target of midsceneYamlTargetKeys) {
    const value = config[target];
    if (value !== undefined) Object.assign(targetConfig, { [target]: value });
  }
  return targetConfig;
}

export type LegacyYamlFileMatcher = (
  pattern: string,
  options?: { cwd?: string },
) => Promise<string[]>;

export const matchLegacyYamlFiles: LegacyYamlFileMatcher = async (
  pattern,
  options,
) => {
  const absoluteInput = resolve(options?.cwd ?? process.cwd(), pattern);
  const fileGlob =
    existsSync(absoluteInput) && statSync(absoluteInput).isDirectory()
      ? join(absoluteInput, '**/*.{yml,yaml}')
      : pattern;
  const files = await glob(fileGlob, {
    nodir: true,
    windowsPathsNoEscape: true,
    absolute: true,
    ignore: ['**/node_modules/**'],
    cwd: options?.cwd,
  });
  return files
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
};

/** The old CLI may supply its public matcher; both hosts share config parsing. */
export function createLegacyConfigFactory(
  matchFiles: LegacyYamlFileMatcher = matchLegacyYamlFiles,
) {
  const expandFilePatterns = async (patterns: string[], basePath: string) => {
    const files: string[] = [];
    for (const pattern of patterns) {
      // A files array is an ordered invocation list, not a set of glob patterns.
      files.push(...(await matchFiles(pattern, { cwd: basePath })));
    }
    return files;
  };

  const resolveSetupFile = async (
    setup: string | undefined,
    basePath: string,
  ): Promise<string | undefined> => {
    if (!setup) return undefined;
    const matched = await expandFilePatterns([setup], basePath);
    if (matched.length === 0)
      throw new Error(`No YAML file found matching "setup": ${setup}`);
    if (matched.length > 1)
      throw new Error(
        `"setup" must reference a single YAML file, but "${setup}" matched ${matched.length} files`,
      );
    return matched[0];
  };

  const parseConfigYaml = async (
    configYamlPath: string,
  ): Promise<LegacyParsedConfig> => {
    const basePath = dirname(resolve(configYamlPath));
    const content = interpolateEnvVars(readFileSync(configYamlPath, 'utf8'));
    let config: MidsceneYamlConfig;
    try {
      config = yamlLoad(content) as MidsceneYamlConfig;
    } catch (error) {
      throw new Error(`Failed to parse config YAML: ${error}`);
    }
    if (!config?.files || !Array.isArray(config.files))
      throw new Error('Config YAML must contain a "files" array');
    resolveWebTarget(config);
    const files = await expandFilePatterns(config.files, basePath);
    if (files.length === 0)
      throw new Error('No YAML files found matching the patterns in "files"');
    const setup = await resolveSetupFile(config.setup, basePath);
    return {
      ...pickLegacyYamlTargetConfig(config),
      concurrent: config.concurrent ?? defaultLegacyConfig.concurrent,
      continueOnError:
        config.continueOnError ?? defaultLegacyConfig.continueOnError,
      retry: config.retry ?? defaultLegacyConfig.retry,
      summary:
        config.summary ??
        `${basename(configYamlPath, extname(configYamlPath))}-${Date.now()}.json`,
      shareBrowserContext:
        config.shareBrowserContext ?? defaultLegacyConfig.shareBrowserContext,
      patterns: config.files,
      files,
      setup,
      headed: config.headed ?? defaultLegacyConfig.headed,
      keepWindow: config.keepWindow ?? defaultLegacyConfig.keepWindow,
      dotenvOverride:
        config.dotenvOverride ?? defaultLegacyConfig.dotenvOverride,
      dotenvDebug: config.dotenvDebug ?? defaultLegacyConfig.dotenvDebug,
    };
  };

  const createConfig = async (
    configYamlPath: string,
    options: LegacyConfigFactoryOptions = {},
  ): Promise<LegacyYamlBatchConfig> => {
    const parsed = await parseConfigYaml(configYamlPath);
    const basePath = dirname(resolve(configYamlPath));
    const keepWindow = options.keepWindow ?? parsed.keepWindow;
    return {
      files: options.files?.length
        ? await expandFilePatterns(options.files, basePath)
        : parsed.files,
      setup: options.setup
        ? await resolveSetupFile(options.setup, basePath)
        : parsed.setup,
      concurrent: options.concurrent ?? parsed.concurrent,
      continueOnError: options.continueOnError ?? parsed.continueOnError,
      retry: options.retry ?? parsed.retry,
      summary: options.summary ?? parsed.summary,
      shareBrowserContext:
        options.shareBrowserContext ?? parsed.shareBrowserContext,
      headed: keepWindow || (options.headed ?? parsed.headed),
      keepWindow,
      dotenvOverride: options.dotenvOverride ?? parsed.dotenvOverride,
      dotenvDebug: options.dotenvDebug ?? parsed.dotenvDebug,
      globalConfig: merge(
        pickLegacyYamlTargetConfig(parsed),
        pickLegacyYamlTargetConfig(options),
      ),
    };
  };

  const createFilesConfig = async (
    patterns: string[],
    options: LegacyConfigFactoryOptions = {},
    cwd = process.cwd(),
  ): Promise<LegacyYamlBatchConfig> => {
    const keepWindow = options.keepWindow ?? defaultLegacyConfig.keepWindow;
    return {
      files: await expandFilePatterns(patterns, cwd),
      setup: await resolveSetupFile(options.setup, cwd),
      concurrent: options.concurrent ?? defaultLegacyConfig.concurrent,
      continueOnError:
        options.continueOnError ?? defaultLegacyConfig.continueOnError,
      retry: options.retry ?? defaultLegacyConfig.retry,
      summary: options.summary ?? `summary-${Date.now()}.json`,
      shareBrowserContext:
        options.shareBrowserContext ?? defaultLegacyConfig.shareBrowserContext,
      headed: keepWindow || (options.headed ?? defaultLegacyConfig.headed),
      keepWindow,
      dotenvOverride:
        options.dotenvOverride ?? defaultLegacyConfig.dotenvOverride,
      dotenvDebug: options.dotenvDebug ?? defaultLegacyConfig.dotenvDebug,
      globalConfig: pickLegacyYamlTargetConfig(options),
    };
  };

  return { parseConfigYaml, createConfig, createFilesConfig };
}
