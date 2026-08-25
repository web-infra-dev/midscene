import { defineActionInput } from '@/device';
import { describe, expect, it, rs } from '@rstest/core';

describe('Input action with mode option', () => {
  const mockContext = {} as any;

  const createInputAction = (
    clearInputMock: ReturnType<typeof rs.fn>,
    typeTextMock: ReturnType<typeof rs.fn>,
  ) =>
    defineActionInput({
      clearInput: async (target) => {
        clearInputMock(target);
      },
      typeText: async (value, opts) => {
        typeTextMock(value, opts);
      },
      keyboardPress: async () => {},
    });

  it('should request replace when mode is replace', async () => {
    const clearInputMock = rs.fn();
    const typeTextMock = rs.fn();

    const inputAction = createInputAction(clearInputMock, typeTextMock);

    // Test with mode = 'replace'
    await inputAction.call(
      {
        value: 'test value',
        locate: { id: 'test-id' } as any,
        mode: 'replace',
      },
      mockContext,
    );

    expect(clearInputMock).not.toHaveBeenCalled();
    expect(typeTextMock).toHaveBeenCalledWith(
      'test value',
      expect.objectContaining({ replace: true }),
    );
  });

  it('should only clear input when mode is clear', async () => {
    const clearInputMock = rs.fn();
    const typeTextMock = rs.fn();

    const inputAction = createInputAction(clearInputMock, typeTextMock);

    // Test with mode = 'clear' (clears without typing)
    await inputAction.call(
      {
        value: 'test value',
        locate: { id: 'test-id' } as any,
        mode: 'clear',
      },
      mockContext,
    );

    expect(clearInputMock).toHaveBeenCalledTimes(1);
    expect(typeTextMock).not.toHaveBeenCalled();
  });

  it('should skip clearInput when mode is typeOnly', async () => {
    const clearInputMock = rs.fn();
    const typeTextMock = rs.fn();

    const inputAction = createInputAction(clearInputMock, typeTextMock);

    // Test with mode = 'typeOnly'
    await inputAction.call(
      {
        value: 'typed text',
        locate: { id: 'test-id' } as any,
        mode: 'typeOnly',
      },
      mockContext,
    );

    expect(clearInputMock).not.toHaveBeenCalled();
    expect(typeTextMock).toHaveBeenCalledWith(
      'typed text',
      expect.objectContaining({ replace: false }),
    );
  });

  it('should request replace by default when mode is not specified', async () => {
    const clearInputMock = rs.fn();
    const typeTextMock = rs.fn();

    const inputAction = createInputAction(clearInputMock, typeTextMock);

    // Test without mode option (should default to replace behavior)
    await inputAction.call(
      {
        value: 'test value',
        locate: { id: 'test-id' } as any,
      },
      mockContext,
    );

    expect(clearInputMock).not.toHaveBeenCalled();
    expect(typeTextMock).toHaveBeenCalledWith(
      'test value',
      expect.objectContaining({ replace: true }),
    );
  });

  it('should validate the mode option is in the schema', () => {
    const inputAction = defineActionInput({
      clearInput: async () => {},
      typeText: async () => {},
      keyboardPress: async () => {},
    });

    // Check that the schema includes the mode field
    const schema = inputAction.paramSchema;
    expect(schema).toBeDefined();

    if (!schema) {
      throw new Error('Schema is undefined');
    }

    // Parse the schema to check if mode field exists
    const result = schema.safeParse({
      value: 'test',
      mode: 'typeOnly',
    });

    expect(result.success).toBe(true);
  });
});
