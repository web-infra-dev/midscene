import { Agent } from '@/agent';
import { describe, expect, it, vi } from 'vitest';

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).callActionInActionSpace = vi.fn(async () => undefined);
  return agent;
};

describe('Agent aiScroll legacy scrollType compatibility', () => {
  it('normalizes legacy scrollType values in legacy signature', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any)
      .callActionInActionSpace as ReturnType<typeof vi.fn>;

    await agent.aiScroll({ direction: 'down', scrollType: 'once' } as any);

    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith(
      'Scroll',
      expect.objectContaining({
        scrollType: 'singleAction',
      }),
    );
  });

  it('normalizes legacy scrollType values in new signature', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any)
      .callActionInActionSpace as ReturnType<typeof vi.fn>;

    await agent.aiScroll(
      'product list',
      {
        direction: 'up',
        scrollType: 'untilBottom' as any,
      } as any,
    );

    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith(
      'Scroll',
      expect.objectContaining({
        scrollType: 'scrollToBottom',
      }),
    );
  });
});
