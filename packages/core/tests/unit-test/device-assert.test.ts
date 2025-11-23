import { createAssertAction, defineActionAssert } from '@/device/index';
import { describe, expect, it } from 'vitest';

describe('Assert Action', () => {
  it('should pass silently when result=true', async () => {
    const assertAction = createAssertAction();

    // Should not throw an error
    await expect(
      assertAction.call(
        { thought: 'This should pass', result: true },
        {} as any,
      ),
    ).resolves.not.toThrow();
  });

  it('should throw error when result=false', async () => {
    const assertAction = createAssertAction();
    const errorMessage = 'This assertion should fail';

    // Should throw an error with the thought as the message
    await expect(
      assertAction.call({ thought: errorMessage, result: false }, {} as any),
    ).rejects.toThrow(errorMessage);
  });

  it('should have correct schema definition', () => {
    const assertAction = createAssertAction();

    expect(assertAction.name).toBe('Assert');
    expect(assertAction.description).toContain('assertion');
    expect(assertAction.interfaceAlias).toBe('aiAssert');
    expect(assertAction.paramSchema).toBeDefined();
  });

  it('should allow custom implementation with defineActionAssert', async () => {
    let customCallExecuted = false;

    const customAssertAction = defineActionAssert(async (param) => {
      customCallExecuted = true;
      if (!param.result) {
        throw new Error(`Custom error: ${param.thought}`);
      }
    });

    // Test custom implementation
    await customAssertAction.call({ thought: 'Test', result: true }, {} as any);
    expect(customCallExecuted).toBe(true);

    // Test error throwing
    await expect(
      customAssertAction.call(
        { thought: 'Failed test', result: false },
        {} as any,
      ),
    ).rejects.toThrow('Custom error: Failed test');
  });
});
