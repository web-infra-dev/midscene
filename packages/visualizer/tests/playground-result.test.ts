import { describe, expect, it, rs } from '@rstest/core';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

rs.stubGlobal('React', React);

rs.mock('@midscene/playground', () => ({
  outputAndReportAPIs: ['aiAct'],
}));

rs.mock('../src/component/player', () => ({
  Player: () => 'REPORT_PLAYER',
}));

rs.mock('../src/component/misc', () => ({
  emptyResultTip: 'EMPTY_RESULT',
  serverLaunchTip: () => 'SERVER_NOT_READY',
}));

import { PlaygroundResultView } from '../src/component/playground-result';

describe('PlaygroundResultView', () => {
  it('shows aiAct output alongside its report', () => {
    const html = renderToStaticMarkup(
      createElement(PlaygroundResultView, {
        result: {
          result: 'This list page contains 16 articles',
          reportHTML: '<html></html>',
          error: null,
        },
        loading: false,
        serverValid: true,
        serviceMode: 'In-Browser-Extension',
        replayScriptsInfo: { scripts: [], modelBriefs: [] },
        replayCounter: 0,
        loadingProgressText: '',
        actionType: 'aiAct',
      }),
    );

    expect(html).toContain('Output:');
    expect(html).toContain('This list page contains 16 articles');
    expect(html).toContain('Report:');
    expect(html).toContain('REPORT_PLAYER');
  });

  it('keeps the report-only presentation when no action type is provided', () => {
    const html = renderToStaticMarkup(
      createElement(PlaygroundResultView, {
        result: {
          result: 'This return value should not be displayed',
          reportHTML: '<html></html>',
          error: null,
        },
        loading: false,
        serverValid: true,
        serviceMode: 'In-Browser',
        replayScriptsInfo: { scripts: [], modelBriefs: [] },
        replayCounter: 0,
        loadingProgressText: '',
      }),
    );

    expect(html).not.toContain('Output:');
    expect(html).not.toContain('This return value should not be displayed');
    expect(html).toContain('REPORT_PLAYER');
  });
});
