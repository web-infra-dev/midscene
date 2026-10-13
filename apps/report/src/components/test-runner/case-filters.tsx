import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Checkbox, Input } from 'antd';
import type { OverviewStatus } from './overview-model';

export function CaseFilters({
  query,
  statuses,
  counts,
  onQueryChange,
  onStatusToggle,
  onClear,
}: {
  query: string;
  statuses: readonly OverviewStatus[];
  counts: Record<OverviewStatus | 'all', number>;
  onQueryChange(value: string): void;
  onStatusToggle(value: OverviewStatus | 'all'): void;
  onClear(): void;
}): JSX.Element {
  return (
    <div className="runner-overview-filters">
      <fieldset className="runner-status-filters">
        <legend className="runner-sr-only">Filter cases by status</legend>
        {(
          [
            ['all', 'All'],
            ['failed', 'Failed'],
            ['retry-passed', 'Retried'],
            ['passed', 'Passed'],
          ] as const
        ).map(([value, label]) => (
          <Checkbox
            key={value}
            className="runner-status-filter"
            checked={
              value === 'all' ? !statuses.length : statuses.includes(value)
            }
            onChange={() => onStatusToggle(value)}
            title={
              value === 'retry-passed'
                ? 'Cases that passed after an earlier failed attempt. Whole-file retries alone do not qualify.'
                : undefined
            }
          >
            {label}{' '}
            <span className="runner-filter-count">({counts[value]})</span>
          </Checkbox>
        ))}
      </fieldset>
      <Input
        prefix={<SearchOutlined />}
        aria-label="Search projects, files, cases, and details"
        placeholder="Search projects, files, cases, and details"
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
      {query.trim() || statuses.length ? (
        <button
          type="button"
          className="runner-clear-filters"
          onClick={onClear}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
