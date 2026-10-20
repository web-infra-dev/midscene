import type { TestRunReportStep } from '@midscene/core';
import { GroupedActionDump } from '@midscene/core';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { PlaywrightTasks } from '../../types';
import type { ReportIssue } from './issues';

export function getAgentReportIssues(
  step: TestRunReportStep,
  reports: readonly PlaywrightTasks[],
): ReportIssue[] {
  const missing = step.agentDetails?.filter(
    (detail) => !reports.some((report) => report.reportId === detail.reportId),
  );
  return missing?.length
    ? [
        {
          id: `${step.id}:missing-group`,
          severity: 'warning',
          code: 'AGENT_REPORT_MISSING',
          message: 'The referenced Agent report group is missing.',
          context: { references: missing },
        },
      ]
    : [];
}

const buildAgentReports = (
  step: TestRunReportStep | undefined,
  reports: readonly PlaywrightTasks[],
): PlaywrightTasks[] => {
  if (!step?.agentDetails?.length || step.status === 'not-run') return [];
  const idsByReport = new Map<string, Set<string>>();
  for (const detail of step.agentDetails) {
    const ids = idsByReport.get(detail.reportId) ?? new Set<string>();
    ids.add(detail.executionId);
    idsByReport.set(detail.reportId, ids);
  }

  const selectedReports: PlaywrightTasks[] = [];
  for (const [reportId, executionIds] of idsByReport) {
    const source = reports.find((report) => report.reportId === reportId);
    if (!source) continue;
    let cached: GroupedActionDump | undefined;
    selectedReports.push({
      reportId,
      runnerScopeId: source.runnerScopeId,
      attributes: {
        playwright_test_description: step.title ?? '',
        playwright_test_id: step.id,
        playwright_test_title: step.node,
        playwright_test_status: step.status === 'success' ? 'passed' : 'failed',
        playwright_test_duration: step.durationMs,
        is_merged: idsByReport.size > 1,
      },
      get: () => {
        if (!cached) {
          const sourceDump = source.get();
          cached = new GroupedActionDump({
            sdkVersion: sourceDump.sdkVersion,
            groupName: sourceDump.groupName,
            groupDescription: sourceDump.groupDescription,
            modelBriefs: sourceDump.modelBriefs,
            deviceType: sourceDump.deviceType,
            executions: sourceDump.executions.filter(
              (execution) => execution.id && executionIds.has(execution.id),
            ),
          });
        }
        return cached;
      },
    });
  }
  return selectedReports;
};

export function RunnerAgentTraceContent({
  step,
  reports,
  renderAgentReport,
}: {
  step: TestRunReportStep;
  reports: readonly PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
}): JSX.Element {
  const agentReports = useMemo(
    () => buildAgentReports(step, reports),
    [reports, step],
  );

  return (
    <div className="runner-agent-trace-content">
      {agentReports.length ? (
        <div className="runner-detail-trace-view">
          {renderAgentReport(agentReports)}
        </div>
      ) : (
        <p>Recording unavailable.</p>
      )}
    </div>
  );
}
