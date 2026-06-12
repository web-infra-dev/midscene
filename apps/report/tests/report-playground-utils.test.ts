import { beforeEach, describe, expect, it, vi } from 'vitest';

const { playgroundSDKMock } = vi.hoisted(() => ({
  playgroundSDKMock: vi.fn(),
}));

vi.mock('@midscene/playground', () => ({
  PlaygroundSDK: playgroundSDKMock,
}));

import { getReportPlaygroundSDK } from '../src/utils/report-playground-utils';

describe('getReportPlaygroundSDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const agentFactory = vi.fn();

    getReportPlaygroundSDK('In-Browser', undefined, agentFactory);

    expect(playgroundSDKMock).toHaveBeenCalledWith({
      type: 'local-execution',
      agentFactory,
    });
  });
});
