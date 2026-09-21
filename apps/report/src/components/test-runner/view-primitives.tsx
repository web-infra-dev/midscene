import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import type { TestRunReportStep, TestRunReportValue } from '@midscene/core';
import type { ReactNode } from 'react';
import type { RunnerCaseStatus } from './model';
import { StatusBadge } from './status-badge';

export type RunnerCaseDisplayMode = 'compact' | 'detailed';

export const formatDuration = (durationMs: number | undefined): string => {
  if (durationMs === undefined) return '—';
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(2)} s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round(
    (durationMs % 60_000) / 1_000,
  )}s`;
};

export const formatPercent = (value: number): string =>
  `${Math.round(value * 1000) / 10}%`;

export const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

const statusMeta: Record<
  RunnerCaseStatus,
  {
    label: string;
    tone: 'success' | 'warning' | 'failed' | 'neutral';
    icon: ReactNode;
  }
> = {
  passed: {
    label: 'Passed',
    tone: 'success',
    icon: <CheckCircleFilled />,
  },
  'retry-passed': {
    label: 'Passed after retry',
    tone: 'warning',
    icon: <ReloadOutlined />,
  },
  failed: {
    label: 'Failed',
    tone: 'failed',
    icon: <CloseCircleFilled />,
  },
  'not-run': {
    label: 'Not run',
    tone: 'neutral',
    icon: <ClockCircleOutlined />,
  },
};

export function caseStatusLabel(status: RunnerCaseStatus): string {
  return statusMeta[status].label;
}

export function CaseStatus({
  status,
  quiet = false,
}: {
  status: RunnerCaseStatus;
  quiet?: boolean;
}): JSX.Element {
  const meta = statusMeta[status];
  return (
    <StatusBadge
      label={meta.label}
      tone={meta.tone}
      icon={meta.icon}
      quiet={quiet}
    />
  );
}

export function StepStatus({
  status,
}: {
  status: TestRunReportStep['status'];
}): JSX.Element {
  return status === 'success' ? (
    <CheckCircleFilled className="runner-step-status is-success" />
  ) : (
    <CloseCircleFilled className="runner-step-status is-failed" />
  );
}

export function ReportValue({
  value,
}: {
  value: TestRunReportValue | undefined;
}): JSX.Element | null {
  if (!value) return null;
  return (
    <div className="runner-json-block">
      <pre>{JSON.stringify(value.value, null, 2)}</pre>
      {value.redactedPaths?.length ? (
        <div className="runner-data-note">
          Redacted: {value.redactedPaths.join(', ')}
        </div>
      ) : null}
      {value.truncatedPaths?.length ? (
        <div className="runner-data-note">
          Truncated: {value.truncatedPaths.join(', ')}
        </div>
      ) : null}
    </div>
  );
}
