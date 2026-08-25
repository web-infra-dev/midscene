import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onUpdatedListeners = new Set<(...args: any[]) => void>();
const tabsCreate = vi.fn();
const tabsGet = vi.fn();
const tabsQuery = vi.fn();
const tabsUpdate = vi.fn();

vi.stubGlobal('chrome', {
  tabs: {
    create: tabsCreate,
    get: tabsGet,
    query: tabsQuery,
    update: tabsUpdate,
    onUpdated: {
      addListener: vi.fn((listener) => onUpdatedListeners.add(listener)),
      removeListener: vi.fn((listener) => onUpdatedListeners.delete(listener)),
    },
  },
  debugger: {
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn(),
    onEvent: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/chrome-extension/dynamic-scripts', () => ({
  getHtmlElementScript: vi.fn(async () => ''),
  injectStopWaterFlowAnimation: vi.fn(async () => ''),
  injectWaterFlowAnimation: vi.fn(async () => ''),
}));

import { ExtensionBridgePageBrowserSide } from '../../src/bridge-mode/page-browser-side';
import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

describe('Bridge tab activation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onUpdatedListeners.clear();
    tabsCreate.mockResolvedValue({ id: 42 });
    tabsGet.mockResolvedValue({
      id: 42,
      status: 'complete',
      url: 'https://example.com',
    });
    tabsQuery.mockResolvedValue([{ id: 7, active: true }]);
    tabsUpdate.mockResolvedValue({ id: 42, active: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 验证后台 Tab 可以被控制，但不会改变 Chrome 当前激活的 Tab。
   */
  it('creates and controls a background tab without activating it', async () => {
    const page = new ExtensionBridgePageBrowserSide();

    await page.connectNewTabWithUrl('https://example.com', {
      activateTab: false,
    });

    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'https://example.com',
      active: false,
    });
    expect(tabsUpdate).not.toHaveBeenCalled();
    await expect(page.getActiveTabId()).resolves.toBe(42);
  });

  /**
   * 验证未提供新选项时仍保持旧的激活 Tab 行为。
   */
  it('preserves legacy activation when activateTab is omitted', async () => {
    const page = new ExtensionBridgePageBrowserSide();

    await page.connectNewTabWithUrl('https://example.com');

    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'https://example.com',
      active: true,
    });
    expect(tabsUpdate).toHaveBeenCalledWith(42, { active: true });
    await expect(page.getActiveTabId()).resolves.toBe(42);
  });

  /**
   * 验证旧的设置接口仍会激活受控 Tab。
   */
  it('keeps the legacy setter activating the controlled tab', async () => {
    const page = new ChromeExtensionProxyPage(true);

    await page.setActiveTabId(42);

    expect(tabsUpdate).toHaveBeenCalledWith(42, { active: true });
    await expect(page.getActiveTabId()).resolves.toBe(42);
  });

  /**
   * 验证销毁页面时会清理后台受控 Tab 的调试器连接。
   */
  it('uses the controlled background tab during cleanup', async () => {
    const page = new ChromeExtensionProxyPage(true);
    const detachDebugger = vi
      .spyOn(page, 'detachDebugger')
      .mockResolvedValue(undefined);

    await page.setActiveTabId(42, { activate: false });
    await page.destroy();

    expect(detachDebugger).toHaveBeenCalledWith(42);
    await expect(page.getActiveTabId()).resolves.toBeNull();
  });

  /**
   * 验证连接当前 Tab 时不会额外改变用户的 Tab 选择。
   */
  it('connects the current active tab without changing tab selection', async () => {
    const page = new ExtensionBridgePageBrowserSide();

    await page.connectCurrentTab();

    expect(tabsQuery).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(tabsUpdate).toHaveBeenCalledWith(7, { active: true });
    await expect(page.getActiveTabId()).resolves.toBe(7);
  });
});
