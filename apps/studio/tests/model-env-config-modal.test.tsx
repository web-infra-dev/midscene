// @vitest-environment jsdom
import { type ComponentProps, act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelEnvConfigModal } from '../src/renderer/components/ShellLayout/ModelEnvConfigModal';
import type { ConnectivityTestResult } from '../src/shared/electron-contract';

const VALID_ENV_TEXT = [
  'OPENAI_API_KEY=sk-example',
  'OPENAI_BASE_URL=https://api.example.com/v1',
  'MIDSCENE_MODEL=gpt-4o',
].join('\n');

const PASSED_CONNECTIVITY_RESULT: ConnectivityTestResult = { passed: true };

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderModal(
  props: Partial<ComponentProps<typeof ModelEnvConfigModal>> = {},
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(ModelEnvConfigModal, {
        onClose: () => undefined,
        onSave: () => undefined,
        open: true,
        textValue: VALID_ENV_TEXT,
        ...props,
      }),
    );
  });
  return { root };
}

function button(label: string) {
  const result = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label,
  );
  expect(result).toBeTruthy();
  return result as HTMLButtonElement;
}

function setInput(label: string, value: string) {
  const input = document.body.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
}

function setTextarea(value: string) {
  const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea');
  expect(textarea).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  setter?.call(textarea, value);
  textarea?.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ModelEnvConfigModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('uses the shared Ant Design config modal with all three options', async () => {
    const { root } = await renderModal();

    expect(document.body.textContent).toContain('Config');
    expect(document.body.textContent).toContain('Model Env Config');
    expect(document.body.textContent).toContain('Agent Option Config');
    expect(document.body.textContent).toContain('Replanning Cycle Limit');
    expect(document.body.textContent).toContain('Wait After Action (ms)');
    expect(document.body.textContent).toContain('Screenshot Shrink Factor');
    const verifyButton = button('Verify Model');
    expect(
      verifyButton.querySelector(
        'path[d="M5 8.00002V3.95856L8.5 5.97929L12 8.00002L8.5 10.0208L5 12.0415V8.00002Z"]',
      ),
    ).toBeTruthy();
    expect(verifyButton.style.minWidth).toBe('');
    expect(
      verifyButton.classList.contains('midscene-config-modal-verify-button'),
    ).toBe(true);

    await act(async () => root.unmount());
  });

  it('verifies without saving, then saves only after the Save button is clicked', async () => {
    const onSave = vi.fn();
    const runConnectivityTest = vi
      .fn()
      .mockResolvedValue(PASSED_CONNECTIVITY_RESULT);
    vi.stubGlobal('studioRuntime', { runConnectivityTest });
    const { root } = await renderModal({ onSave });

    await act(async () => {
      button('Verify Model').click();
      await Promise.resolve();
    });

    expect(runConnectivityTest).toHaveBeenCalledWith({
      MIDSCENE_MODEL: 'gpt-4o',
      OPENAI_API_KEY: 'sk-example',
      OPENAI_BASE_URL: 'https://api.example.com/v1',
    });
    expect(document.body.textContent).toContain('Test passed.');
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      button('Save').click();
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith({
      agentOptions: {},
      text: VALID_ENV_TEXT,
    });

    await act(async () => root.unmount());
  });

  it('dismisses successful verification feedback without saving', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest: vi
        .fn()
        .mockResolvedValue(PASSED_CONNECTIVITY_RESULT),
    });
    const { root } = await renderModal({ onSave });

    await act(async () => {
      button('Verify Model').click();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('Test passed.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    expect(document.body.textContent).not.toContain('Test passed.');
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it('rejects invalid model configuration before verification', async () => {
    const runConnectivityTest = vi.fn();
    vi.stubGlobal('studioRuntime', { runConnectivityTest });
    const { root } = await renderModal({
      textValue: 'MIDSCENE_MODEL_FAMILY=invalid',
    });

    expect(document.body.textContent).toContain('Missing required keys:');
    expect(button('Verify Model').disabled).toBe(true);
    expect(runConnectivityTest).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('ignores an in-flight verification after the model config changes', async () => {
    let resolveVerification:
      | ((result: ConnectivityTestResult) => void)
      | undefined;
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest: vi.fn(
        () =>
          new Promise<ConnectivityTestResult>((resolve) => {
            resolveVerification = resolve;
          }),
      ),
    });
    const { root } = await renderModal();

    await act(async () => {
      button('Verify Model').click();
    });
    await act(async () => {
      setTextarea(`${VALID_ENV_TEXT}\nMIDSCENE_DEBUG=true`);
    });
    await act(async () => {
      resolveVerification?.(PASSED_CONNECTIVITY_RESULT);
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain('Test passed.');
    await act(async () => root.unmount());
  });

  it('shows the connectivity failure returned by Studio', async () => {
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest: vi.fn().mockResolvedValue({
        passed: false,
        message: 'Network down',
      } satisfies ConnectivityTestResult),
    });
    const { root } = await renderModal();

    await act(async () => {
      button('Verify Model').click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Network down');
    await act(async () => root.unmount());
  });

  it('discards unsaved edits when reopened', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const props = {
      onClose: () => undefined,
      onSave: () => undefined,
      textValue: VALID_ENV_TEXT,
    };

    await act(async () => {
      root.render(createElement(ModelEnvConfigModal, { ...props, open: true }));
    });
    await act(async () => {
      setTextarea(`${VALID_ENV_TEXT}\nMIDSCENE_DEBUG=true`);
    });
    await act(async () => {
      root.render(
        createElement(ModelEnvConfigModal, { ...props, open: false }),
      );
    });
    await act(async () => {
      root.render(createElement(ModelEnvConfigModal, { ...props, open: true }));
    });

    expect(document.body.querySelector('textarea')?.value).toBe(VALID_ENV_TEXT);
    await act(async () => root.unmount());
  });

  it('saves the configured Agent options', async () => {
    const onSave = vi.fn();
    const { root } = await renderModal({ onSave });

    await act(async () => {
      setInput('Replanning Cycle Limit', '12');
      setInput('Wait After Action (ms)', '500');
      setInput('Screenshot Shrink Factor', '2');
    });
    await act(async () => {
      button('Save').click();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({
      agentOptions: {
        replanningCycleLimit: 12,
        screenshotShrinkFactor: 2,
        waitAfterAction: 500,
      },
      text: VALID_ENV_TEXT,
    });

    await act(async () => root.unmount());
  });

  it('keeps the dialog open and shows save errors', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Runtime sync failed'));
    const { root } = await renderModal({ onSave });

    await act(async () => {
      button('Save').click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Runtime sync failed');
    expect(button('Save').disabled).toBe(false);

    await act(async () => root.unmount());
  });
});
