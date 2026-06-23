// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playground: {
    phase: 'ready',
    controller: {
      actions: {
        destroySession: vi.fn(async () => undefined),
      },
      state: {
        form: {
          setFieldsValue: vi.fn(),
        },
        sessionViewState: {
          connected: false,
        },
      },
    },
  },
}));

vi.mock('../src/renderer/playground/useStudioPlayground', () => ({
  useStudioPlayground: () => mocks.playground,
}));

vi.mock('../src/renderer/assets', () => ({
  assetUrls: {
    sidebar: {
      collapse: 'sidebar-collapse.svg',
      expand: 'sidebar-expand.svg',
    },
  },
}));

vi.mock('../src/renderer/hooks/useStudioUpdater', () => ({
  useStudioUpdater: () => ({
    appVersion: '0.0.0-test',
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
    status: { state: 'idle' },
  }),
}));

vi.mock('../src/renderer/components/MainContent', () => ({
  default: ({
    onRightPanelModeChange,
    onSelectDeviceView,
  }: {
    onRightPanelModeChange: (mode: 'playground' | 'recorder') => void;
    onSelectDeviceView: () => void;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'main-content' },
      createElement(
        'button',
        {
          'data-testid': 'select-device-view',
          onClick: onSelectDeviceView,
          type: 'button',
        },
        'device',
      ),
      createElement(
        'button',
        {
          'data-testid': 'switch-recorder',
          onClick: () => onRightPanelModeChange('recorder'),
          type: 'button',
        },
        'recorder',
      ),
    ),
}));

vi.mock('../src/renderer/components/Playground', () => ({
  default: ({ rightPanelMode }: { rightPanelMode: string }) =>
    createElement('div', {
      'data-testid': `playground-${rightPanelMode}`,
    }),
}));

vi.mock('../src/renderer/components/Sidebar', () => ({
  default: () => createElement('div', { 'data-testid': 'sidebar' }),
  SidebarFooter: () =>
    createElement('div', { 'data-testid': 'sidebar-footer' }),
}));

vi.mock('../src/renderer/components/SettingsPanel', () => ({
  default: () => createElement('div', { 'data-testid': 'settings-panel' }),
}));

vi.mock('../src/renderer/components/ShellLayout/ModelEnvConfigModal', () => ({
  ModelEnvConfigModal: () => null,
}));

vi.mock('../src/renderer/components/ShellLayout/connectivity-env', () => ({
  hasCompleteModelEnvConfig: () => true,
}));

vi.mock('../src/renderer/components/ShellLayout/model-env-storage', () => ({
  loadModelEnvText: () => '',
  saveModelEnvText: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { default: ShellLayout } = await import(
  '../src/renderer/components/ShellLayout'
);

async function renderShellLayout() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(ShellLayout));
  });

  return { container, root };
}

describe('ShellLayout recorder overlay', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('renders recorder as an overlay without a flex right panel', async () => {
    const { container, root } = await renderShellLayout();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="select-device-view"]')
        ?.click();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="switch-recorder"]')
        ?.click();
    });

    expect(
      container.querySelector('[data-testid="main-content"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="playground-playground"]'),
    ).toBeNull();

    const recorder = container.querySelector<HTMLElement>(
      '[data-testid="playground-recorder"]',
    );
    expect(recorder).toBeTruthy();

    const overlay = recorder?.parentElement as HTMLElement;
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('top-[52px]');
    expect(overlay.style.width).toBe('332px');

    await act(async () => {
      root.unmount();
    });
  });
});
