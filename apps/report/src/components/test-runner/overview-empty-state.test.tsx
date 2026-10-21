import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverviewEmptyState } from './overview-empty-state';

describe('overview empty state', () => {
  it('offers a filter reset for an empty search result', () => {
    const html = renderToStaticMarkup(
      <OverviewEmptyState
        title="No matching cases"
        description="Try another status or search term."
        onReset={() => {}}
      />,
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('No matching cases');
    expect(html).toContain('Try another status or search term.');
    expect(html).toContain('Clear filters');
    expect(html.match(/<button /g)).toHaveLength(1);
  });

  it('does not offer to clear filters when the report contains no files', () => {
    const html = renderToStaticMarkup(
      <OverviewEmptyState
        title="No files in this project"
        description="This project did not collect any files."
      />,
    );
    expect(html).toContain('No files in this project');
    expect(html).not.toContain('<button ');
  });
});
