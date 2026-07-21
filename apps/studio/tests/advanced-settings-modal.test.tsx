// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedSettingsModal } from '../src/renderer/components/ShellLayout/AdvancedSettingsModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AdvancedSettingsModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not narrow the Core option ranges in the UI', async () => {
    await act(async () => {
      root.render(
        <AdvancedSettingsModal
          onApply={vi.fn()}
          onClose={vi.fn()}
          open
          runtimeReady
          settings={{ schemaVersion: 1, agentOptions: {} }}
        />,
      );
    });

    const inputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    );
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toMatchObject({ min: '0', max: '', step: '1' });
    expect(inputs[1]).toMatchObject({ min: '0', max: '', step: 'any' });
    expect(inputs[2]).toMatchObject({ min: '1', max: '', step: 'any' });
    expect(container.querySelector('textarea')?.maxLength).toBe(-1);
  });

  it('applies values beyond the former Studio-only limits', async () => {
    const onApply = vi.fn(async () => undefined);
    await act(async () => {
      root.render(
        <AdvancedSettingsModal
          onApply={onApply}
          onClose={vi.fn()}
          open
          runtimeReady={false}
          settings={{ schemaVersion: 1, agentOptions: {} }}
        />,
      );
    });

    const inputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    );
    await act(async () => {
      const setValue = (input: HTMLInputElement, value: string) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue(inputs[0], '1000');
      setValue(inputs[1], '60000.5');
      setValue(inputs[2], '24');
    });

    const applyButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Apply',
    );
    await act(async () => applyButton?.click());

    expect(onApply).toHaveBeenCalledWith({
      schemaVersion: 1,
      agentOptions: {
        replanningCycleLimit: 1000,
        waitAfterAction: 60000.5,
        screenshotShrinkFactor: 24,
      },
    });
  });
});
