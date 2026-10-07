export type TestRunCaseHealthStatus =
  | 'passed'
  | 'retry-passed'
  | 'failed'
  | 'not-run';

export interface TestRunHealthAttempt {
  attemptIndex: number;
  status: 'success' | 'failed';
}

/** Minimal Case shape accepted by the shared Test run health calculator. */
export interface TestRunHealthCase {
  status: 'success' | 'failed' | 'not-run';
  attempts?: readonly TestRunHealthAttempt[];
  /** The legacy single-attempt representation used by execution outcomes. */
  run?: TestRunHealthAttempt;
  /** Retry evidence owned by a surrounding scope, such as a document retry. */
  retryCount?: number;
}

export interface TestRunHealth {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  notRun: number;
  firstPassed: number;
  passedAfterRetry: number;
  finalPassRate: number;
  firstPassRate: number;
}

/** Classify one logical Case using the retry evidence available to its caller. */
export const classifyTestRunCase = (
  testCase: TestRunHealthCase,
): TestRunCaseHealthStatus => {
  if (testCase.status === 'not-run') return 'not-run';
  if (testCase.status === 'failed') return 'failed';
  const attempts =
    testCase.attempts ?? (testCase.run ? [testCase.run] : ([] as const));
  return (testCase.retryCount ?? 0) > 0 ||
    (attempts.at(-1)?.attemptIndex ?? 0) > 0 ||
    attempts.length > 1 ||
    attempts[0]?.status === 'failed'
    ? 'retry-passed'
    : 'passed';
};

export const calculateTestRunHealth = (
  cases: readonly TestRunHealthCase[],
): TestRunHealth => {
  let passed = 0;
  let failed = 0;
  let notRun = 0;
  let firstPassed = 0;
  let passedAfterRetry = 0;

  for (const testCase of cases) {
    switch (classifyTestRunCase(testCase)) {
      case 'passed':
        passed += 1;
        firstPassed += 1;
        break;
      case 'retry-passed':
        passed += 1;
        passedAfterRetry += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'not-run':
        notRun += 1;
        break;
    }
  }

  const total = cases.length;
  const executed = total - notRun;
  return {
    total,
    executed,
    passed,
    failed,
    notRun,
    firstPassed,
    passedAfterRetry,
    finalPassRate: executed === 0 ? 0 : passed / executed,
    firstPassRate: executed === 0 ? 0 : firstPassed / executed,
  };
};
