import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { cwd } from 'node:process';
import type {
  MidsceneYamlConfig,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { interpolateEnvVars } from '@midscene/web/yaml';
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
}

export interface ParsedConfig {
  concurrent: number;
  continueOnError: boolean;
  summary: string;
  shareBrowserContext: boolean;
  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
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
  const seenFiles = new Set<string>();

  for (const pattern of patterns) {
    try {
      const yamlFiles = await matchYamlFiles(pattern, {
        cwd: basePath,
      });

      for (const file of yamlFiles) {
        if (!seenFiles.has(file)) {
          seenFiles.add(file);
          allFiles.push(file);
        }
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
      target: parsedConfig.target,
    },
    {
      web: options?.web,
      android: options?.android,
    },
  );

  // Apply command line overrides with higher priority than file configuration
  const keepWindow = options?.keepWindow ?? parsedConfig.keepWindow;
  const headed = options?.headed ?? parsedConfig.headed;

  // If keepWindow is true, automatically enable headed mode
  const finalHeaded = keepWindow || headed;

  return {
    files: parsedConfig.files,
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
    },
  };
}
