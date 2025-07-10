import { assert } from 'node:console';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type {
  MidsceneYamlIndex,
  MidsceneYamlIndexResult,
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { interpolateEnvVars } from '@midscene/web/yaml';
import { load as yamlLoad } from 'js-yaml';
import { matchYamlFiles } from './cli-utils';

export interface ParsedIndexConfig {
  concurrent: number;
  continueOnError: boolean;
  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  files: string[];
  outputPath?: string;
  outputFormat: 'json';
  patterns: string[]; // Keep patterns for reference
}

export class IndexYamlParser {
  private basePath: string;

  constructor(private indexYamlPath: string) {
    this.basePath = dirname(resolve(indexYamlPath));
  }

  async parse(): Promise<ParsedIndexConfig> {
    const indexContent = readFileSync(this.indexYamlPath, 'utf8');
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
    const files = await this.expandFilePatterns(indexYaml.order);

    // Validate that at least one file was found
    assert(
      files.length > 0,
      'No YAML files found matching the patterns in "order"',
    );

    // Build parsed configuration
    const config: ParsedIndexConfig = {
      concurrent: indexYaml.concurrent || 1,
      continueOnError: indexYaml.continueOnError ?? false,
      web: indexYaml.web,
      android: indexYaml.android,
      patterns: indexYaml.order,
      outputPath: indexYaml.output?.path,
      outputFormat: indexYaml.output?.format || 'json',
      files,
    };

    return config;
  }

  private async expandFilePatterns(patterns: string[]): Promise<string[]> {
    const allFiles: string[] = [];
    const seenFiles = new Set<string>();

    for (const pattern of patterns) {
      try {
        const yamlFiles = await matchYamlFiles(pattern, {
          cwd: this.basePath,
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

  /**
   * Merge global configuration with individual file configuration
   */
  mergeGlobalConfig(
    fileConfig: MidsceneYamlScript,
    globalConfig: ParsedIndexConfig,
  ): MidsceneYamlScript {
    const merged: MidsceneYamlScript = { ...fileConfig };

    // Merge web configuration if present
    if (globalConfig.web && fileConfig.web) {
      merged.web = {
        ...globalConfig.web,
        ...fileConfig.web,
      };
    } else if (globalConfig.web) {
      merged.web = globalConfig.web;
    }

    // Merge android configuration if present
    if (globalConfig.android && fileConfig.android) {
      merged.android = {
        ...globalConfig.android,
        ...fileConfig.android,
      };
    } else if (globalConfig.android) {
      merged.android = globalConfig.android;
    }

    // Handle deprecated target field
    if (globalConfig.web && fileConfig.target) {
      merged.target = {
        ...globalConfig.web,
        ...fileConfig.target,
      };
    } else if (globalConfig.web && !fileConfig.web && !fileConfig.target) {
      merged.target = globalConfig.web;
    }

    return merged;
  }

  /**
   * Generate output file path for individual YAML files
   */
  generateOutputPath(yamlFile: string, baseOutputDir?: string): string {
    const baseName = yamlFile.replace(/\.(ya?ml)$/i, '').replace(/.*[/\\]/, ''); // Remove extension and path
    const outputName = `${baseName}.json`;

    if (baseOutputDir) {
      return join(baseOutputDir, outputName);
    }

    return outputName;
  }

  /**
   * Create index result entry
   */
  createIndexResult(
    file: string,
    success: boolean,
    output?: string,
    report?: string,
    error?: string,
    startTime?: number,
  ): MidsceneYamlIndexResult {
    const result: MidsceneYamlIndexResult = {
      file,
      success,
      output,
      report,
      error,
    };

    if (startTime) {
      result.duration = Date.now() - startTime;
    }

    return result;
  }
}
