import {
  buildLocateMessages,
  parseLocatePromptOrder,
} from '@/ai-model/model-adapter/locate-prompt-order';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { callGenerativeAI } from '@/ai-model/service-caller/index';
import {
  AiLocateElement,
  AiLocateSection,
} from '@/ai-model/workflows/grounding';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callGenerativeAI: rs.fn(),
}));

describe('locate prompt order', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
    retryCount: 0,
  };
  const adapter = new ResolvedModelAdapter(
    {
      locate: {
        promptOrder:
          'system(instructions):userEach(task:screenshot:references)',
      },
    },
    'test-prompt-first-locate',
  );
  const modelRuntime = {
    config: modelConfig,
    adapter,
  };

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(callGenerativeAI).mockResolvedValue({
      content: '{"bbox":[100,200,300,400]}',
      isStreamed: false,
    });
  });

  it('places the prompt before the image for element locate', async () => {
    await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'the Submit button',
      modelRuntime,
    });

    expect(rs.mocked(callGenerativeAI).mock.calls[0][0]).toMatchObject([
      { role: 'system', content: expect.any(String) },
      { role: 'user', content: expect.any(String) },
      { role: 'user', content: [{ type: 'image' }] },
    ]);
  });

  it('places the prompt before the image for search-area locate', async () => {
    await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'the row containing Apollo',
      modelRuntime,
    });

    expect(rs.mocked(callGenerativeAI).mock.calls[0][0]).toMatchObject([
      { role: 'system', content: expect.any(String) },
      { role: 'user', content: expect.any(String) },
      { role: 'user', content: [{ type: 'image' }] },
    ]);
  });
});

describe('locate message assembly', () => {
  const input = {
    instructions: 'rules',
    screenshot: 'screen',
    task: 'target',
    references: [],
  };
  const screenshot = { type: 'image', url: 'screen' };
  const reference = { role: 'user', content: 'reference' } as const;
  it('keeps the default messages including trailing references', () => {
    expect(
      buildLocateMessages(parseLocatePromptOrder(), {
        ...input,
        references: [reference],
      }),
    ).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: [screenshot, { type: 'text', text: 'target' }] },
      reference,
    ]);
  });

  it('emits instructions and task as separate user messages and skips absent references', () => {
    for (const layout of [
      'userEach(screenshot:instructions:task:references)',
      'userEach(screenshot:instructions:references:task)',
    ]) {
      expect(
        buildLocateMessages(parseLocatePromptOrder(layout), input),
      ).toEqual([
        { role: 'user', content: [screenshot] },
        { role: 'user', content: 'rules' },
        { role: 'user', content: 'target' },
      ]);
    }
  });

  it('preserves reference message boundaries in the middle', () => {
    expect(
      buildLocateMessages(
        parseLocatePromptOrder(
          'userEach(screenshot:references:instructions:task)',
        ),
        { ...input, references: [reference] },
      ),
    ).toEqual([
      { role: 'user', content: [screenshot] },
      reference,
      { role: 'user', content: 'rules' },
      { role: 'user', content: 'target' },
    ]);
  });

  it('flattens reference blocks in place and preserves repeated group boundaries', () => {
    const referenceImage = { type: 'image', url: 'ref' } as const;
    expect(
      buildLocateMessages(
        parseLocatePromptOrder(
          'userTogether(screenshot):userTogether(instructions:references:task)',
        ),
        {
          ...input,
          references: [reference, { role: 'user', content: [referenceImage] }],
        },
      ),
    ).toEqual([
      { role: 'user', content: [screenshot] },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'rules' },
          { type: 'text', text: 'reference' },
          referenceImage,
          { type: 'text', text: 'target' },
        ],
      },
    ]);
  });

  it('skips a references-only group when empty', () => {
    expect(
      buildLocateMessages(
        parseLocatePromptOrder(
          'userEach(instructions):userTogether(references):userTogether(task:screenshot)',
        ),
        input,
      ),
    ).toEqual([
      { role: 'user', content: 'rules' },
      { role: 'user', content: [{ type: 'text', text: 'target' }, screenshot] },
    ]);
  });

  it('places the task in system and the screenshot and rules in user', () => {
    expect(
      buildLocateMessages(
        parseLocatePromptOrder(
          'system(task):userTogether(screenshot:instructions):userEach(references)',
        ),
        input,
      ),
    ).toEqual([
      { role: 'system', content: 'target' },
      { role: 'user', content: [screenshot, { type: 'text', text: 'rules' }] },
    ]);
  });

  it.each([
    ['instructions:task', 'rules\n\ntarget'],
    ['task:instructions', 'target\n\nrules'],
  ])('preserves text order within system(%s)', (parts, content) => {
    expect(
      buildLocateMessages(
        parseLocatePromptOrder(
          `system(${parts}):userEach(screenshot:references)`,
        ),
        input,
      ),
    ).toEqual([
      { role: 'system', content },
      { role: 'user', content: [screenshot] },
    ]);
  });

  it('preserves system group positions and boundaries', () => {
    expect(
      buildLocateMessages(
        parseLocatePromptOrder(
          'userEach(screenshot):system(task):userEach(references):system(instructions)',
        ),
        { ...input, references: [reference] },
      ),
    ).toEqual([
      { role: 'user', content: [screenshot] },
      { role: 'system', content: 'target' },
      reference,
      { role: 'system', content: 'rules' },
    ]);
  });

  it.each(['screenshot', 'references'])('rejects %s in system', (part) => {
    expect(() =>
      parseLocatePromptOrder(`system(${part}):userEach(instructions:task)`),
    ).toThrow(`system cannot contain image part "${part}"`);
  });

  it.each([
    'userEach(screenshot):userTogether(task:references:screenshot)',
    'system(task):userEach(instructions:task:screenshot:references)',
    'system(instructions):system(instructions):userEach(task:screenshot:references)',
    'system():userEach(instructions:task:screenshot:references)',
    'userEach():userTogether(instructions:task:references:screenshot)',
    'userEach(screenshot:task:references)',
    'userEach(instructions:task:references:task)',
    'userEach(instructions:screenshot:task:other)',
  ])('rejects invalid order %s', (order) => {
    expect(() => parseLocatePromptOrder(order)).toThrow(
      'Invalid locate promptOrder',
    );
  });
});
