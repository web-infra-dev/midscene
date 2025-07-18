import { assert } from 'node:console';
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import type {
  MidsceneYamlIndex,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { interpolateEnvVars } from '@midscene/web/yaml';
import { load as yamlLoad } from 'js-yaml';
import type { BatchRunnerConfig } from './batch-runner';
import { matchYamlFiles } from './cli-utils';

export interface ConfigFactoryOptions {
  concurrent?: number;
  continueOnError?: boolean;
  summary?: string;
  shareBrowserContext?: boolean;
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

  assert(
    indexYaml.order && Array.isArray(indexYaml.order),
    'Index YAML must contain an "order" array',
  );

  // Expand file patterns using glob
  const files = await expandFilePatterns(indexYaml.order, basePath);

  // Validate that at least one file was found
  assert(
    files.length > 0,
    'No YAML files found matching the patterns in "order"',
  );

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
    patterns: indexYaml.order,
    files,
  };

  return config;
}

export async function createIndexConfig(
  indexYamlPath: string,
  cmdLineOptions?: {
    concurrent?: number;
    continueOnError?: boolean;
    summary?: string;
    shareBrowserContext?: boolean;
  },
): Promise<BatchRunnerConfig> {
  const parsedConfig = await parseIndexYaml(indexYamlPath);
  // Apply command line overrides with higher priority than file configuration
  return {
    files: parsedConfig.files,
    concurrent: cmdLineOptions?.concurrent ?? parsedConfig.concurrent,
    continueOnError:
      cmdLineOptions?.continueOnError ?? parsedConfig.continueOnError,
    summary: cmdLineOptions?.summary ?? parsedConfig.summary,
    shareBrowserContext:
      cmdLineOptions?.shareBrowserContext ?? parsedConfig.shareBrowserContext,
    globalConfig: {
      web: parsedConfig.web,
      android: parsedConfig.android,
      target: parsedConfig.target,
    },
  };
}

export function createFilesConfig(
  files: string[],
  options: ConfigFactoryOptions = {},
): BatchRunnerConfig {
  // Generate default summary filename if not provided
  const timestamp = Date.now();
  const defaultSummary = `summary-${timestamp}.json`;

  return {
    files,
    concurrent: options.concurrent ?? 1,
    continueOnError: options.continueOnError ?? false,
    summary: options.summary ?? defaultSummary,
    shareBrowserContext: options.shareBrowserContext ?? false,
  };
}
