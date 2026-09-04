import { describe, expect, it, rs } from '@rstest/core';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InfoListItem } from '../src/types';

rs.stubGlobal('React', React);

const { getInfoList } = rs.hoisted(() => ({
  getInfoList: rs.fn<() => InfoListItem[]>(),
}));

// Keep the real Universal -> display policy -> result view path. Only stub
// state/execution hooks and unrelated UI; API classifications are not mocked.
rs.mock('../src/hooks/usePlaygroundState', () => ({
  usePlaygroundState: () => ({
    infoList: getInfoList(),
    loading: false,
    actionSpace: [],
    actionSpaceLoading: false,
    infoListRef: { current: null },
  }),
}));

rs.mock('../src/hooks/usePlaygroundExecution', () => ({
  usePlaygroundExecution: () => ({ canStop: false }),
}));

rs.mock('../src/store/store', () => ({
  useEnvConfig: () => ({ config: {} }),
}));

rs.mock('../src/utils', () => ({ notifyError: rs.fn() }));
rs.mock('../src/icons/avatar.svg', () => ({ default: () => null }));
rs.mock('../src/component/prompt-input', () => ({ PromptInput: () => null }));
rs.mock('../src/component/context-preview', () => ({
  ContextPreview: () => null,
}));
rs.mock('../src/component/env-config-reminder', () => ({
  EnvConfigReminder: () => null,
}));
rs.mock('../src/component/player', () => ({ Player: () => 'REPORT_PLAYER' }));
rs.mock('../src/component/misc', () => ({
  emptyResultTip: 'EMPTY_RESULT',
  serverLaunchTip: () => 'SERVER_NOT_READY',
}));

import { UniversalPlayground } from '../src/component/universal-playground';

describe('UniversalPlayground result display policy', () => {
  it.each([
    { actionType: 'aiAct', showOutput: true },
    { actionType: 'aiQuery', showOutput: true },
    { actionType: 'aiBoolean', showOutput: true },
    { actionType: 'aiNumber', showOutput: true },
    { actionType: 'aiString', showOutput: true },
    { actionType: 'aiAsk', showOutput: true },
    { actionType: 'aiAssert', showOutput: true },
    { actionType: 'aiWaitFor', showOutput: true },
    { actionType: 'aiTap', showOutput: false },
    { actionType: 'aiHover', showOutput: false },
    { actionType: undefined, showOutput: false },
  ])(
    'selects output visibility for $actionType',
    ({ actionType, showOutput }) => {
      getInfoList.mockReturnValue([
        {
          id: 'result-1',
          type: 'result',
          content: '',
          timestamp: new Date('2026-09-03T00:00:00Z'),
          actionType,
          result: {
            result: 'API_RETURN_VALUE',
            reportHTML: '<html></html>',
            error: null,
          },
        },
      ]);

      const html = renderToStaticMarkup(
        createElement(UniversalPlayground, {
          playgroundSDK: null,
          showContextPreview: false,
          config: {
            persistMessages: false,
            hidePromptInput: true,
            showSystemMessageHeader: false,
            showClearButton: false,
          },
        }),
      );

      expect(html).toContain('REPORT_PLAYER');
      expect(html.includes('API_RETURN_VALUE')).toBe(showOutput);
      expect(html.includes('Output:')).toBe(showOutput);
      if (showOutput) {
        expect(html.indexOf('API_RETURN_VALUE')).toBeLessThan(
          html.indexOf('REPORT_PLAYER'),
        );
      }
    },
  );
});
