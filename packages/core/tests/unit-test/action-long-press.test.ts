import { Agent } from '@/agent';
import { parseActionParam } from '@/ai-model';
import { ActionLongPressParamSchema, defineActionLongPress } from '@/device';
import { describe, expect, it, vi } from 'vitest';

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).callActionInActionSpace = vi.fn(async () => undefined);
  return agent;
};

describe('LongPress Action', () => {
  describe('defineActionLongPress', () => {
    it('should create an action with correct name and alias', () => {
      const callFn = vi.fn();
      const action = defineActionLongPress(callFn);

      expect(action.name).toBe('LongPress');
      expect(action.interfaceAlias).toBe('aiLongPress');
      expect(action.paramSchema).toBeDefined();
      expect(action.sample).toEqual({
        locate: { prompt: 'the message bubble' },
      });
    });
  });

  describe('ActionLongPressParamSchema', () => {
    it('should accept locate with prompt', () => {
      const parsed = parseActionParam(
        { locate: { prompt: 'the message bubble' } },
        ActionLongPressParamSchema,
      );
      expect(parsed.locate).toEqual({ prompt: 'the message bubble' });
    });

    it('should accept custom duration', () => {
      const parsed = parseActionParam(
        { locate: { prompt: 'the message bubble' }, duration: 2000 },
        ActionLongPressParamSchema,
      );
      expect(parsed.duration).toBe(2000);
    });

    it('should leave duration undefined when omitted so each device can apply its own default', () => {
      const parsed = parseActionParam(
        { locate: { prompt: 'the message bubble' } },
        ActionLongPressParamSchema,
      );
      expect(parsed.duration).toBeUndefined();
    });
  });

  describe('Agent.aiLongPress', () => {
    it('dispatches the LongPress action with locate prompt', async () => {
      const agent = createAgentStub();
      const callActionSpy = (agent as any)
        .callActionInActionSpace as ReturnType<typeof vi.fn>;

      await agent.aiLongPress('首页任意一篇文章');

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'LongPress',
        expect.objectContaining({
          locate: expect.objectContaining({ prompt: '首页任意一篇文章' }),
        }),
      );
    });

    it('forwards duration to the LongPress action', async () => {
      const agent = createAgentStub();
      const callActionSpy = (agent as any)
        .callActionInActionSpace as ReturnType<typeof vi.fn>;

      await agent.aiLongPress('首页任意一篇文章', { duration: 2000 });

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'LongPress',
        expect.objectContaining({
          duration: 2000,
          locate: expect.objectContaining({ prompt: '首页任意一篇文章' }),
        }),
      );
    });

    it('throws when locate prompt is missing', async () => {
      const agent = createAgentStub();
      await expect(agent.aiLongPress('' as any)).rejects.toThrow(
        /missing locate prompt/,
      );
    });
  });
});
