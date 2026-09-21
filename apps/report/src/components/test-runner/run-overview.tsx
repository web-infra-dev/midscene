import type { TestRunReportDump } from '@midscene/core';
import { Alert } from 'antd';
import { useMemo, useRef, useState } from 'react';
import { CaseDensitySwitch } from './case-density-switch';
import { CaseFilters } from './case-filters';
import {
  type RunnerBreakdownSort,
  type RunnerBreakdownSortDirection,
  type RunnerBreakdownStatus,
  type RunnerCaseView,
  type RunnerHealthStats,
  type RunnerProjectView,
  type RunnerVisualIndex,
  defaultRunnerBreakdownSortDirection,
  filterAndSortRunnerProjectBreakdown,
  toggleAllRunnerProjectKeys,
} from './model';
import { ProjectBreakdownTree } from './project-breakdown';
import { RunSummary } from './run-summary';
import type { RunnerCaseDisplayMode } from './view-primitives';

import { LifecycleErrors, getProjectLifecycleIssues } from './lifecycle-errors';

export function RunOverview({
  visualIndex,
  dump,
  cases,
  health,
  projects,
  caseDisplayMode,
  onCaseDisplayModeChange,
  expandedProjectKeys,
  onExpandedProjectKeysChange,
  onOpenCase,
}: {
  visualIndex: RunnerVisualIndex;
  dump: TestRunReportDump;
  cases: RunnerCaseView[];
  health: RunnerHealthStats;
  projects: RunnerProjectView[];
  caseDisplayMode: RunnerCaseDisplayMode;
  onCaseDisplayModeChange(mode: RunnerCaseDisplayMode): void;
  expandedProjectKeys: Set<string>;
  onExpandedProjectKeysChange(keys: Set<string>): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const breakdownRef = useRef<HTMLElement>(null);
  const [breakdownQuery, setBreakdownQuery] = useState('');
  const [breakdownStatus, setBreakdownStatus] =
    useState<RunnerBreakdownStatus>('all');
  const [breakdownSort, setBreakdownSort] =
    useState<RunnerBreakdownSort>('result');
  const [breakdownSortDirection, setBreakdownSortDirection] =
    useState<RunnerBreakdownSortDirection>('asc');
  const breakdownProjects = useMemo(
    () =>
      filterAndSortRunnerProjectBreakdown(projects, {
        query: breakdownQuery,
        status: breakdownStatus,
        sort: breakdownSort,
        direction: breakdownSortDirection,
      }),
    [
      breakdownQuery,
      breakdownSort,
      breakdownSortDirection,
      breakdownStatus,
      projects,
    ],
  );
  const resetBreakdownFilters = () => {
    setBreakdownQuery('');
    setBreakdownStatus('all');
    setBreakdownSort('result');
    setBreakdownSortDirection('asc');
  };
  const changeBreakdownSort = (nextSort: RunnerBreakdownSort) => {
    if (nextSort === breakdownSort) {
      setBreakdownSortDirection((direction) =>
        direction === 'asc' ? 'desc' : 'asc',
      );
      return;
    }
    setBreakdownSort(nextSort);
    setBreakdownSortDirection(defaultRunnerBreakdownSortDirection(nextSort));
  };
  const visibleProjectKeys = breakdownProjects.map(({ item }) => item.key);
  const allProjectsExpanded =
    visibleProjectKeys.length > 0 &&
    visibleProjectKeys.every((key) => expandedProjectKeys.has(key));
  const hasActiveBreakdownFilters =
    Boolean(breakdownQuery.trim()) || breakdownStatus !== 'all';
  const successfulWithRetries =
    dump.summary.failed === 0 &&
    dump.summary.notRun === 0 &&
    health.retryPassedCount > 0;
  const totalCaseCount = Math.max(dump.summary.total, cases.length);
  const focusOutcomeCases = () => {
    const nextStatus: RunnerBreakdownStatus =
      dump.summary.failed > 0
        ? 'failed'
        : successfulWithRetries
          ? 'retry-passed'
          : 'all';
    const relevantProjects = projects.filter((item) => {
      if (nextStatus === 'failed') return item.failedCount > 0;
      if (nextStatus === 'retry-passed') return item.retryPassedCount > 0;
      return true;
    });
    setBreakdownStatus(nextStatus);
    setBreakdownSort('result');
    setBreakdownSortDirection('asc');
    onExpandedProjectKeysChange(
      new Set(relevantProjects.map((item) => item.key)),
    );
    window.requestAnimationFrame(() => {
      breakdownRef.current?.scrollIntoView({ block: 'start' });
    });
  };

  return (
    <div className="runner-page runner-overview">
      <RunSummary
        dump={dump}
        health={health}
        totalCaseCount={totalCaseCount}
        onReviewOutcome={focusOutcomeCases}
      />

      <LifecycleErrors
        issues={dump.projects.flatMap((project) =>
          getProjectLifecycleIssues(project),
        )}
      />
      <section
        ref={breakdownRef}
        className="runner-panel runner-breakdown-panel"
      >
        <div className="runner-section-heading">
          <h2>Projects and cases</h2>
        </div>
        <div className="runner-breakdown-controls">
          <CaseDensitySwitch
            value={caseDisplayMode}
            onChange={onCaseDisplayModeChange}
          />
          <CaseFilters
            cases={cases}
            query={breakdownQuery}
            status={breakdownStatus}
            onQueryChange={setBreakdownQuery}
            onStatusChange={setBreakdownStatus}
            allProjectsExpanded={allProjectsExpanded}
            canToggleProjects={visibleProjectKeys.length > 0}
            onToggleProjects={() =>
              onExpandedProjectKeysChange(
                toggleAllRunnerProjectKeys(
                  visibleProjectKeys,
                  expandedProjectKeys,
                ),
              )
            }
          />
        </div>
        <ProjectBreakdownTree
          visualIndex={visualIndex}
          projects={breakdownProjects}
          caseDisplayMode={caseDisplayMode}
          expandedProjectKeys={expandedProjectKeys}
          sort={breakdownSort}
          sortDirection={breakdownSortDirection}
          onSortChange={changeBreakdownSort}
          onExpandedProjectKeysChange={onExpandedProjectKeysChange}
          hasActiveFilters={hasActiveBreakdownFilters}
          onResetFilters={resetBreakdownFilters}
          onOpenCase={onOpenCase}
        />
      </section>

      {dump.diagnostics?.length ? (
        <section className="runner-panel runner-diagnostics">
          <div className="runner-section-heading">
            <div>
              <div className="runner-eyebrow">Report assembly</div>
              <h2>Diagnostics</h2>
            </div>
          </div>
          {dump.diagnostics.map((diagnostic, index) => (
            <Alert
              key={`${diagnostic.code}-${diagnostic.scopeId ?? index}`}
              type={diagnostic.level === 'error' ? 'error' : 'warning'}
              showIcon
              message={diagnostic.message}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
