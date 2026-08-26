import type { BatchRunnerConfig } from '../batch-runner';
import type { RunYamlCaseOptions } from './yaml-case';

export const RSTEST_YAML_CASE_IDS_META_KEY = 'midsceneYamlCaseIds';

export type RstestYamlCaseOptions = Omit<
  RunYamlCaseOptions,
  'file' | 'headed' | 'keepWindow'
>;

export type WebYamlRuntimeOptions = Pick<
  RunYamlCaseOptions,
  'headed' | 'keepWindow'
>;

export interface DefineYamlCaseTestOptions {
  caseId: string;
  testName: string;
  yamlFile: string;
  resultFile: string;
  retry?: number;
  caseOptions?: RstestYamlCaseOptions;
  webRuntimeOptions?: WebYamlRuntimeOptions;
}

export interface DefineYamlBatchTestOptions {
  caseIds: string[];
  testName: string;
  config: BatchRunnerConfig;
  resultTargets: Array<{
    caseId: string;
    yamlFile: string;
    resultFile: string;
  }>;
}
