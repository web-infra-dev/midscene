import { Agent } from '@/agent';
import { parseActionParam } from '@/ai-model';
import {
  actionKeyboardPressParamSchema,
  defineActionKeyboardPress,
} from '@/device';
import { ModelConfigManager } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).callActionInActionSpace = vi.fn(async () => undefined);
  return agent;
};

describe('KeyboardPress Action', () => {
  it('allows the action target to be omitted', () => {
    const parsed = parseActionParam(
      { keyName: 'Control+X' },
      actionKeyboardPressParamSchema,
    );

    expect(parsed).toEqual({ keyName: 'Control+X' });
  });

  it('passes an undefined target to the keyboard primitive', async () => {
    const keyboardPress = vi.fn(async () => undefined);
    const action = defineActionKeyboardPress(keyboardPress);

    await action.call({ keyName: 'Control+X' });

    expect(keyboardPress).toHaveBeenCalledWith('Control+X', {
      target: undefined,
    });
  });

  it('supports the recommended signature without a locate prompt', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof vi.fn
    >;

    await agent.aiKeyboardPress(undefined, { keyName: 'Control+X' });

    expect(callActionSpy).toHaveBeenCalledWith('KeyboardPress', {
      keyName: 'Control+X',
      locate: undefined,
    });
  });

  it('validates model configuration before a targetless keyboard action', async () => {
    const agent = Object.create(Agent.prototype) as Agent<any>;
    (agent as any).modelConfigManager = new ModelConfigManager({});

    await expect(
      agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Control+X',
      }),
    ).rejects.toThrow(
      'Model configuration is incomplete: model name (MIDSCENE_MODEL_NAME) is required',
    );
  });

  it('resolves both model runtimes before executing a targetless action', async () => {
    const agent = Object.create(Agent.prototype) as Agent<any>;
    const defaultModel = { intent: 'default' };
    const planningModel = { intent: 'planning' };
    const resolveModelRuntime = vi.fn((intent: string) =>
      intent === 'default' ? defaultModel : planningModel,
    );
    const runPlans = vi.fn(async () => ({ output: 'done' }));
    (agent as any).resolveModelRuntime = resolveModelRuntime;
    (agent as any).taskExecutor = { runPlans };

    await expect(
      agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Control+X',
      }),
    ).resolves.toBe('done');

    expect(resolveModelRuntime.mock.calls).toEqual([['default'], ['planning']]);
    expect(runPlans).toHaveBeenCalledWith(
      expect.any(String),
      [
        {
          type: 'KeyboardPress',
          param: { keyName: 'Control+X' },
          thought: '',
        },
      ],
      planningModel,
      defaultModel,
    );
  });

  it('keeps the legacy key-only signature working', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof vi.fn
    >;

    await agent.aiKeyboardPress('Control+X');

    expect(callActionSpy).toHaveBeenCalledWith('KeyboardPress', {
      keyName: 'Control+X',
      locate: undefined,
    });
  });

  it('still builds a locate parameter when a target is provided', async () => {
    const agent = createAgentStub();
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof vi.fn
    >;

    await agent.aiKeyboardPress('the search input', {
      keyName: 'Enter',
      xpath: '//input[@type="search"]',
    });

    expect(callActionSpy).toHaveBeenCalledWith('KeyboardPress', {
      keyName: 'Enter',
      locate: expect.objectContaining({
        prompt: 'the search input',
        xpath: '//input[@type="search"]',
      }),
    });
  });
});
