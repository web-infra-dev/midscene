import { describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/core/agent', () => ({
  paramStr: () => '',
  typeStr: () => 'Plan',
}));

rs.mock('../src/store/store', () => ({
  useEnvConfig: () => ({}),
}));

rs.mock('../src/utils/replay-scripts', () => ({
  allScriptsFromDump: () => null,
}));

import { formatPlaygroundError } from '../src/hooks/usePlaygroundExecution';

describe('playground error formatting', () => {
  it('does not render an opaque empty error object as JSON braces', () => {
    expect(formatPlaygroundError({})).toBe(
      'Unknown error (an empty error object was received)',
    );
  });

  it('uses the nested cause message when the outer error has none', () => {
    expect(
      formatPlaygroundError({
        cause: { message: 'Debugger is not attached to the tab' },
      }),
    ).toBe('Debugger is not attached to the tab');
  });
});
