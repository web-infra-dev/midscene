import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type {
  FrameworkCaseResult,
  FrameworkSetupResult,
  MidsceneFrameworkConfig,
} from '../types';
import { setupFrameworkAgent } from './setup';
import {
  normalizeYamlCase,
  runBuiltinYamlCase,
  runYamlFlowWithCustomSteps,
} from './yaml';

export { createYamlFrameworkSuiteSource } from './source';
export {
  normalizeYamlCase,
  runBuiltinYamlCase,
  runYamlFlowWithCustomSteps,
} from './yaml';
export { createDefaultSetup, setupFrameworkAgent } from './setup';

export interface SuiteRuntimeOptions {
  config: MidsceneFrameworkConfig;
  projectDir: string;
}

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const writeResultFile = (resultFile: string, result: FrameworkCaseResult) => {
  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(result, null, 2));
};

/**
 * Suite-level runtime shared by every generated case in a single Rstest module.
 * The agent and `state` are created once (`beforeAll`) and torn down once
 * (`afterAll`), so seeded data and cross-step state stay shared across cases.
 */
export class FrameworkSuiteRuntime {
  private readonly config: MidsceneFrameworkConfig;
  private readonly projectDir: string;
  private readonly state: Record<string, unknown> = {};
  private setupResult?: FrameworkSetupResult;

  constructor(options: SuiteRuntimeOptions) {
    this.config = options.config;
    this.projectDir = options.projectDir;
  }

  async setup(): Promise<void> {
    this.setupResult = await setupFrameworkAgent(this.config, {
      projectDir: this.projectDir,
      agentOptions: this.config.agentOptions || {},
    });
  }

  async teardown(): Promise<void> {
    await this.setupResult?.teardown?.();
    this.setupResult = undefined;
  }

  async runCase(filePath: string, resultFile?: string): Promise<void> {
    if (!this.setupResult) {
      throw new Error('Suite agent is not ready; setup() must run first');
    }

    const agent = this.setupResult.agent;
    const startTime = Date.now();
    const testName = relative(this.projectDir, filePath) || filePath;
    const normalizedCase = normalizeYamlCase(
      readFileSync(filePath, 'utf8'),
      filePath,
    );

    try {
      if (this.config.yamlSteps) {
        await runYamlFlowWithCustomSteps({
          agent,
          filePath,
          caseName: normalizedCase.name,
          flow: normalizedCase.flow,
          yamlSteps: this.config.yamlSteps,
          state: this.state,
        });
      } else {
        await runBuiltinYamlCase({ agent, normalizedCase });
      }

      if (resultFile) {
        writeResultFile(resultFile, {
          file: filePath,
          testName,
          success: true,
          duration: Date.now() - startTime,
          report:
            typeof agent.reportFile === 'string' ? agent.reportFile : undefined,
        });
      }
    } catch (error) {
      if (resultFile) {
        writeResultFile(resultFile, {
          file: filePath,
          testName,
          success: false,
          duration: Date.now() - startTime,
          error: errorMessageOf(error),
          report:
            typeof agent.reportFile === 'string' ? agent.reportFile : undefined,
        });
      }
      throw error;
    }
  }
}

export function createSuiteRuntime(
  options: SuiteRuntimeOptions,
): FrameworkSuiteRuntime {
  return new FrameworkSuiteRuntime(options);
}
