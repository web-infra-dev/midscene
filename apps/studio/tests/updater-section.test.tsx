// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpdaterSection from '../src/renderer/components/SettingsPanel/UpdaterSection';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderUpdaterSection(
  props: Parameters<typeof UpdaterSection>[0],
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(UpdaterSection, props));
  });

  return { container, root };
}

async function unmount(root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount();
  });
}

describe('UpdaterSection', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('renders update availability as an inline Version row action', async () => {
    const onDownload = vi.fn();
    const { container, root } = await renderUpdaterSection({
      appVersion: '1.8.0',
      onDownload,
      onInstall: vi.fn(),
      status: { state: 'available', version: '1.8.1' },
    });

    expect(container.textContent).toContain('Version');
    expect(container.textContent).toContain('v1.8.0');
    expect(container.textContent).toContain('update');
    expect(container.textContent).not.toContain('Update available');
    expect(container.textContent).not.toContain('Download update');
    expect(container.textContent).not.toContain('Check for updates');

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('update');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDownload).toHaveBeenCalledTimes(1);

    await unmount(root);
  });

  it('opens the release page for external-only update targets', async () => {
    const onDownload = vi.fn();
    const onOpenDownloadPage = vi.fn();
    const { container, root } = await renderUpdaterSection({
      appVersion: '1.8.0',
      onDownload,
      onInstall: vi.fn(),
      onOpenDownloadPage,
      status: {
        externalDownloadOnly: true,
        state: 'available',
        version: '1.8.1',
      },
    });

    const button = container.querySelector('button');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpenDownloadPage).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();

    await unmount(root);
  });

  it('keeps the install action available after download completes', async () => {
    const onInstall = vi.fn();
    const { container, root } = await renderUpdaterSection({
      appVersion: '1.8.0',
      onDownload: vi.fn(),
      onInstall,
      status: { state: 'downloaded', version: '1.8.1' },
    });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('restart');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onInstall).toHaveBeenCalledTimes(1);

    await unmount(root);
  });
});
