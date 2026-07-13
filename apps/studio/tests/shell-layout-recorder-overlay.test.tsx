import { afterEach, describe, expect, it, rs } from '@rstest/core';
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

const mocks = rs.hoisted(() => ({
  playground: {
    phase: 'ready',
    controller: {
      actions: {
        destroySession: rs.fn(async () => undefined),
      },
      state: {
        form: {
          setFieldsValue: rs.fn(),
        },
        sessionViewState: {
          connected: false,
        },
      },
    },
  },
}));

rs.mock('../src/renderer/playground/useStudioPlayground', () => ({
  useStudioPlayground: () => mocks.playground,
}));

rs.mock('../src/renderer/assets', () => ({
  assetUrls: {
    sidebar: {
      collapse: 'sidebar-collapse.svg',
      expand: 'sidebar-expand.svg',
    },
  },
}));

rs.mock('../src/renderer/hooks/useStudioUpdater', () => ({
  useStudioUpdater: () => ({
    appVersion: '0.0.0-test',
    download: rs.fn(async () => undefined),
    install: rs.fn(async () => undefined),
    status: { state: 'idle' },
  }),
}));

rs.mock('../src/renderer/components/MainContent', () => ({
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

rs.mock('../src/renderer/components/Playground', () => ({
  default: ({ rightPanelMode }: { rightPanelMode: string }) =>
    createElement('div', {
      'data-testid': `playground-${rightPanelMode}`,
    }),
}));

rs.mock('../src/renderer/components/Sidebar', () => ({
  default: () => createElement('div', { 'data-testid': 'sidebar' }),
  SidebarFooter: () =>
    createElement('div', { 'data-testid': 'sidebar-footer' }),
}));

rs.mock('../src/renderer/components/SettingsPanel', () => ({
  default: () => createElement('div', { 'data-testid': 'settings-panel' }),
}));

rs.mock('../src/renderer/components/ShellLayout/ModelEnvConfigModal', () => ({
  ModelEnvConfigModal: () => null,
}));

rs.mock('../src/renderer/components/ShellLayout/connectivity-env', () => ({
  hasCompleteModelEnvConfig: () => true,
}));

rs.mock('../src/renderer/components/ShellLayout/model-env-storage', () => ({
  loadModelEnvText: () => '',
  saveModelEnvText: rs.fn(),
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

// TODO(rstest): un-skip when @rstest/core restores the pluginReact automatic
// JSX runtime for files whose test environment is set via a per-file docblock.
// On 0.11.1 the docblock env override (node -> jsdom) drops the plugin pipeline,
// so JSX compiles to classic `React.createElement` and throws "React is not
// defined" at render time. See RSTEST-MIGRATION-WORKAROUNDS.md.
describe.skip('ShellLayout recorder overlay', () => {
  afterEach(() => {
    document.body.replaceChildren();
    rs.clearAllMocks();
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
