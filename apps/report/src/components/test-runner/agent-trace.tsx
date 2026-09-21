import { ArrowLeftOutlined } from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportStep } from '@midscene/core';
import { GroupedActionDump } from '@midscene/core';
import { Alert } from 'antd';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { PlaywrightTasks } from '../../types';
import type { RunnerCaseView } from './model';
import { CaseStatus } from './view-primitives';

const buildAgentReports = (
  step: TestRunReportStep | undefined,
  reports: readonly PlaywrightTasks[],
): PlaywrightTasks[] => {
  if (!step?.agentDetails?.length) return [];
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

export const buildRunnerTracePageHref = (stepId: string): string => {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
  );
  params.set('runner-step', stepId);
  params.set('runner-trace', 'page');
  url.hash = params.toString();
  return url.toString();
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
      {step.agentDetailDiagnostic ? (
        <Alert type="warning" showIcon message={step.agentDetailDiagnostic} />
      ) : null}
      {agentReports.length ? (
        <div className="runner-detail-trace-view">
          {renderAgentReport(agentReports)}
        </div>
      ) : (
        <Alert
          type="error"
          showIcon
          message="The referenced Agent report group is missing."
        />
      )}
    </div>
  );
}

export function RunnerTracePage({
  item,
  attempt,
  step,
  reports,
  renderAgentReport,
  onBack,
}: {
  item: RunnerCaseView;
  attempt?: TestRunReportAttempt;
  step: TestRunReportStep;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
}): JSX.Element {
  return (
    <div className="runner-page runner-trace-page">
      <section className="runner-trace-page-header">
        <button type="button" className="runner-back-button" onClick={onBack}>
          <ArrowLeftOutlined />
          Case details
        </button>
        <div className="runner-trace-page-heading">
          <div>
            <div className="runner-eyebrow">
              AI trace ·{' '}
              {attempt
                ? `Attempt ${attempt.attemptIndex + 1}`
                : 'Document lifecycle'}
            </div>
            <h1>{step.node}</h1>
            <p>
              {item.project.name} · {item.testCase.name}
            </p>
          </div>
          <CaseStatus
            status={step.status === 'success' ? 'passed' : 'failed'}
            quiet
          />
        </div>
      </section>
      <section className="runner-trace-page-content">
        <RunnerAgentTraceContent
          step={step}
          reports={reports}
          renderAgentReport={renderAgentReport}
        />
      </section>
    </div>
  );
}
