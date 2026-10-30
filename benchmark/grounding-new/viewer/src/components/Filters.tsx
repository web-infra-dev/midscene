import { useMemo, useState } from 'react';
import type { Filters as FilterValues, TestcaseView } from '../types';
import { FilterSelect } from './FilterSelect';

interface FiltersProps {
  testcases: TestcaseView[];
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  onClear: () => void;
}

function uniqueOptions(
  values: string[],
  first: string,
  label = (value: string) => value,
) {
  return [
    { value: '', text: first },
    ...[...new Set(values)]
      .sort()
      .map((value) => ({ value, text: label(value) })),
  ];
}

export function Filters({
  testcases,
  filters,
  onChange,
  onClear,
}: FiltersProps) {
  const [opened, setOpened] = useState<string | null>(null);
  const groups = useMemo(
    () => [
      {
        key: 'platform' as const,
        label: 'Platform',
        options: uniqueOptions(
          testcases.map((item) => item.platform),
          'All platforms',
          (value) => (value === 'web' ? 'Web' : 'Mobile'),
        ),
      },
      {
        key: 'category' as const,
        label: 'Category',
        options: uniqueOptions(
          testcases.map((item) => item.category.item),
          'All categories',
        ),
      },
      {
        key: 'dataset' as const,
        label: 'Dataset',
        options: uniqueOptions(
          testcases.map((item) => item.reference.dataset),
          'All datasets',
        ),
      },
      {
        key: 'outcome' as const,
        label: 'Expected Outcome',
        options: [
          { value: '', text: 'All outcomes' },
          { value: 'point', text: 'Target' },
          { value: 'refusal', text: 'Refusal' },
        ],
      },
    ],
    [testcases],
  );

  return (
    <form
      id="filters"
      className="filters"
      aria-label="Filter testcases"
      onSubmit={(event) => event.preventDefault()}
    >
      {groups.map((group) => (
        <FilterSelect
          key={group.key}
          id={`${group.key}-filter`}
          label={group.label}
          options={group.options}
          value={filters[group.key]}
          open={opened === group.key}
          onOpenChange={(open) => setOpened(open ? group.key : null)}
          onChange={(value) => onChange({ ...filters, [group.key]: value })}
        />
      ))}
      <label className="search-field" htmlFor="search">
        <span className="visually-hidden">Search Testcases</span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          id="search"
          type="search"
          placeholder="Search names or instructions"
          autoComplete="off"
          value={filters.search}
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value })
          }
        />
      </label>
      <button
        id="clear-filters"
        type="button"
        className="text-button"
        disabled={!Object.values(filters).some(Boolean)}
        onClick={() => {
          setOpened(null);
          onClear();
        }}
      >
        Clear filters
      </button>
    </form>
  );
}
