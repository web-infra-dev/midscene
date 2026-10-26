import type { TestRunReportDump } from '../../test-run-report';
import type { ReportActionDump } from '../../types';
import { collectTestRunReportMetrics } from './metrics';
import { buildTestRunReportDump } from './test-run-report';
import type { RunReportInput } from './types';

export function buildAgentTestRunReportDump(
  input: RunReportInput,
  agentDump: ReportActionDump,
  source: { scopeId: string; reportId: string; sourcePath: string },
): TestRunReportDump {
  return buildTestRunReportDump(input, {
    sources: agentDump.executions.length
      ? [
          {
            ...source,
            executionIds: agentDump.executions.flatMap((execution) =>
              execution.id ? [execution.id] : [],
            ),
          },
        ]
      : [],
    metrics: collectTestRunReportMetrics(agentDump),
  });
}
