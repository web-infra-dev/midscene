import { readFileSync } from 'node:fs';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import {
  type ExecutionSummary,
  getExecutionSummary,
} from './execution-summary';
import type { FrameworkTestCommandResult } from './framework/command';

const schemaVersion = 1 as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CliJsonResult {
  file: string;
  success: boolean;
  executed: boolean;
  resultType: MidsceneYamlConfigResult['resultType'];
  duration: number;
  error: string | null;
  report: string | null;
  outputPath: string | null;
  output: JsonValue;
}

export interface CliJsonRunOutput {
  schemaVersion: typeof schemaVersion;
  kind: 'run';
  ok: boolean;
  exitCode: number;
  summary: ExecutionSummary & { path: string };
  results: CliJsonResult[];
}

export interface CliJsonErrorOutput {
  schemaVersion: typeof schemaVersion;
  kind: 'error';
  ok: false;
  exitCode: number;
  error: {
    name: string;
    message: string;
  };
}

export type CliJsonOutput = CliJsonRunOutput | CliJsonErrorOutput;

const readYamlOutput = (outputPath: string | null | undefined): JsonValue => {
  if (!outputPath) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(outputPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read YAML output file: ${outputPath}`, {
      cause: error,
    });
  }

  try {
    return JSON.parse(content) as JsonValue;
  } catch (error) {
    throw new Error(`YAML output file is not valid JSON: ${outputPath}`, {
      cause: error,
    });
  }
};

const createJsonResult = (result: MidsceneYamlConfigResult): CliJsonResult => ({
  file: result.file,
  success: result.success,
  executed: result.executed,
  resultType: result.resultType,
  duration: result.duration ?? 0,
  error: result.error ?? null,
  report: result.report ?? null,
  outputPath: result.output ?? null,
  output: readYamlOutput(result.output),
});

export function createCliJsonRunOutput(
  run: FrameworkTestCommandResult,
): CliJsonRunOutput {
  return {
    schemaVersion,
    kind: 'run',
    ok: run.exitCode === 0,
    exitCode: run.exitCode,
    summary: {
      path: run.summaryPath,
      ...getExecutionSummary(run.results),
    },
    results: run.results.map(createJsonResult),
  };
}

export function createCliJsonErrorOutput(
  error: unknown,
  exitCode = 1,
): CliJsonErrorOutput {
  return {
    schemaVersion,
    kind: 'error',
    ok: false,
    exitCode,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
