import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { cwd } from 'node:process';
import type {
  MidsceneYamlConfig,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptIOSEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { interpolateEnvVars } from '@midscene/core/yaml';
import { load as yamlLoad } from 'js-yaml';
import merge from 'lodash.merge';
import type { BatchRunnerConfig } from './batch-runner';
import { matchYamlFiles } from './cli-utils';

export const defaultConfig = {
  concurrent: 1,
  continueOnError: false,
  shareBrowserContext: false,
  headed: false,
  keepWindow: false,
  dotenvOverride: false,
  dotenvDebug: false,
};

export interface ConfigFactoryOptions {
  concurrent?: number;
  continueOnError?: boolean;
  summary?: string;
  shareBrowserContext?: boolean;
  headed?: boolean;
  keepWindow?: boolean;
  dotenvOverride?: boolean;
  dotenvDebug?: boolean;
  web?: Partial<MidsceneYamlScriptWebEnv>;
  android?: Partial<MidsceneYamlScriptAndroidEnv>;
  ios?: Partial<MidsceneYamlScriptIOSEnv>;
  files?: string[];
}

export interface ParsedConfig {
  concurrent: number;
  continueOnError: boolean;
  summary: string;
  shareBrowserContext: boolean;
  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;
  target?: MidsceneYamlScriptWebEnv;
  files: string[];
  patterns: string[]; // Keep patterns for reference
  headed: boolean;
  keepWindow: boolean;
  dotenvOverride: boolean;
  dotenvDebug: boolean;
}

async function expandFilePatterns(
  patterns: string[],
  basePath: string,
): Promise<string[]> {
  const allFiles: string[] = [];

  for (const pattern of patterns) {
    try {
      const yamlFiles = await matchYamlFiles(pattern, {
        cwd: basePath,
      });

      // Add all matched files, including duplicates
      // This allows users to execute the same file multiple times
      for (const file of yamlFiles) {
        allFiles.push(file);
      }
    } catch (error) {
      console.warn(`Warning: Failed to expand pattern "${pattern}":`, error);
    }
  }

  return allFiles;
}

export async function parseConfigYaml(
  configYamlPath: string,
): Promise<ParsedConfig> {
  const basePath = dirname(resolve(configYamlPath));
  const configContent = readFileSync(configYamlPath, 'utf8');
  const interpolatedContent = interpolateEnvVars(configContent);
  let configYaml: MidsceneYamlConfig;
  try {
    configYaml = yamlLoad(interpolatedContent) as MidsceneYamlConfig;
  } catch (error) {
    throw new Error(`Failed to parse config YAML: ${error}`);
  }

  if (!configYaml?.files || !Array.isArray(configYaml?.files)) {
    throw new Error('Config YAML must contain a "files" array');
  }

  // Expand file patterns using glob
  const files = await expandFilePatterns(configYaml?.files, basePath);

  // Validate that at least one file was found
  if (files.length === 0) {
    throw new Error('No YAML files found matching the patterns in "files"');
  }

  // Generate default summary filename
  const configFileName = basename(configYamlPath, extname(configYamlPath));
  const timestamp = Date.now();
  const defaultSummary = `${configFileName}-${timestamp}.json`;

  // Build parsed configuration from file only
  const config: ParsedConfig = {
    concurrent: configYaml.concurrent ?? defaultConfig.concurrent,
    continueOnError:
      configYaml.continueOnError ?? defaultConfig.continueOnError,
    summary: configYaml.summary ?? defaultSummary,
    shareBrowserContext:
      configYaml.shareBrowserContext ?? defaultConfig.shareBrowserContext,
    web: configYaml.web,
    android: configYaml.android,
    ios: configYaml.ios,
    patterns: configYaml.files,
    files,
    headed: configYaml.headed ?? defaultConfig.headed,
    keepWindow: configYaml.keepWindow ?? defaultConfig.keepWindow,
    dotenvOverride: configYaml.dotenvOverride ?? defaultConfig.dotenvOverride,
    dotenvDebug: configYaml.dotenvDebug ?? defaultConfig.dotenvDebug,
  };

  return config;
}

export async function createConfig(
  configYamlPath: string,
  options?: ConfigFactoryOptions,
): Promise<BatchRunnerConfig> {
  const parsedConfig = await parseConfigYaml(configYamlPath);
  const globalConfig = merge(
    {
      web: parsedConfig.web,
      android: parsedConfig.android,
      ios: parsedConfig.ios,
      target: parsedConfig.target,
    },
    {
      web: options?.web,
      android: options?.android,
      ios: options?.ios,
    },
  );

  // Apply command line overrides with higher priority than file configuration
  const keepWindow = options?.keepWindow ?? parsedConfig.keepWindow;
  const headed = options?.headed ?? parsedConfig.headed;

  // If keepWindow is true, automatically enable headed mode
  const finalHeaded = keepWindow || headed;

  // If files are provided via command line, expand them and use those instead of config files
  let files = parsedConfig.files;
  if (options?.files && options.files.length > 0) {
    const basePath = dirname(resolve(configYamlPath));
    files = await expandFilePatterns(options.files, basePath);
  }

  return {
    files,
    concurrent: options?.concurrent ?? parsedConfig.concurrent,
    continueOnError: options?.continueOnError ?? parsedConfig.continueOnError,
    summary: options?.summary ?? parsedConfig.summary,
    shareBrowserContext:
      options?.shareBrowserContext ?? parsedConfig.shareBrowserContext,
    headed: finalHeaded,
    keepWindow: keepWindow,
    dotenvOverride: options?.dotenvOverride ?? parsedConfig.dotenvOverride,
    dotenvDebug: options?.dotenvDebug ?? parsedConfig.dotenvDebug,
    globalConfig,
  };
}

export async function createFilesConfig(
  patterns: string[],
  options: ConfigFactoryOptions = {},
): Promise<BatchRunnerConfig> {
  const files = await expandFilePatterns(patterns, cwd());
  // Generate default summary filename if not provided
  const timestamp = Date.now();
  const defaultSummary = `summary-${timestamp}.json`;

  const keepWindow = options.keepWindow ?? defaultConfig.keepWindow;
  const headed = options.headed ?? defaultConfig.headed;

  // If keepWindow is true, automatically enable headed mode
  const finalHeaded = keepWindow || headed;

  return {
    files,
    concurrent: options.concurrent ?? defaultConfig.concurrent,
    continueOnError: options.continueOnError ?? defaultConfig.continueOnError,
    summary: options.summary ?? defaultSummary,
    shareBrowserContext:
      options.shareBrowserContext ?? defaultConfig.shareBrowserContext,
    headed: finalHeaded,
    keepWindow: keepWindow,
    dotenvOverride: options.dotenvOverride ?? defaultConfig.dotenvOverride,
    dotenvDebug: options.dotenvDebug ?? defaultConfig.dotenvDebug,
    globalConfig: {
      web: options.web as MidsceneYamlScriptWebEnv | undefined,
      android: options.android as MidsceneYamlScriptAndroidEnv | undefined,
      ios: options.ios as MidsceneYamlScriptIOSEnv | undefined,
    },
  };
}
