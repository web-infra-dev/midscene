import type { TestProjectRunOptions } from './execution-plan';
import { prepareTestRun } from './prepare-test-run';
import { runPreparedTestProject } from './run-prepared-project';
import type { TestProjectRunResult } from './types';
import type { YamlCompatibilityRunOptions } from './yaml-compatibility';

/** Private CLI/host integration, intentionally absent from package exports. */
export async function runTestProjectWithYamlCompatibility(
  options: TestProjectRunOptions,
  compatibility: YamlCompatibilityRunOptions,
): Promise<TestProjectRunResult> {
  return runPreparedTestProject(await prepareTestRun(options, compatibility));
}
