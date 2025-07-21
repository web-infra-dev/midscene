import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { cwd } from 'node:process';
import type {
  MidsceneYamlIndex,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { interpolateEnvVars } from '@midscene/web/yaml';
import { load as yamlLoad } from 'js-yaml';
import merge from 'lodash.merge';
import type { BatchRunnerConfig } from './batch-runner';
import { matchYamlFiles } from './cli-utils';

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

export interface ParsedIndexConfig {
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

export async function parseIndexYaml(
  indexYamlPath: string,
): Promise<ParsedIndexConfig> {
  const basePath = dirname(resolve(indexYamlPath));
  const indexContent = readFileSync(indexYamlPath, 'utf8');
  const interpolatedContent = interpolateEnvVars(indexContent);
  let indexYaml: MidsceneYamlIndex;
  try {
    indexYaml = yamlLoad(interpolatedContent) as MidsceneYamlIndex;
  } catch (error) {
    throw new Error(`Failed to parse index YAML: ${error}`);
  }

  if (!indexYaml?.files || !Array.isArray(indexYaml?.files)) {
    throw new Error('Index YAML must contain a "files" array');
  }

  // Expand file patterns using glob
  const files = await expandFilePatterns(indexYaml?.files, basePath);

  // Validate that at least one file was found
  if (files.length === 0) {
    throw new Error('No YAML files found matching the patterns in "files"');
  }

  // Generate default summary filename
  const indexFileName = basename(indexYamlPath, extname(indexYamlPath));
  const timestamp = Date.now();
  const defaultSummary = `${indexFileName}-${timestamp}.json`;

  // Build parsed configuration from file only
  const config: ParsedIndexConfig = {
    concurrent: indexYaml.concurrent ?? 1,
    continueOnError: indexYaml.continueOnError ?? false,
    summary: indexYaml.summary ?? defaultSummary,
    shareBrowserContext: indexYaml.shareBrowserContext ?? false,
    web: indexYaml.web,
    android: indexYaml.android,
    patterns: indexYaml.files,
    files,
    headed: indexYaml.headed ?? false,
    keepWindow: indexYaml.keepWindow ?? false,
    dotenvOverride: indexYaml.dotenvOverride ?? false,
    dotenvDebug: indexYaml.dotenvDebug ?? true,
  };

  return config;
}

export async function createIndexConfig(
  indexYamlPath: string,
  cmdLineOptions?: ConfigFactoryOptions,
): Promise<BatchRunnerConfig> {
  const parsedConfig = await parseIndexYaml(indexYamlPath);
  const globalConfig = merge(
    {
      web: parsedConfig.web,
      android: parsedConfig.android,
      target: parsedConfig.target,
    },
    {
      web: cmdLineOptions?.web,
      android: cmdLineOptions?.android,
    },
  );

  // Apply command line overrides with higher priority than file configuration
  return {
    files: parsedConfig.files,
    concurrent: cmdLineOptions?.concurrent ?? parsedConfig.concurrent,
    continueOnError:
      cmdLineOptions?.continueOnError ?? parsedConfig.continueOnError,
    summary: cmdLineOptions?.summary ?? parsedConfig.summary,
    shareBrowserContext:
      cmdLineOptions?.shareBrowserContext ?? parsedConfig.shareBrowserContext,
    headed: cmdLineOptions?.headed ?? parsedConfig.headed,
    keepWindow: cmdLineOptions?.keepWindow ?? parsedConfig.keepWindow,
    dotenvOverride:
      cmdLineOptions?.dotenvOverride ?? parsedConfig.dotenvOverride,
    dotenvDebug: cmdLineOptions?.dotenvDebug ?? parsedConfig.dotenvDebug,
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

  return {
    files,
    concurrent: options.concurrent ?? 1,
    continueOnError: options.continueOnError ?? false,
    summary: options.summary ?? defaultSummary,
    shareBrowserContext: options.shareBrowserContext ?? false,
    headed: options.headed ?? false,
    keepWindow: options.keepWindow ?? false,
    dotenvOverride: options.dotenvOverride ?? false,
    dotenvDebug: options.dotenvDebug ?? true,
    globalConfig: {
      web: options.web as MidsceneYamlScriptWebEnv | undefined,
      android: options.android as MidsceneYamlScriptAndroidEnv | undefined,
    },
  };
}
