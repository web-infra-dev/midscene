import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Checkbox, ConfigProvider, Input } from 'antd';
import type { OverviewStatus } from './overview-model';

export function CaseStatusFilters({
  statuses,
  counts,
  onStatusToggle,
}: {
  statuses: readonly OverviewStatus[];
  counts: Record<OverviewStatus | 'all', number>;
  onStatusToggle(value: OverviewStatus | 'all'): void;
}): JSX.Element {
  return (
    <ConfigProvider wave={{ disabled: true }}>
      <fieldset className="runner-status-filters">
        <legend className="runner-sr-only">Filter cases by status</legend>
        {(
          [
            ['all', 'All'],
            ['failed', 'Failed'],
            ['passed', 'Passed'],
            ['retry-passed', 'Retried'],
          ] as const
        ).map(([value, label]) => (
          <Checkbox
            key={value}
            className={`runner-status-filter${value === 'passed' || value === 'retry-passed' ? ' has-alt-checkbox' : ''}`}
            checked={
              value === 'all' ? !statuses.length : statuses.includes(value)
            }
            aria-label={`${label} (${counts[value]})`}
            onChange={() => onStatusToggle(value)}
            title={
              value === 'retry-passed'
                ? `${counts[value]} Cases that passed after an earlier failed attempt. Whole-file retries alone do not qualify.`
                : `${counts[value]} ${label === 'All' ? 'total' : label.toLowerCase()} Cases in this project`
            }
          >
            {label}
          </Checkbox>
        ))}
      </fieldset>
    </ConfigProvider>
  );
}

export function CaseSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange(value: string): void;
}): JSX.Element {
  return (
    <Input
      className="runner-overview-search"
      prefix={<SearchOutlined />}
      aria-label="Search projects, files, cases, and details"
      placeholder="Search projects, files, cases…"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
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
    />
  );
}
