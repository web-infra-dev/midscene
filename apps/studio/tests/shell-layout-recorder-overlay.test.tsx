// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
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
    activeView,
    onStudioModeChange,
    onSelectDeviceView,
    studioMode,
  }: {
    activeView: 'overview' | 'device';
    onStudioModeChange: (mode: 'playground' | 'record' | 'replay') => void;
    onSelectDeviceView: () => void;
    studioMode: 'playground' | 'record' | 'replay';
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'main-content',
      },
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
          'data-testid': 'switch-record',
          onClick: () => onStudioModeChange('record'),
          type: 'button',
        },
        'record',
      ),
      createElement(
        'button',
        {
          'data-testid': 'switch-replay',
          onClick: () => onStudioModeChange('replay'),
          type: 'button',
        },
        'replay',
      ),
      createElement(
        'button',
        {
          'data-testid': 'switch-playground',
          onClick: () => onStudioModeChange('playground'),
          type: 'button',
        },
        'playground',
      ),
      activeView !== 'overview'
        ? createElement('div', {
            'data-testid': `playground-${studioMode}`,
          })
        : null,
    ),
}));

vi.mock('../src/renderer/components/StudioModePanel', () => ({
  default: ({
    onHeaderChange,
    studioMode,
  }: {
    onHeaderChange?: (header: { title: string }) => void;
    studioMode: string;
  }) => {
    useEffect(() => {
      onHeaderChange?.({
        title:
          studioMode === 'record'
            ? 'Record'
            : studioMode === 'replay'
              ? 'Replay'
              : 'API Playground',
      });
    }, [onHeaderChange, studioMode]);
    return createElement('div', {
      'data-testid': `playground-${studioMode}`,
    });
  },
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

describe('ShellLayout right panel tabs', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('keeps right tab content inside MainContent', async () => {
    const { container, root } = await renderShellLayout();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="select-device-view"]')
        ?.click();
    });

    const defaultRecord = container.querySelector<HTMLElement>(
      '[data-testid="playground-record"]',
    );
    expect(defaultRecord).toBeTruthy();

    const mainContent = container.querySelector<HTMLElement>(
      '[data-testid="main-content"]',
    );
    expect(mainContent).toBeTruthy();
    expect(mainContent?.contains(defaultRecord)).toBe(true);
    expect(mainContent?.nextElementSibling).toBeNull();

    const mainArea = mainContent?.parentElement as HTMLElement;
    expect(mainArea.className).toContain('flex');
    expect(mainArea.className).toContain('gap-[8px]');
    expect(
      container.querySelector('.pointer-events-none.absolute.left-0.right-0'),
    ).toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="switch-record"]')
        ?.click();
    });

    expect(container.querySelector('[data-testid="main-content"]')).toBe(
      mainContent,
    );
    expect(
      container.querySelector('[data-testid="playground-playground"]'),
    ).toBeNull();

    const record = container.querySelector<HTMLElement>(
      '[data-testid="playground-record"]',
    );
    expect(record).toBeTruthy();

    expect(mainContent?.contains(record)).toBe(true);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="switch-replay"]')
        ?.click();
    });

    const replay = container.querySelector<HTMLElement>(
      '[data-testid="playground-replay"]',
    );
    expect(replay).toBeTruthy();
    expect(mainContent?.contains(replay)).toBe(true);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="switch-playground"]')
        ?.click();
    });

    expect(
      container.querySelector('[data-testid="playground-playground"]'),
    ).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });
});
