import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaseFilters } from './case-filters';

describe('overview status checkboxes', () => {
  it('shows mutually exclusive Case counts and explains Retried without sort dropdowns', () => {
    const html = renderToStaticMarkup(
      <CaseFilters
        query=""
        statuses={['failed', 'passed']}
        counts={{ all: 7, failed: 2, 'retry-passed': 1, passed: 3 }}
        onQueryChange={() => {}}
        onStatusToggle={() => {}}
        onClear={() => {}}
      />,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('Filter cases by status');
    expect(html).toContain('Whole-file retries alone do not qualify.');
    expect(html).toContain('Search projects, files, cases, and details');
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain('Clear filters');
  });
});
