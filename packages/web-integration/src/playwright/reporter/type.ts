import type { Location } from '@playwright/test/reporter';

export type TestData = {
  testId: string;
  title: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  /**
   * Running time in milliseconds.
   */
  duration: number;
  /**
   * Optional location in the source where the step is defined.
   */
  location?: Location;
  dumpPath?: string;
};
