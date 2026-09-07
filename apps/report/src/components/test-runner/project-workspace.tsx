import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Empty } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { CaseFilters } from './case-filters';
import { CasePreview } from './case-preview';
import {
  type RunnerBreakdownSort,
  type RunnerBreakdownStatus,
  type RunnerCaseView,
  type RunnerProjectView,
  type RunnerVisualIndex,
  filterAndSortRunnerProjectBreakdown,
} from './model';
import { projectDisplayStatus } from './project-breakdown';
import { CaseStatus, formatDuration, formatPercent } from './view-primitives';

import { LifecycleErrors, getProjectLifecycleIssues } from './lifecycle-errors';

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'success' | 'warning' | 'danger';
}): JSX.Element {
  return (
    <div className={`runner-metric-card${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProjectWorkspace({
  item,
  visualIndex,
  onBack,
  onOpenCase,
}: {
  item: RunnerProjectView;
  visualIndex: RunnerVisualIndex;
  onBack(): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const [visibleLimit, setVisibleLimit] = useState(25);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RunnerBreakdownStatus>('all');
  const [sort, setSort] = useState<RunnerBreakdownSort>('attention');
  const cases = useMemo(
    () =>
      filterAndSortRunnerProjectBreakdown([item], { query, status, sort })[0]
        ?.cases ?? [],
    [item, query, status, sort],
  );
  const resetFilters = () => {
    setQuery('');
    setStatus('all');
    setSort('attention');
    setVisibleLimit(25);
  };
  const visibleCases = cases.slice(0, visibleLimit);

  return (
    <div className="runner-page runner-project-workspace">
      <button type="button" className="runner-back-button" onClick={onBack}>
        <ArrowLeftOutlined />
        Overview
      </button>
      <div className="runner-project-brief">
        <div className="runner-case-workspace-heading">
          <div>
            <CaseStatus status={projectDisplayStatus(item)} />
            <h1>{item.project.name}</h1>
            <div className="runner-case-meta">
              <span>{item.project.platform}</span>
              <span>
                {item.project.documents.length}{' '}
                {item.project.documents.length === 1 ? 'document' : 'documents'}
              </span>
              <span>Retry limit {item.project.retry}</span>
            </div>
          </div>
        </div>

        <section
          className="runner-primary-metrics runner-overview-primary-metrics runner-project-metrics"
          aria-label="Project health"
        >
          <MetricCard
            label="Final pass rate"
            value={formatPercent(item.health.finalPassRate)}
          />
          <MetricCard
            label="First-pass rate"
            value={formatPercent(item.health.firstPassRate)}
          />
          <MetricCard
            label="Failed"
            value={item.failedCount}
            tone={item.failedCount ? 'danger' : undefined}
          />
          <MetricCard
            label="Passed after retry"
            value={item.retryPassedCount}
            tone={item.retryPassedCount ? 'warning' : undefined}
          />
          <MetricCard label="Not run" value={item.notRunCount} />
          <MetricCard
            label="Project time"
            value={formatDuration(item.durationMs)}
          />
        </section>
      </div>

      <LifecycleErrors issues={getProjectLifecycleIssues(item.project)} />

      <section className="runner-project-cases runner-breakdown-panel">
        <div className="runner-section-heading">
          <div>
            <h2>Cases</h2>
          </div>
          <span className="runner-result-count">
            {cases.length} / {item.cases.length} cases
          </span>
        </div>
        <CaseFilters
          cases={item.cases}
          query={query}
          status={status}
          sort={sort}
          onQueryChange={(value) => {
            setQuery(value);
            setVisibleLimit(25);
          }}
          onStatusChange={(value) => {
            setStatus(value);
            setVisibleLimit(25);
          }}
          onSortChange={(value) => {
            setSort(value);
            setVisibleLimit(25);
          }}
        />
        {query || status !== 'all' || sort !== 'attention' ? (
          <div className="runner-project-filter-reset">
            <Button onClick={resetFilters}>Clear filters</Button>
          </div>
        ) : null}
        {visibleCases.length ? (
          <div className="runner-case-list">
            {visibleCases.map((caseItem) => (
              <CasePreview
                item={caseItem}
                key={caseItem.key}
                visualIndex={visualIndex}
                onOpen={onOpenCase}
              />
            ))}
            {visibleLimit < cases.length ? (
              <div className="runner-load-more">
                <Button
                  onClick={() => setVisibleLimit((current) => current + 25)}
                >
                  Load 25 more
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="runner-empty-results">
            <Empty
              description={
                item.cases.length
                  ? 'No cases match these filters'
                  : 'No cases were collected for this project'
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
