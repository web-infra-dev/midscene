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
        id: 'platform-filter',
        label: '平台 · Platform',
        options: uniqueOptions(
          testcases.map((item) => item.platform),
          '全部平台',
          (value) => (value === 'web' ? 'Web' : 'Mobile'),
        ),
      },
      {
        key: 'category' as const,
        id: 'category-filter',
        label: '类目 · Category',
        options: uniqueOptions(
          testcases.map((item) => item.category.item),
          '全部类目',
        ),
      },
      {
        key: 'dataset' as const,
        id: 'dataset-filter',
        label: '来源 · Dataset',
        options: uniqueOptions(
          testcases.map((item) => item.reference.dataset),
          '全部来源',
        ),
      },
      {
        key: 'outcome' as const,
        id: 'outcome-filter',
        label: '预期结果',
        options: [
          { value: '', text: '全部结果' },
          { value: 'point', text: '定位' },
          { value: 'refusal', text: '拒识' },
        ],
      },
    ],
    [testcases],
  );

  return (
    <form
      id="filters"
      className="filters"
      aria-label="筛选用例"
      onSubmit={(event) => event.preventDefault()}
    >
      {groups.map((group) => (
        <FilterSelect
          key={group.key}
          id={group.id}
          label={group.label}
          options={group.options}
          value={filters[group.key]}
          open={opened === group.key}
          onOpenChange={(open) => setOpened(open ? group.key : null)}
          onChange={(value) => onChange({ ...filters, [group.key]: value })}
        />
      ))}
      <label className="search-field" htmlFor="search">
        <span className="visually-hidden">搜索名称或双语指令</span>
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
          placeholder="搜索名称或双语指令"
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
        清空筛选
      </button>
    </form>
  );
}
