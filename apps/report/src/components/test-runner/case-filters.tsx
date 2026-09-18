import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useMemo } from 'react';
import type {
  RunnerBreakdownSort,
  RunnerBreakdownStatus,
  RunnerCaseView,
} from './model';
import { Select } from './select';

export function CaseFilters({
  cases,
  query,
  status,
  sort,
  onQueryChange,
  onStatusChange,
  onSortChange,
  allProjectsExpanded,
  canToggleProjects,
  onToggleProjects,
}: {
  cases: readonly RunnerCaseView[];
  query: string;
  status: RunnerBreakdownStatus;
  sort: RunnerBreakdownSort;
  onQueryChange(value: string): void;
  onStatusChange(value: RunnerBreakdownStatus): void;
  onSortChange(value: RunnerBreakdownSort): void;
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
      aria-label="Filter and sort Project breakdown"
    >
      <Select<RunnerBreakdownStatus>
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
      <Select<RunnerBreakdownSort>
        aria-label="Sort Project breakdown"
        value={sort}
        onChange={(value: RunnerBreakdownSort) => onSortChange(value)}
        options={[
          { label: 'Attention first', value: 'attention' },
          { label: 'Most issues', value: 'issues' },
          { label: 'Longest duration', value: 'duration' },
          { label: 'Project / case name', value: 'name' },
        ]}
      />
      <Input
        prefix={<SearchOutlined />}
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
        <span className="runner-project-expansion-icon" aria-hidden="true" />
      </button>
    </div>
  );
}
