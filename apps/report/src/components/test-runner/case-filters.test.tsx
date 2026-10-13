import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaseFilters } from './case-filters';
import type {
  RunnerBreakdownSort,
  RunnerBreakdownSortDirection,
} from './model';

describe('overview sorting control', () => {
  it.each([
    ['result', 'asc', 'Attention first'],
    ['result', 'desc', 'Attention last'],
    ['definition', 'asc', 'Definition order'],
    ['duration', 'desc', 'Duration ↓'],
    ['name', 'asc', 'Project name ↑'],
    ['name', 'desc', 'Project name ↓'],
    ['passed-rate', 'desc', 'Passed rate ↓'],
    ['passed-rate', 'asc', 'Passed rate ↑'],
  ] as const)(
    'reflects the active %s %s sort in the toolbar',
    (
      sort: RunnerBreakdownSort,
      sortDirection: RunnerBreakdownSortDirection,
      label: string,
    ) => {
      const html = renderToStaticMarkup(
        <CaseFilters
          cases={[]}
          query=""
          status="all"
          sort={sort}
          sortDirection={sortDirection}
          onSortChange={() => {}}
          onQueryChange={() => {}}
          onStatusChange={() => {}}
          allProjectsExpanded={false}
          canToggleProjects={false}
          onToggleProjects={() => {}}
        />,
      );
      expect(html).toContain(label);
      expect(html.indexOf('Filter breakdown by status')).toBeLessThan(
        html.indexOf('Sort projects and cases'),
      );
      expect(html.indexOf('Sort projects and cases')).toBeLessThan(
        html.indexOf('Search projects, cases, and details'),
      );
      if (sort === 'definition')
        expect(html).toContain(
          'Project configuration order, YAML file path, then Case definition order',
        );
    },
  );
});
