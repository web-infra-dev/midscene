import { defineActionInput } from '@/device';
import { describe, expect, it, vi } from 'vitest';

describe('Input action with mode option', () => {
  const mockContext = {} as any;

  const createInputAction = (
    clearInputMock: ReturnType<typeof vi.fn>,
    typeTextMock: ReturnType<typeof vi.fn>,
  ) =>
    defineActionInput(async (param) => {
      if (param.locate && param.mode !== 'append') {
        clearInputMock();
      }

      if (param.mode === 'clear') {
        return;
      }

      if (!param || !param.value) {
        return;
      }

      typeTextMock(param.value);
    });

  it('should clear input when mode is replace', async () => {
    const clearInputMock = vi.fn();
    const typeTextMock = vi.fn();

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

    expect(clearInputMock).toHaveBeenCalledTimes(1);
    expect(typeTextMock).toHaveBeenCalledWith('test value');
  });

  it('should only clear input when mode is clear', async () => {
    const clearInputMock = vi.fn();
    const typeTextMock = vi.fn();

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

  it('should skip clearInput when mode is append', async () => {
    const clearInputMock = vi.fn();
    const typeTextMock = vi.fn();

    const inputAction = createInputAction(clearInputMock, typeTextMock);

    // Test with mode = 'append'
    await inputAction.call(
      {
        value: ' appended text',
        locate: { id: 'test-id' } as any,
        mode: 'append',
      },
      mockContext,
    );

    expect(clearInputMock).not.toHaveBeenCalled();
    expect(typeTextMock).toHaveBeenCalledWith(' appended text');
  });

  it('should clear input by default when mode is not specified (defaults to replace)', async () => {
    const clearInputMock = vi.fn();
    const typeTextMock = vi.fn();

    const inputAction = createInputAction(clearInputMock, typeTextMock);

    // Test without mode option (should default to replace behavior)
    await inputAction.call(
      {
        value: 'test value',
        locate: { id: 'test-id' } as any,
      },
      mockContext,
    );

    expect(clearInputMock).toHaveBeenCalledTimes(1);
    expect(typeTextMock).toHaveBeenCalledWith('test value');
  });

  it('should validate the mode option is in the schema', () => {
    const inputAction = defineActionInput(async () => {});

    // Check that the schema includes the mode field
    const schema = inputAction.paramSchema;
    expect(schema).toBeDefined();

    if (!schema) {
      throw new Error('Schema is undefined');
    }

    // Parse the schema to check if mode field exists
    const result = schema.safeParse({
      value: 'test',
      mode: 'append',
    });

    expect(result.success).toBe(true);
  });
});
