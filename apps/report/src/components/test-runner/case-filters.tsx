import { CloseCircleFilled } from '@ant-design/icons';
import { Input } from 'antd';
import { useMemo } from 'react';
import type {
  RunnerBreakdownSort,
  RunnerBreakdownSortDirection,
  RunnerBreakdownStatus,
  RunnerCaseView,
} from './model';
import { Select } from './select';

export function CaseFilters({
  cases,
  query,
  status,
  onQueryChange,
  onStatusChange,
  sort,
  sortDirection,
  onSortChange,
  allProjectsExpanded,
  canToggleProjects,
  onToggleProjects,
}: {
  cases: readonly RunnerCaseView[];
  query: string;
  status: RunnerBreakdownStatus;
  onQueryChange(value: string): void;
  onStatusChange(value: RunnerBreakdownStatus): void;
  sort: RunnerBreakdownSort;
  sortDirection: RunnerBreakdownSortDirection;
  onSortChange(
    sort: RunnerBreakdownSort,
    direction: RunnerBreakdownSortDirection,
  ): void;
  allProjectsExpanded: boolean;
  canToggleProjects: boolean;
  onToggleProjects(): void;
}): JSX.Element {
  const statusCounts = useMemo(
    () => ({
      all: cases.length,
      attention: cases.filter((item) => item.status !== 'passed').length,
      failed: cases.filter((item) => item.status === 'failed').length,
      'retry-passed': cases.filter((item) => item.status === 'retry-passed')
        .length,
      passed: cases.filter((item) => item.status === 'passed').length,
      'not-run': cases.filter((item) => item.status === 'not-run').length,
    }),
    [cases],
  );

  return (
    <div
      className="runner-breakdown-toolbar"
      aria-label="Filter Project breakdown"
    >
      <Select<RunnerBreakdownStatus>
        suffixIcon={<span className="runner-overview-select-chevron" />}
        aria-label="Filter breakdown by status"
        value={status}
        onChange={(value: RunnerBreakdownStatus) => onStatusChange(value)}
        options={[
          {
            label: `All statuses (${statusCounts.all})`,
            value: 'all',
          },
          {
            label: `Needs attention (${statusCounts.attention})`,
            value: 'attention',
          },
          {
            label: `Failed (${statusCounts.failed})`,
            value: 'failed',
          },
          {
            label: `Passed after retry (${statusCounts['retry-passed']})`,
            value: 'retry-passed',
          },
          {
            label: `Passed (${statusCounts.passed})`,
            value: 'passed',
          },
          {
            label: `Not run (${statusCounts['not-run']})`,
            value: 'not-run',
          },
        ]}
      />
      <Select
        aria-label="Sort project breakdown"
        suffixIcon={<span className="runner-overview-select-chevron" />}
        value={`${sort}:${sortDirection}`}
        onChange={(value: string) => {
          const [nextSort, direction] = value.split(':');
          onSortChange(
            nextSort as RunnerBreakdownSort,
            direction as RunnerBreakdownSortDirection,
          );
        }}
        options={[
          { label: 'Attention first', value: 'result:asc' },
          { label: 'Passed first', value: 'result:desc' },
          { label: 'Name A–Z', value: 'name:asc' },
          { label: 'Name Z–A', value: 'name:desc' },
          { label: 'Most cases first', value: 'case-count:desc' },
          { label: 'Fewest cases first', value: 'case-count:asc' },
          { label: 'Most passed first', value: 'passed-count:desc' },
          { label: 'Fewest passed first', value: 'passed-count:asc' },
          { label: 'Longest first', value: 'duration:desc' },
          { label: 'Shortest first', value: 'duration:asc' },
        ]}
      />
      <Input
        prefix={
          <img
            src={new URL('./assets/overview-search.svg', import.meta.url).href}
            alt=""
          />
        }
        aria-label="Search projects, cases, and details"
        suffix={
          <button
            type="button"
            className={`runner-search-clear${query ? '' : ' is-hidden'}`}
            aria-label="Clear breakdown search"
            aria-hidden={!query}
            disabled={!query}
            onClick={() => onQueryChange('')}
          >
            <CloseCircleFilled />
          </button>
        }
        placeholder="Search by name"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <button
        type="button"
        className="runner-project-expansion-toggle"
        aria-label={
          allProjectsExpanded ? 'Collapse all projects' : 'Expand all projects'
        }
        title={
          allProjectsExpanded ? 'Collapse all projects' : 'Expand all projects'
        }
        aria-pressed={allProjectsExpanded}
        disabled={!canToggleProjects}
        onClick={onToggleProjects}
      >
        <span
          className={`runner-project-expansion-icon${
            allProjectsExpanded ? ' is-collapse' : ''
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
