import { Agent } from '@/agent';
import { parseActionParam } from '@/ai-model';
import { actionClearInputParamSchema, defineActionClearInput } from '@/device';
import { describe, expect, it, vi } from 'vitest';

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).callActionInActionSpace = vi.fn(async () => undefined);
  return agent;
};

describe('ClearInput Action', () => {
  describe('defineActionClearInput', () => {
    it('should create an action with correct name and alias', () => {
      const callFn = vi.fn();
      const action = defineActionClearInput(callFn);

      expect(action.name).toBe('ClearInput');
      expect(action.interfaceAlias).toBe('aiClearInput');
      expect(action.paramSchema).toBeDefined();
      expect(action.sample).toEqual({
        locate: { prompt: 'the search input field' },
      });
    });
  });

  describe('actionClearInputParamSchema', () => {
    it('should accept locate with prompt', () => {
      const parsed = parseActionParam(
        { locate: { prompt: 'the search input field' } },
        actionClearInputParamSchema,
      );
      expect(parsed.locate).toEqual({ prompt: 'the search input field' });
    });

    it('should allow missing locate (optional)', () => {
      const parsed = parseActionParam({}, actionClearInputParamSchema);
      expect(parsed.locate).toBeUndefined();
    });
  });

  describe('Agent.aiClearInput', () => {
    it('dispatches the ClearInput action with locate prompt', async () => {
      const agent = createAgentStub();
      const callActionSpy = (agent as any)
        .callActionInActionSpace as ReturnType<typeof vi.fn>;

      await agent.aiClearInput('the search input field');

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ClearInput',
        expect.objectContaining({
          locate: expect.objectContaining({
            prompt: 'the search input field',
          }),
        }),
      );
    });

    it('forwards locate options such as deepLocate and xpath', async () => {
      const agent = createAgentStub();
      const callActionSpy = (agent as any)
        .callActionInActionSpace as ReturnType<typeof vi.fn>;

      await agent.aiClearInput('the search input field', {
        deepLocate: true,
        xpath: '//input[@id="q"]',
      });

      expect(callActionSpy).toHaveBeenCalledTimes(1);
      const [actionName, payload] = callActionSpy.mock.calls[0] as [
        string,
        any,
      ];
      expect(actionName).toBe('ClearInput');
      expect(payload.locate).toMatchObject({
        prompt: 'the search input field',
        deepLocate: true,
        xpath: '//input[@id="q"]',
      });
    });

    it('throws when locate prompt is missing', async () => {
      const agent = createAgentStub();
      await expect(agent.aiClearInput('' as any)).rejects.toThrow(
        /missing locate prompt/,
      );
    });
  });
});
