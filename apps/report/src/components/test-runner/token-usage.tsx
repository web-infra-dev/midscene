import { InfoCircleOutlined } from '@ant-design/icons';
import type { TestRunReportAgentDetail } from '@midscene/core';
import type { ReportModelUsageSummary } from '@midscene/core/report-stats';
import { Tooltip } from 'antd';
import { type ReactNode, useMemo, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import {
  type TokenUsageSummary,
  getRecordedModelUsage,
} from './token-usage-model';
import './token-usage.less';

function formatUsage(
  value: number,
  status: TokenUsageSummary['status'],
): string {
  if (status === 'unknown') return '—';
  return `${value.toLocaleString()}${status === 'partial' ? ' (partial)' : ''}`;
}

export function TokenUsageDetails({
  usage,
  models,
}: {
  usage: TokenUsageSummary;
  models: ReportModelUsageSummary[];
}): JSX.Element {
  const rows: [string, number, TokenUsageSummary['status']][] = [
    ['Model calls', usage.modelCallCount, usage.callStatus],
    ['Input tokens', usage.promptTokens, usage.status],
    ['Cached input tokens', usage.cachedInputTokens, usage.status],
    ['Output tokens', usage.completionTokens, usage.status],
    ['Total tokens', usage.totalTokens, usage.status],
  ];
  return (
    <div className="runner-token-details">
      <strong>Model usage</strong>
      {models.length ? (
        <ul aria-label="Recorded models">
          {models.map((model) => (
            <li key={model.modelName}>
              <strong>{model.modelName}</strong>
              <div>
                {model.callCount.toLocaleString()} calls ·{' '}
                {model.totalTokens.toLocaleString()} tokens
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>Model details not recorded.</p>
      )}
      <dl>
        {rows.map(([label, value, status]) => (
          <div key={label}>
            <dt
              className={
                label === 'Cached input tokens' ? 'is-subset' : undefined
              }
            >
              {label}
            </dt>
            <dd>{formatUsage(value, status)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TokenUsageTooltip({
  usage,
  reports = [],
  details,
  scope,
  children,
}: {
  usage: TokenUsageSummary;
  reports?: PlaywrightTasks[];
  details?: TestRunReportAgentDetail[];
  scope: 'case' | 'run';
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const models = useMemo(
    () => (open ? getRecordedModelUsage(reports, details) : []),
    [open, reports, details],
  );
  return (
    <span>
      <Tooltip
        title={<TokenUsageDetails usage={usage} models={models} />}
        trigger={['hover', 'focus', 'click']}
        open={open}
        onOpenChange={setOpen}
        overlayClassName="runner-token-tooltip"
      >
        <button
          type="button"
          className="runner-token-usage"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          aria-label={
            scope === 'case'
              ? 'Case model token usage'
              : 'Run model token usage'
          }
        >
          {children}
          <InfoCircleOutlined aria-hidden="true" />
        </button>
      </Tooltip>
    </span>
  );
}
