import { Agent } from '@/agent';
import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, it, rs } from '@rstest/core';
import { installAgentReportManager } from './test-helpers/agent-report-manager';

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
  installAgentReportManager(agent);
  (agent as any).opts = {};
  (agent as any).callActionInActionSpace = rs.fn(async () => undefined);
  return agent;
};

describe('multimodal locate prompt regression', () => {
  it.each([
    { images: referenceImages },
    { convertHttpImage2Base64: false },
    { images: undefined },
  ])('rejects image fields in SDK locate options: %j', async (options) => {
    const agent = createAgentStub();

    await expect(agent.aiTap('Click the icon', options as any)).rejects.toThrow(
      'Pass them in the locate prompt argument',
    );
    await expect(
      agent.aiHover('Click the icon', options as any),
    ).rejects.toThrow('Pass them in the locate prompt argument');
    await expect(
      agent.aiInput('Click the icon', { ...options, value: 'text' } as any),
    ).rejects.toThrow('Pass them in the locate prompt argument');
    expect((agent as any).callActionInActionSpace).not.toHaveBeenCalled();
  });

  it('preserves images in the first argument to Agent.aiTap', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof rs.fn
    >;

    await agent.aiTap({
      prompt: 'Click the icon',
      images: referenceImages,
      convertHttpImage2Base64: true,
    });

    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith('Tap', {
      locate: expectedLocateParam,
    });
  });

  it.each([
    {
      aiTap: {
        locate: {
          prompt: 'Click the icon',
          images: referenceImages,
          convertHttpImage2Base64: true,
        },
      },
    },
    {
      aiTap: null,
      locate: expectedLocateParam.prompt,
    },
    {
      aiTap: 'Click the icon',
      images: referenceImages,
      convertHttpImage2Base64: true,
    },
    { aiTap: expectedLocateParam.prompt },
  ])(
    'preserves YAML reference images through Tap execution: %j',
    async (flowItem) => {
      const player = new ScriptPlayer(
        {
          tasks: [{ name: 'test', flow: [flowItem] }],
        } as any,
        async () => ({ agent: {} as any, freeFn: [] }),
        undefined,
      );
      const agent = createAgentStub();
      const callActionSpy = (agent as any)
        .callActionInActionSpace as ReturnType<typeof rs.fn>;

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
    },
  );
});
