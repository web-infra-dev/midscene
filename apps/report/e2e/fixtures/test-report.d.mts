import type {
  TestRunReportDump,
  TestRunReportSourceIndex,
} from '@midscene/core';
import type { TestRunReportAssembler } from '@midscene/core/report';

export function createTestReportFixture(
  index: TestRunReportSourceIndex,
): TestRunReportDump;
export function createLifecycleReportFixture(
  index: TestRunReportSourceIndex,
): TestRunReportDump;
export function generateTestReportFixtures(
  Assembler: typeof TestRunReportAssembler,
  sourcePath: string,
  outputDir: string,
): string[];
