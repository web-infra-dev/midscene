import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const { playgroundSDKMock } = rs.hoisted(() => ({
  playgroundSDKMock: rs.fn(),
}));

rs.mock('@midscene/playground', () => ({
  PlaygroundSDK: playgroundSDKMock,
}));

import { getReportPlaygroundSDK } from '../src/utils/report-playground-utils';

describe('getReportPlaygroundSDK', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('lets PlaygroundSDK resolve the remote server URL in Server mode', () => {
    getReportPlaygroundSDK('Server');

    expect(playgroundSDKMock).toHaveBeenCalledWith({
      type: 'remote-execution',
    });
  });

  it('throws when local execution has no agent factory', () => {
    expect(() => getReportPlaygroundSDK('In-Browser')).toThrow(
      'Agent or agentFactory is required for local execution mode',
    );
  });

  it('uses local execution with agent factory outside Server mode', () => {
    const agentFactory = rs.fn();

    getReportPlaygroundSDK('In-Browser', undefined, agentFactory);

    expect(playgroundSDKMock).toHaveBeenCalledWith({
      type: 'local-execution',
      agentFactory,
    });
  });
});
