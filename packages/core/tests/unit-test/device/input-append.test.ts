import { defineActionInput } from '@/device';
import { describe, expect, it, vi } from 'vitest';

describe('Input action with append option', () => {
  it('should skip clearInput when append is true', async () => {
    const clearInputMock = vi.fn();
    const typeTextMock = vi.fn();

    const inputAction = defineActionInput(async (param) => {
      // Simulate the logic from web-page.ts
      if (param.locate) {
        // Only clear input if not appending
        if (!param.append) {
          clearInputMock();
        }

        if (!param || !param.value) {
          return;
        }
      }

      typeTextMock(param.value);
    });

    // Test with append = false (default behavior)
    await inputAction.call({
      value: 'test value',
      locate: { id: 'test-id' } as any,
      append: false,
    });

    expect(clearInputMock).toHaveBeenCalledTimes(1);
    expect(typeTextMock).toHaveBeenCalledWith('test value');

    // Reset mocks
    clearInputMock.mockClear();
    typeTextMock.mockClear();

    // Test with append = true (new behavior)
    await inputAction.call({
      value: ' appended text',
      locate: { id: 'test-id' } as any,
      append: true,
    });

    expect(clearInputMock).not.toHaveBeenCalled();
    expect(typeTextMock).toHaveBeenCalledWith(' appended text');
  });

  it('should clear input by default when append is not specified', async () => {
    const clearInputMock = vi.fn();
    const typeTextMock = vi.fn();

    const inputAction = defineActionInput(async (param) => {
      if (param.locate) {
        if (!param.append) {
          clearInputMock();
        }

        if (!param || !param.value) {
          return;
        }
      }

      typeTextMock(param.value);
    });

    // Test without append option (should default to clearing)
    await inputAction.call({
      value: 'test value',
      locate: { id: 'test-id' } as any,
    });

    expect(clearInputMock).toHaveBeenCalledTimes(1);
    expect(typeTextMock).toHaveBeenCalledWith('test value');
  });

  it('should validate the append option is in the schema', () => {
    const inputAction = defineActionInput(async () => {});

    // Check that the schema includes the append field
    const schemaShape = inputAction.paramSchema?.shape;
    expect(schemaShape).toBeDefined();
    expect(schemaShape?.append).toBeDefined();
  });
});
