// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  modelEnvModalProps: null as null | {
    onSave?: (payload: {
      text: string;
      agentOptions: {
        replanningCycleLimit?: number;
        waitAfterAction?: number;
        screenshotShrinkFactor?: number;
      };
    }) => void | Promise<void>;
  },
  saveAgentOptions: vi.fn(),
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
    status: { state: 'available', version: 'test' },
  }),
}));

vi.mock('../src/renderer/components/MainContent', () => ({
  default: ({
    activeView,
    floatingStudioModePanel,
    onOpenStudioRightPanel,
    onStudioModeChange,
    onSelectDeviceView,
    studioMode,
  }: {
    activeView: 'overview' | 'device';
    floatingStudioModePanel?: boolean;
    onOpenStudioRightPanel?: (view: unknown) => void;
    onStudioModeChange: (mode: 'playground' | 'record' | 'replay') => void;
    onSelectDeviceView: () => void;
    studioMode: 'playground' | 'record' | 'replay';
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'main-content',
        'data-floating-studio-mode-panel': String(floatingStudioModePanel),
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
      createElement(
        'button',
        {
          'data-testid': 'open-markdown',
          onClick: () =>
            onOpenStudioRightPanel?.({
              markdown: '# Generated Markdown',
              type: 'markdown',
            }),
          type: 'button',
        },
        'markdown',
      ),
      createElement(
        'button',
        {
          'data-testid': 'open-screenshots',
          onClick: () =>
            onOpenStudioRightPanel?.({
              content: createElement('div', null, 'Screenshots'),
              type: 'screenshots',
            }),
          type: 'button',
        },
        'screenshots',
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
  ModelEnvConfigModal: (props: unknown) => {
    mocks.modelEnvModalProps = props as typeof mocks.modelEnvModalProps;
    return null;
  },
}));

vi.mock('../src/renderer/components/ShellLayout/agent-options-storage', () => ({
  loadAgentOptions: () => ({}),
  saveAgentOptions: mocks.saveAgentOptions,
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
    vi.unstubAllGlobals();
    mocks.modelEnvModalProps = null;
  });

  it('waits for runtime Agent options synchronization before persisting', async () => {
    let resolveRuntimeUpdate: (() => void) | undefined;
    const updateAgentOptions = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveRuntimeUpdate = resolve;
          }),
      );
    vi.stubGlobal('studioRuntime', { updateAgentOptions });
    const { root } = await renderShellLayout();
    const agentOptions = {
      replanningCycleLimit: 0,
      waitAfterAction: 500,
      screenshotShrinkFactor: 2,
    };

    let savePromise: void | Promise<void>;
    await act(async () => {
      savePromise = mocks.modelEnvModalProps?.onSave?.({
        text: 'MIDSCENE_MODEL_NAME=test-model',
        agentOptions,
      });
      await Promise.resolve();
    });

    expect(updateAgentOptions).toHaveBeenLastCalledWith(agentOptions);
    expect(mocks.saveAgentOptions).not.toHaveBeenCalled();

    resolveRuntimeUpdate?.();
    await act(async () => {
      await savePromise;
    });

    expect(mocks.saveAgentOptions).toHaveBeenCalledWith(agentOptions);
    await act(async () => root.unmount());
  });

  it('aligns the update pill with the sidebar toggle in one titlebar flex row', async () => {
    const { container, root } = await renderShellLayout();
    const updateButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Update available"]',
    );

    expect(updateButton?.className).toContain('h-[22px]');
    expect(updateButton?.parentElement?.className).toContain('items-center');
    expect(updateButton?.parentElement?.style.top).toBe('16px');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    expect(container.contains(updateButton)).toBe(true);
    expect(updateButton?.parentElement?.style.left).toBe('98px');

    await act(async () => root.unmount());
  });

  it('passes the Windows titlebar safety inset to a right-side Markdown drawer', async () => {
    const previousUserAgent = Object.getOwnPropertyDescriptor(
      window.navigator,
      'userAgent',
    );
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Windows NT 10.0',
    });
    try {
      const { container, root } = await renderShellLayout();

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            '[data-testid="select-device-view"]',
          )
          ?.click();
      });
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('[data-testid="open-markdown"]')
          ?.click();
      });

      expect(
        container
          .querySelector<HTMLElement>('.studio-right-panel-markdown-drawer')
          ?.style.getPropertyValue('--studio-titlebar-right-inset'),
      ).toBe('176px');

      await act(async () => root.unmount());
    } finally {
      if (previousUserAgent) {
        Object.defineProperty(window.navigator, 'userAgent', previousUserAgent);
      } else {
        Reflect.deleteProperty(window.navigator, 'userAgent');
      }
    }
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
    expect(mainArea.className).toContain('gap-[4px]');
    expect(mainArea.style.left).toBe('244px');
    expect(
      container.querySelector('.pointer-events-none.absolute.left-0.right-0'),
    ).toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(mainArea.style.left).toBe('4px');

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

  it('floats Record and Replay context panels over the preview', async () => {
    const { container, root } = await renderShellLayout();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="select-device-view"]')
        ?.click();
    });

    const mainContent = container.querySelector<HTMLElement>(
      '[data-testid="main-content"]',
    );
    expect(mainContent?.getAttribute('data-floating-studio-mode-panel')).toBe(
      'false',
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="open-markdown"]')
        ?.click();
    });

    expect(mainContent?.getAttribute('data-floating-studio-mode-panel')).toBe(
      'true',
    );
    expect(
      container.querySelector('.studio-right-panel-markdown-drawer-enter'),
    ).not.toBeNull();

    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close studio right panel"]',
    );
    expect(closeButton).not.toBeNull();
    expect(closeButton?.classList.contains('app-no-drag')).toBe(true);
    expect(closeButton?.querySelector('svg')).not.toBeNull();
    expect(
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="More markdown actions"]',
        )
        ?.querySelector('svg'),
    ).not.toBeNull();

    await act(async () => {
      closeButton?.click();
    });

    expect(
      container.querySelector('.studio-right-panel-markdown-drawer-exit'),
    ).not.toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="open-screenshots"]')
        ?.click();
    });

    expect(mainContent?.getAttribute('data-floating-studio-mode-panel')).toBe(
      'true',
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="switch-replay"]')
        ?.click();
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="open-markdown"]')
        ?.click();
    });

    expect(mainContent?.getAttribute('data-floating-studio-mode-panel')).toBe(
      'true',
    );
    expect(
      container.querySelector('.studio-right-panel-markdown-drawer-enter'),
    ).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
