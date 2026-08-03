import { describe, expect, it, vi } from 'vitest';
import { createVisualActionRegistry } from '../../src/visual-action-registry';

describe('createVisualActionRegistry', () => {
  it('runs the completion hook once with the registered action name', async () => {
    const onActionSettled = vi.fn().mockResolvedValue(undefined);
    const actions = createVisualActionRegistry(
      {
        launch: async (uri: string) => `launched:${uri}`,
      },
      onActionSettled,
    );

    await expect(actions.launch('com.example.app')).resolves.toBe(
      'launched:com.example.app',
    );
    expect(onActionSettled).toHaveBeenCalledOnce();
    expect(onActionSettled).toHaveBeenCalledWith('launch');
  });

  it('settles a composite action only once', async () => {
    const dispatchStep = vi.fn().mockResolvedValue(undefined);
    const onActionSettled = vi.fn().mockResolvedValue(undefined);
    const actions = createVisualActionRegistry(
      {
        swipe: async (repeat: number) => {
          for (let index = 0; index < repeat; index++) {
            await dispatchStep();
          }
        },
      },
      onActionSettled,
    );

    await actions.swipe(3);

    expect(dispatchStep).toHaveBeenCalledTimes(3);
    expect(onActionSettled).toHaveBeenCalledOnce();
    expect(onActionSettled).toHaveBeenCalledWith('swipe');
  });

  it('settles an action that fails after dispatch begins', async () => {
    const actionError = new Error('second gesture failed');
    const dispatchStep = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(actionError);
    const onActionSettled = vi.fn().mockResolvedValue(undefined);
    const actions = createVisualActionRegistry(
      {
        swipe: async () => {
          await dispatchStep();
          await dispatchStep();
        },
      },
      onActionSettled,
    );

    await expect(actions.swipe()).rejects.toBe(actionError);
    expect(onActionSettled).toHaveBeenCalledOnce();
    expect(onActionSettled).toHaveBeenCalledWith('swipe');
  });
});
