import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useMemo } from 'react';
import {
  type RunnerBreakdownSort,
  type RunnerBreakdownSortDirection,
  type RunnerBreakdownStatus,
  type RunnerCaseView,
  defaultRunnerBreakdownSortDirection,
} from './model';
import { Select } from './select';

export function CaseFilters({
  cases,
  query,
  status,
  sort,
  sortDirection,
  onSortChange,
  onQueryChange,
  onStatusChange,
  allProjectsExpanded,
  canToggleProjects,
  onToggleProjects,
}: {
  cases: readonly RunnerCaseView[];
  query: string;
  status: RunnerBreakdownStatus;
  sort: RunnerBreakdownSort;
  sortDirection: RunnerBreakdownSortDirection;
  onSortChange(value: RunnerBreakdownSort): void;
  onQueryChange(value: string): void;
  onStatusChange(value: RunnerBreakdownStatus): void;
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

  const sortLabel =
    sort === 'definition'
      ? 'Definition order'
      : sort === 'result'
        ? sortDirection === 'asc'
          ? 'Attention first'
          : 'Attention last'
        : `${{ name: 'Project name', 'case-count': 'Case count', 'passed-rate': 'Passed rate', duration: 'Duration' }[sort]} ${sortDirection === 'asc' ? '↑' : '↓'}`;

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
      <Select<string>
        className="runner-breakdown-sort"
        aria-label="Sort projects and cases"
        suffixIcon={<span className="runner-overview-select-chevron" />}
        value={
          sortDirection === defaultRunnerBreakdownSortDirection(sort)
            ? sort
            : `${sort}-${sortDirection}`
        }
        labelRender={() => sortLabel}
        title={
          sort === 'definition'
            ? 'Project configuration order, YAML file path, then Case definition order'
            : undefined
        }
        options={[
          { value: 'result', label: 'Attention first' },
          { value: 'definition', label: 'Definition order' },
          { value: 'name', label: 'Project name' },
          { value: 'passed-rate', label: 'Passed rate' },
          { value: 'duration', label: 'Duration' },
        ]}
        onSelect={(value) => onSortChange(value as RunnerBreakdownSort)}
      />
      <Input
        prefix={<SearchOutlined />}
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
        placeholder="Search projects, cases, and details"
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
