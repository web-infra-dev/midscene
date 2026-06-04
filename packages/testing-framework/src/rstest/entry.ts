/**
 * Rstest worker entry: turns a generated virtual module into a real Rstest
 * test. Runs inside each Rstest worker, so it re-loads `midscene.config.*` from
 * disk (the config may contain functions — UI Agent factories, runtime nodes —
 * that cannot cross the worker boundary as data) and executes one case.
 *
 * The per-case `CaseResult` is written to `resultFile` for the orchestrator to
 * aggregate; a `failed` case throws so Rstest marks the test red.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from '@rstest/core';
import { PiGeneralAgent } from '../general-agent/pi-general-agent';
import type { GeneralAgentAdapter } from '../general-agent/types';
import { loadConfig } from '../runner/load-config';
import { executeCaseFile } from '../runner/run';
import type { CaseResult } from '../types';

export interface DefineMidsceneCaseTestOptions {
  testName: string;
  configPath: string;
  yamlFile: string;
  resultFile: string;
  /** Root used to resolve relative paths; defaults to the config's directory. */
  projectRoot?: string;
  /** Per-case timeout in ms (0 = inherit the project default). */
  testTimeout?: number;
}

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const writeResultFile = (resultFile: string, data: CaseResult): void => {
  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(data, null, 2));
};

const createRuntimeFailureResult = (
  file: string,
  testName: string,
  startTime: number,
  error: unknown,
): CaseResult => ({
  name: testName,
  file,
  status: 'failed',
  steps: [],
  warnings: [],
  durationMs: Date.now() - startTime,
});

export function defineMidsceneCaseTest(
  options: DefineMidsceneCaseTestOptions,
): void {
  const run = async () => {
    const file = resolve(options.yamlFile);
    const startTime = Date.now();
    let result: CaseResult | undefined;

    try {
      const { config, configPath } = await loadConfig(options.configPath);
      const projectRoot = options.projectRoot
        ? resolve(options.projectRoot)
        : dirname(configPath);
      const generalAgent: GeneralAgentAdapter =
        config.generalAgent ?? new PiGeneralAgent();

      try {
        result = await executeCaseFile({
          config,
          file,
          generalAgent,
          projectRoot,
          env: process.env,
        });
      } finally {
        await generalAgent.dispose?.();
      }

      writeResultFile(options.resultFile, result);

      if (result.status === 'failed') {
        const reason =
          result.steps.find((step) => step.status === 'failed')?.error ??
          result.steps.find((step) => step.verdict && !step.verdict.pass)
            ?.verdict?.reason ??
          'a gating step failed';
        throw new Error(`Case "${options.testName}" failed: ${reason}`);
      }
    } catch (error) {
      if (!result) {
        writeResultFile(
          options.resultFile,
          createRuntimeFailureResult(file, options.testName, startTime, error),
        );
        throw new Error(
          `Case "${options.testName}" errored: ${errorMessageOf(error)}`,
        );
      }
      throw error;
    }
  };

  if (options.testTimeout && options.testTimeout > 0) {
    test(options.testName, run, options.testTimeout);
  } else {
    test(options.testName, run);
  }
}
