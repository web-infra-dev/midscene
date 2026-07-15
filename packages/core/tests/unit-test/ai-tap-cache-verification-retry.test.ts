import { Agent } from '@/agent';
import { CacheActionVerificationError } from '@/agent/cache-action-verifier';
import { describe, expect, it, vi } from 'vitest';

function createAgentWithMockActionCall() {
  const agent = Object.create(Agent.prototype) as Agent;
  agent.interface = {} as Agent['interface'];
  agent.callActionInActionSpace = vi.fn();
  return agent;
}

const verificationError = new CacheActionVerificationError(
  {
    status: 'failed',
    reason: 'the input did not gain focus',
    request: {
      actionName: 'Tap',
      targetDescription: 'search input',
      logicalModelRequestCount: 1,
      screenshotCount: 2,
      modelInputImageCount: 1,
      verificationMode: 'focused-comparison',
      dataDemand: {
        status: 'status demand',
        reason: 'reason demand',
      },
    },
  },
  ['search input'],
);

describe('aiTap cache verification retry', () => {
  it('retries a failed cached Tap once with locate cache disabled', async () => {
    const agent = createAgentWithMockActionCall();
    vi.mocked(agent.callActionInActionSpace)
      .mockRejectedValueOnce(verificationError)
      .mockResolvedValueOnce(undefined);

    await expect(agent.aiTap('search input')).resolves.toBeUndefined();

    expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(2);
    expect(agent.callActionInActionSpace).toHaveBeenNthCalledWith(
      2,
      'Tap',
      {
        locate: expect.objectContaining({
          prompt: 'search input',
        }),
      },
      { bypassLocateCache: true },
    );
  });

  it('does not retry inside cached-plan playback', async () => {
    const agent = createAgentWithMockActionCall();
    vi.mocked(agent.callActionInActionSpace).mockRejectedValue(
      verificationError,
    );
    const aiTapWithInternalOptions = agent.aiTap as (
      prompt: string,
      options: undefined,
      internalOptions: { verifyCachedActions: true },
    ) => Promise<void>;

    await expect(
      aiTapWithInternalOptions.call(agent, 'search input', undefined, {
        verifyCachedActions: true,
      }),
    ).rejects.toBe(verificationError);

    expect(agent.callActionInActionSpace).toHaveBeenCalledOnce();
  });
});
