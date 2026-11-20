import { Agent } from '@/agent';
import { ScriptPlayer } from '@/yaml/player';
import { compileLegacyFlowItem } from '@/yaml/test-runner-compat';
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
  it.each(['Results', { prompt: 'Results', images: referenceImages }])(
    'preserves a fallback scroll prompt with image options: %j',
    async (prompt) => {
      const step = compileLegacyFlowItem({
        aiScroll: null,
        prompt,
        ...(typeof prompt === 'string' && { images: referenceImages }),
        convertHttpImage2Base64: false,
        direction: 'down',
      } as any);
      const input = step.input as any;
      const agent = createAgentStub();
      await agent.aiScroll(input.prompt, input.options);
      expect((agent as any).callActionInActionSpace).toHaveBeenCalledWith(
        'Scroll',
        {
          direction: 'down',
          locate: {
            ...expectedLocateParam,
            prompt: {
              prompt: 'Results',
              images: referenceImages,
              convertHttpImage2Base64: false,
            },
          },
        },
      );
    },
  );

  it.each([
    { images: referenceImages },
    { convertHttpImage2Base64: false },
    { images: undefined, convertHttpImage2Base64: undefined },
  ])(
    'ignores image options for targetless YAML actions: %j',
    async (options) => {
      const scroll = compileLegacyFlowItem({
        aiScroll: null,
        direction: 'down',
        ...options,
      } as any);
      expect(scroll.input).toStrictEqual({
        prompt: undefined,
        options: { direction: 'down' },
      });
      const agent = createAgentStub();
      const input = scroll.input as any;
      await agent.aiScroll(input.prompt, input.options);
      expect((agent as any).callActionInActionSpace).toHaveBeenCalledWith(
        'Scroll',
        { direction: 'down', locate: undefined },
      );

      const pinch = compileLegacyFlowItem(
        { aiPinch: { direction: 'in', ...options } } as any,
        [{ name: 'Pinch', interfaceAlias: 'aiPinch' }],
      );
      expect(pinch.input).toStrictEqual({
        name: 'Pinch',
        params: { direction: 'in', locate: undefined },
      });
    },
  );

  it.each([
    {
      aiTap: null,
      locate: { prompt: { prompt: 'submit', images: referenceImages } },
    },
    {
      aiTap: {
        locate: { prompt: { prompt: 'submit', images: referenceImages } },
      },
    },
  ])(
    'rejects a second prompt object inside legacy aiTap locate: %j',
    (flow) => {
      const step = compileLegacyFlowItem(flow as any);
      expect(step.node).toBe('legacyValidationError');
      expect(step.input.message).toContain('locate.prompt must be a string');
    },
  );

  it.each([{ images: referenceImages }, { convertHttpImage2Base64: false }])(
    'rejects duplicate image fields across YAML layers: %j',
    (fields) => {
      const inputs = [
        { aiTap: { prompt: 'submit', ...fields }, ...fields },
        { aiTap: null, locate: { prompt: 'submit', ...fields }, ...fields },
        { aiTap: { locate: { prompt: 'submit', ...fields } }, ...fields },
        { aiLocate: { prompt: 'submit', ...fields }, ...fields },
        {
          aiScroll: { prompt: 'submit', ...fields },
          direction: 'down',
          ...fields,
        },
        { aiHover: { prompt: { prompt: 'submit', ...fields }, ...fields } },
      ];
      for (const input of inputs) {
        const step = compileLegacyFlowItem(input as any, [
          { name: 'Hover', interfaceAlias: 'aiHover' },
        ]);
        expect(step.node).toBe('legacyValidationError');
        expect(step.input.message).toContain('Duplicate');
      }
    },
  );

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
