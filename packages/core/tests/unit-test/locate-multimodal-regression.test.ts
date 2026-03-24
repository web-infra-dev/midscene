import { Agent } from '@/agent';
import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, it, vi } from 'vitest';

const referenceImages = [
  {
    name: 'target image',
    url: 'https://example.com/image.png',
  },
];

const expectedLocateParam = {
  cacheable: true,
  deepLocate: false,
  prompt: {
    prompt: 'Click the icon',
    images: referenceImages,
    convertHttpImage2Base64: true,
  },
  xpath: undefined,
};

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).callActionInActionSpace = vi.fn(async () => undefined);
  return agent;
};

describe('multimodal locate prompt regression', () => {
  it('should preserve multimodal locate options when Agent.aiTap receives a string prompt', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof vi.fn
    >;

    await agent.aiTap('Click the icon', {
      images: referenceImages,
      convertHttpImage2Base64: true,
    } as any);

    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith('Tap', {
      locate: expectedLocateParam,
    });
  });

  it('should preserve multimodal locate options through ScriptPlayer aiTap execution', async () => {
    const flowItem = {
      aiTap: {
        locate: {
          prompt: 'Click the icon',
          images: referenceImages,
          convertHttpImage2Base64: true,
        },
      },
    };
    const player = new ScriptPlayer(
      {
        tasks: [{ name: 'test', flow: [flowItem] }],
      } as any,
      async () => ({ agent: {} as any, freeFn: [] }),
      undefined,
    );
    const agent = createAgentStub();
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof vi.fn
    >;

    await player.playTask(
      {
        name: 'test',
        flow: [flowItem],
        index: 0,
        status: 'running',
        totalSteps: 1,
      } as any,
      agent,
    );

    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith('Tap', {
      locate: expectedLocateParam,
    });
  });
});
