// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelEnvConfigModal } from '../src/renderer/components/ShellLayout/ModelEnvConfigModal';

const VALID_ENV_TEXT = [
  'OPENAI_API_KEY=sk-example',
  'OPENAI_BASE_URL=https://api.example.com/v1',
  'MIDSCENE_MODEL=gpt-4o',
].join('\n');

const FORM_ENV_TEXT = [
  'OPENAI_API_KEY=sk-example',
  'OPENAI_BASE_URL=https://api.example.com/v1',
  'MIDSCENE_MODEL=gpt-4o',
  'MIDSCENE_USE_QWEN_VL=true',
].join('\n');

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderModal(textValue: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(ModelEnvConfigModal, {
        onClose: () => undefined,
        open: true,
        textValue,
      }),
    );
  });
  return { container, root };
}

function getConnectivityButton(container: HTMLElement) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) =>
      item.textContent?.includes('Connectivity test') ||
      item.textContent?.includes('Testing...'),
  );
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function getButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function setTextareaValue(container: HTMLElement, value: string) {
  const textarea = container.querySelector('textarea');
  expect(textarea).toBeTruthy();
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  expect(valueSetter).toBeTruthy();
  valueSetter?.call(textarea, value);
  textarea?.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
  );
}

async function unmountModal(root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount();
  });
}

describe('ModelEnvConfigModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('renders the text editor without soft wrapping', () => {
    const html = renderToStaticMarkup(
      createElement(ModelEnvConfigModal, {
        onClose: () => undefined,
        open: true,
        textValue: 'OPENAI_API_KEY=sk-example',
      }),
    );

    expect(html).toContain('wrap="off"');
  });

  it('matches the imported Env modal visual scale', () => {
    const html = renderToStaticMarkup(
      createElement(ModelEnvConfigModal, {
        onClose: () => undefined,
        open: true,
        textValue: 'OPENAI_API_KEY=sk-example',
      }),
    );

    expect(html).toContain('box-border flex h-[404px] w-[400px]');
    expect(html).toContain('text-[16px] font-semibold leading-[24px]');
    expect(html).toContain('rounded-[42px] bg-[#F2F4F7]');
    expect(html).toContain('border-[#EFEFEE] bg-white');
    expect(html).toContain('text-[12px] font-normal leading-[14.5px]');
    expect(html).toContain('bg-[#2B84FF]');
    expect(html).toContain('Text');
    expect(html).toContain('Form');
    expect(html).toContain('Connectivity test');
    expect(html).not.toContain('model-env-connectivity.svg');
    expect(html).toContain(
      'M5 8.00002V3.95856L8.5 5.97929L12 8.00002L8.5 10.0208L5 12.0415V8.00002Z',
    );
    expect(html).toContain('model-env-close.svg');
    expect(html).toContain('class="h-4 w-4"');
    expect(html).toContain(
      'flex h-[32px] w-[159px] items-center gap-[4px] rounded-[8px] border border-black/12 bg-white px-[12px]',
    );
    expect(html).toContain('text-black leading-[16px]');
    expect(html).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('enables connectivity test only when required model config is present', async () => {
    const emptyRender = await renderModal('');
    expect(getConnectivityButton(emptyRender.container).disabled).toBe(true);
    await unmountModal(emptyRender.root);

    const validRender = await renderModal(VALID_ENV_TEXT);
    expect(getConnectivityButton(validRender.container).disabled).toBe(false);
    await unmountModal(validRender.root);
  });

  it('starts spinning only while the connectivity test is running', async () => {
    const { container, root } = await renderModal(VALID_ENV_TEXT);
    const runConnectivityTest = vi.fn(
      () =>
        new Promise<{ ok: true; sample: string }>(() => {
          // Keep the request pending so the rendered state can be inspected.
        }),
    );
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest,
    });

    const button = getConnectivityButton(container);
    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('svg')?.getAttribute('class')).toBe(
      'h-4 w-4 shrink-0',
    );

    await act(async () => {
      button.click();
    });

    expect(runConnectivityTest).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Testing...');
    expect(button.querySelector('img')?.className).toContain('animate-spin');

    await unmountModal(root);
  });

  it('invalidates a running connectivity test when the config changes', async () => {
    const { container, root } = await renderModal(VALID_ENV_TEXT);
    let resolveConnectivityTest:
      | ((value: { ok: true; sample: string }) => void)
      | undefined;
    const runConnectivityTest = vi.fn(
      () =>
        new Promise<{ ok: true; sample: string }>((resolve) => {
          resolveConnectivityTest = resolve;
        }),
    );
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest,
    });

    await act(async () => {
      getConnectivityButton(container).click();
    });

    expect(getConnectivityButton(container).disabled).toBe(true);
    expect(getConnectivityButton(container).textContent).toContain(
      'Testing...',
    );

    await act(async () => {
      setTextareaValue(
        container,
        `${VALID_ENV_TEXT}\nMIDSCENE_USE_QWEN_VL=true`,
      );
      await Promise.resolve();
    });

    expect(runConnectivityTest).toHaveBeenCalledOnce();
    expect(getConnectivityButton(container).disabled).toBe(false);
    expect(getConnectivityButton(container).textContent).toContain(
      'Connectivity test',
    );

    await act(async () => {
      resolveConnectivityTest?.({ ok: true, sample: 'ok' });
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Test passed.');
    expect(container.textContent).not.toContain('Test failed.');

    await unmountModal(root);
  });

  it('shows failure status when connectivity test rejects', async () => {
    const { container, root } = await renderModal(VALID_ENV_TEXT);
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest: vi.fn().mockRejectedValue(new Error('Network down')),
    });

    await act(async () => {
      getConnectivityButton(container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Test failed. Please try again.');
    expect(getConnectivityButton(container).disabled).toBe(false);

    await unmountModal(root);
  });

  it('discards unsaved edits when the modal is reopened', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(ModelEnvConfigModal, {
          onClose: () => undefined,
          open: true,
          textValue: VALID_ENV_TEXT,
        }),
      );
    });

    await act(async () => {
      setTextareaValue(container, `${VALID_ENV_TEXT}\nMIDSCENE_DEBUG=true`);
      await Promise.resolve();
    });
    expect(container.querySelector('textarea')?.value).toContain(
      'MIDSCENE_DEBUG=true',
    );

    await act(async () => {
      root.render(
        createElement(ModelEnvConfigModal, {
          onClose: () => undefined,
          open: false,
          textValue: VALID_ENV_TEXT,
        }),
      );
    });
    await act(async () => {
      root.render(
        createElement(ModelEnvConfigModal, {
          onClose: () => undefined,
          open: true,
          textValue: VALID_ENV_TEXT,
        }),
      );
    });

    expect(container.querySelector('textarea')?.value).toBe(VALID_ENV_TEXT);

    await unmountModal(root);
  });

  it('restores default connectivity button style after a successful test', async () => {
    const { container, root } = await renderModal(VALID_ENV_TEXT);
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest: vi.fn().mockResolvedValue({
        ok: true,
        sample: 'ok',
      }),
    });

    await act(async () => {
      getConnectivityButton(container).click();
      await Promise.resolve();
    });

    const button = getConnectivityButton(container);
    expect(container.textContent).toContain('Test passed.');
    expect(container.innerHTML).toContain('bg-status-success-bg');
    expect(container.innerHTML).toContain('text-status-success-fg');
    expect(button.textContent).toContain('Connectivity test');
    expect(button.textContent).not.toContain('Test passed');
    expect(button.innerHTML).toContain('text-black leading-[16px]');
    expect(button.innerHTML).not.toContain('model-env-connectivity.svg');
    expect(button.innerHTML).toContain(
      'M5 8.00002V3.95856L8.5 5.97929L12 8.00002L8.5 10.0208L5 12.0415V8.00002Z',
    );
    expect(button.querySelector('svg')?.getAttribute('class')).toBe(
      'h-4 w-4 shrink-0',
    );

    await unmountModal(root);
  });

  it('does not run connectivity test before the user clicks test', async () => {
    const runConnectivityTest = vi.fn().mockResolvedValue({
      ok: true,
      sample: 'ok',
    });
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest,
    });
    const { container, root } = await renderModal(VALID_ENV_TEXT);

    await act(async () => {
      getButtonByText(container, 'Form').click();
      await Promise.resolve();
    });
    await act(async () => {
      getButtonByText(container, 'Text').click();
      await Promise.resolve();
    });
    await act(async () => {
      setTextareaValue(
        container,
        `${VALID_ENV_TEXT}\nMIDSCENE_USE_QWEN_VL=true`,
      );
      await Promise.resolve();
    });

    expect(runConnectivityTest).not.toHaveBeenCalled();

    await unmountModal(root);
  });

  it('matches the imported failure status visual scale', async () => {
    const { container, root } = await renderModal(VALID_ENV_TEXT);
    vi.stubGlobal('studioRuntime', {
      runConnectivityTest: vi.fn().mockResolvedValue({
        error: 'Network error',
        ok: false,
      }),
    });

    await act(async () => {
      getConnectivityButton(container).click();
      await Promise.resolve();
    });

    expect(container.innerHTML).toContain('h-[444px] w-[400px]');
    expect(container.innerHTML).toContain('bg-[#E13E37]/11');
    expect(container.innerHTML).toContain('text-[#E13E37]');
    expect(container.textContent).toContain('Test failed. Please try again.');
    expect(container.textContent).not.toMatch(/[\u4e00-\u9fff]/);
    expect(getConnectivityButton(container).textContent).toContain(
      'Connectivity test',
    );
    expect(getConnectivityButton(container).textContent).not.toContain(
      'Test failed',
    );
    expect(getConnectivityButton(container).innerHTML).toContain(
      'text-black leading-[16px]',
    );
    expect(getConnectivityButton(container).innerHTML).not.toContain(
      'model-env-connectivity.svg',
    );
    expect(getConnectivityButton(container).innerHTML).toContain(
      'M5 8.00002V3.95856L8.5 5.97929L12 8.00002L8.5 10.0208L5 12.0415V8.00002Z',
    );

    await unmountModal(root);
  });

  it('closes via Escape key while open', async () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(ModelEnvConfigModal, {
          onClose,
          open: true,
          textValue: VALID_ENV_TEXT,
        }),
      );
    });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await act(async () => {
      root.render(
        createElement(ModelEnvConfigModal, {
          onClose,
          open: false,
          textValue: VALID_ENV_TEXT,
        }),
      );
    });
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();

    await unmountModal(root);
  });

  it('matches the imported form tab visual scale', () => {
    const html = renderToStaticMarkup(
      createElement(ModelEnvConfigModal, {
        initialTab: 'form',
        onClose: () => undefined,
        open: true,
        textValue: FORM_ENV_TEXT,
      }),
    );

    expect(html).toContain('h-[563px] w-[400px]');
    expect(html).toContain('translate-y-[79.5px]');
    expect(html).toContain('flex flex-col gap-[24px]');
    expect(html).toContain('h-[61px]');
    expect(html).toContain('text-[14px] text-black/90');
    expect(html).toContain('h-[36px] px-[12px]');
    expect(html).toContain('mt-[20px]');
    expect(html).toContain('OPENAI_API_KEY');

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const formTab = Array.from(wrapper.querySelectorAll('button')).find(
      (button) => button.textContent === 'Form',
    );
    expect(formTab?.className).toContain('rounded-[40px]');
    expect(formTab?.className).not.toContain('rounded-[10px]');
  });
});
