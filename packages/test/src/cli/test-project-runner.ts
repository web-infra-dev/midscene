import type { TestProjectRunOptions } from './execution-plan';
import { prepareTestRun } from './prepare-test-run';
import { runPreparedTestProject } from './run-prepared-project';
import type { TestProjectRunResult } from './types';

export type { TestProjectRunOptions } from './execution-plan';
export { createTestRunId } from './prepare-test-run';
export {
  DEFAULT_TEST_FILE_SELECTION,
  discoverTestConfig,
  discoverTestFiles,
} from './project-preparation';

/** Existing user entry: input formats are resolved internally before execution. */
export async function runTestProject(
  options: TestProjectRunOptions = {},
): Promise<TestProjectRunResult> {
  return runPreparedTestProject(await prepareTestRun(options));
}
