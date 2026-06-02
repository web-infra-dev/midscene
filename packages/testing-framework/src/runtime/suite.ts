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
 * Suite-level runtime shared by every case registered in a single Rstest
 * module. The agent and `state` are created once (`setup`) and torn down once
 * (`teardown`), so seeded data and cross-step state stay shared across cases.
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

  /**
   * Run a single YAML case against the shared agent and return its result. The
   * result is always returned (never thrown) so the caller can collect it for
   * the suite summary; the caller decides whether to fail the test. When
   * `resultFile` is provided the same result is also persisted to disk.
   */
  async runCase(
    filePath: string,
    resultFile?: string,
  ): Promise<FrameworkCaseResult> {
    if (!this.setupResult) {
      throw new Error('Suite agent is not ready; setup() must run first');
    }

    const agent = this.setupResult.agent;
    const startTime = Date.now();
    const testName = relative(this.projectDir, filePath) || filePath;
    const reportFile = () =>
      typeof agent.reportFile === 'string' ? agent.reportFile : undefined;

    let result: FrameworkCaseResult;
    try {
      const normalizedCase = normalizeYamlCase(
        readFileSync(filePath, 'utf8'),
        filePath,
      );

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

      result = {
        file: filePath,
        testName,
        success: true,
        duration: Date.now() - startTime,
        report: reportFile(),
      };
    } catch (error) {
      result = {
        file: filePath,
        testName,
        success: false,
        duration: Date.now() - startTime,
        error: errorMessageOf(error),
        report: reportFile(),
      };
    }

    if (resultFile) {
      writeResultFile(resultFile, result);
    }
    return result;
  }
}

export function createSuiteRuntime(
  options: SuiteRuntimeOptions,
): FrameworkSuiteRuntime {
  return new FrameworkSuiteRuntime(options);
}
