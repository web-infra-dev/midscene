import { describe, expect, it, rs } from '@rstest/core';
import React, { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

rs.stubGlobal('React', React);

rs.mock('../src/component/player', () => ({
  Player: () => 'REPORT_PLAYER',
}));

rs.mock('../src/component/misc', () => ({
  emptyResultTip: 'EMPTY_RESULT',
  serverLaunchTip: () => 'SERVER_NOT_READY',
}));

import { PlaygroundResultView } from '../src/component/playground-result';

type ResultProps = ComponentProps<typeof PlaygroundResultView>;

const output = 'This list page contains 16 articles';
const reportCases: Array<{
  name: string;
  props: Pick<ResultProps, 'result' | 'replayScriptsInfo'>;
}> = [
  {
    name: 'replay',
    props: {
      result: { result: output, error: null },
      replayScriptsInfo: { scripts: [], modelBriefs: [] },
    },
  },
  {
    name: 'inline report',
    props: {
      result: { result: output, error: null, reportHTML: '<html></html>' },
      replayScriptsInfo: null,
    },
  },
  {
    name: 'report reference',
    props: {
      result: {
        result: output,
        error: null,
        report: { id: 'report-1', url: '/report.html', bytes: 100 },
      },
      replayScriptsInfo: null,
    },
  },
];

function renderResult(overrides: Partial<ResultProps>) {
  return renderToStaticMarkup(
    createElement(PlaygroundResultView, {
      result: { result: output, error: null },
      loading: false,
      serverValid: true,
      serviceMode: 'In-Browser',
      replayScriptsInfo: null,
      replayCounter: 0,
      loadingProgressText: '',
      ...overrides,
    }),
  );
}

describe('PlaygroundResultView', () => {
  it.each(reportCases)(
    'shows output before $name when enabled',
    ({ props }) => {
      const html = renderResult({ ...props, showOutputAlongsideReport: true });

      expect(html).toContain('Output:');
      expect(html).toContain(output);
      expect(html).toContain('Report:');
      expect(html).toContain('REPORT_PLAYER');
      expect(html.indexOf(output)).toBeLessThan(html.indexOf('Report:'));
      expect(html.indexOf('Report:')).toBeLessThan(
        html.indexOf('REPORT_PLAYER'),
      );
    },
  );

  it.each(reportCases)('shows only $name by default', ({ props }) => {
    const html = renderResult(props);

    expect(html).not.toContain('Output:');
    expect(html).not.toContain(output);
    expect(html).toContain('REPORT_PLAYER');
  });

  it.each([undefined, false, true])(
    'shows output without a report when the display option is %s',
    (showOutputAlongsideReport) => {
      const html = renderResult({ showOutputAlongsideReport });

      expect(html).toContain(output);
      expect(html).not.toContain('REPORT_PLAYER');
    },
  );

  it('keeps errors ahead of reports even when output is enabled', () => {
    const html = renderResult({
      ...reportCases[0].props,
      result: { result: output, error: 'Execution failed' },
      showOutputAlongsideReport: true,
    });

    expect(html).toContain('Execution failed');
    expect(html).not.toContain(output);
    expect(html).toContain('REPORT_PLAYER');
    expect(html.indexOf('Execution failed')).toBeLessThan(
      html.indexOf('REPORT_PLAYER'),
    );
  });
});
