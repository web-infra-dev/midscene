import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaseSearch, CaseStatusFilters } from './case-filters';

describe('overview status checkboxes', () => {
  it('keeps Case counts accessible without widening the project filters', () => {
    const html = renderToStaticMarkup(
      <>
        <CaseStatusFilters
          statuses={['failed', 'passed']}
          counts={{ all: 7, failed: 2, 'not-run': 1, passed: 4 }}
          onStatusToggle={() => {}}
        />
        <CaseSearch query="checkout" onQueryChange={() => {}} />
      </>,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('Filter cases by status');
    expect(html).toContain('aria-label="Passed (4)"');
    expect(html).toContain('aria-label="Not run (1)"');
    expect(html).not.toContain('Retried');
    expect(html).toContain('Search projects, files, cases, and details');
    expect(html).toContain('placeholder="Search projects, files, cases…"');
    expect(html).toContain('aria-label="Failed (2)"');
    expect(html).toContain('value="checkout"');
    expect(html).not.toContain('runner-filter-count');
    expect(html).not.toContain('role="combobox"');
  });
});
