import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock HdcClient
const mockHdc = {
  getScreenInfo: vi.fn().mockResolvedValue({ width: 1216, height: 2688 }),
  shell: vi.fn().mockResolvedValue(''),
  click: vi.fn().mockResolvedValue(undefined),
  doubleClick: vi.fn().mockResolvedValue(undefined),
  longClick: vi.fn().mockResolvedValue(undefined),
  inputText: vi.fn().mockResolvedValue(undefined),
  keyEvent: vi.fn().mockResolvedValue(undefined),
  swipe: vi.fn().mockResolvedValue(undefined),
  fling: vi.fn().mockResolvedValue(undefined),
  drag: vi.fn().mockResolvedValue(undefined),
  screenshot: vi
    .fn()
    .mockResolvedValue(
      'success: snapshot display 0 , write to /data/local/tmp/ms_screen.jpeg as jpeg, width 1216, height 2688',
    ),
  fileRecv: vi.fn().mockResolvedValue(undefined),
  startAbility: vi.fn().mockResolvedValue(undefined),
  queryMainAbility: vi.fn().mockResolvedValue(undefined),
  forceStop: vi.fn().mockResolvedValue(undefined),
  clearTextField: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../src/hdc', () => ({
  HdcClient: vi.fn().mockImplementation(() => mockHdc),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
      },
    },
    unlink: vi.fn((_path, cb) => cb?.(null)),
  };
});

vi.mock('@midscene/core/utils', () => ({
  getTmpFile: vi.fn().mockReturnValue('/tmp/test-screenshot.jpeg'),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@midscene/shared/img', () => ({
  createImgBase64ByFormat: vi
    .fn()
    .mockReturnValue('data:image/jpeg;base64,fake'),
}));

const { HarmonyDevice } = await import('../../src/device');

describe('HarmonyDevice', () => {
  let device: InstanceType<typeof HarmonyDevice>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHdc.getScreenInfo.mockResolvedValue({ width: 1216, height: 2688 });
    device = new HarmonyDevice('test-device-id');
  });

  afterEach(async () => {
    if (device) {
      await device.destroy();
    }
  });

  describe('constructor', () => {
    it('should create device with deviceId', () => {
      expect(device).toBeDefined();
      expect(device.interfaceType).toBe('harmony');
    });

    it('should throw if deviceId is empty', () => {
      expect(() => new HarmonyDevice('')).toThrow(
        'deviceId is required for HarmonyDevice',
      );
    });

    it('should accept options', () => {
      const d = new HarmonyDevice('dev-1', {
        hdcPath: '/custom/hdc',
        autoDismissKeyboard: true,
        screenshotResizeScale: 0.5,
      });
      expect(d).toBeDefined();
      expect(d.options?.hdcPath).toBe('/custom/hdc');
      expect(d.options?.autoDismissKeyboard).toBe(true);
      expect(d.options?.screenshotResizeScale).toBe(0.5);
    });
  });

  describe('describe', () => {
    it('should return deviceId before connect', () => {
      expect(device.describe()).toBe('DeviceId: test-device-id');
    });

    it('should return full description after connect', async () => {
      await device.connect();
      expect(device.describe()).toBe(
        'DeviceId: test-device-id\nScreenSize: 1216x2688',
      );
    });
  });

  describe('connect / getHdc', () => {
    it('should initialize HDC and cache screen size', async () => {
      const hdc = await device.connect();
      expect(hdc).toBeDefined();
      expect(mockHdc.getScreenInfo).toHaveBeenCalledTimes(1);
    });

    it('should return cached HDC on subsequent calls', async () => {
      const hdc1 = await device.connect();
      const hdc2 = await device.connect();
      expect(hdc1).toBe(hdc2);
      expect(mockHdc.getScreenInfo).toHaveBeenCalledTimes(1);
    });

    it('should throw after device is destroyed', async () => {
      await device.connect();
      await device.destroy();
      await expect(device.connect()).rejects.toThrow('has been destroyed');
    });

    it('should throw if getScreenInfo fails', async () => {
      mockHdc.getScreenInfo.mockRejectedValueOnce(
        new Error('connection refused'),
      );
      await expect(device.connect()).rejects.toThrow(
        'Unable to connect to device',
      );
    });

    it('should deduplicate concurrent connect calls', async () => {
      const [hdc1, hdc2] = await Promise.all([
        device.connect(),
        device.connect(),
      ]);
      expect(hdc1).toBe(hdc2);
      expect(mockHdc.getScreenInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('destroy', () => {
    it('should clear internal state', async () => {
      await device.connect();
      await device.destroy();
      await expect(device.connect()).rejects.toThrow('has been destroyed');
    });

    it('should be idempotent', async () => {
      await device.destroy();
      await device.destroy();
    });
  });

  describe('size', () => {
    it('should return screen size', async () => {
      await device.connect();
      const size = await device.size();
      expect(size).toEqual({ width: 1216, height: 2688 });
    });

    it('should apply screenshotResizeScale', async () => {
      const d = new HarmonyDevice('dev', { screenshotResizeScale: 0.5 });
      await d.connect();
      const size = await d.size();
      expect(size).toEqual({ width: 608, height: 1344 });
      await d.destroy();
    });

    it('should default scale to 1', async () => {
      await device.connect();
      const size = await device.size();
      expect(size.width).toBe(1216);
      expect(size.height).toBe(2688);
    });
  });

  describe('tap', () => {
    it('should call hdc.click', async () => {
      await device.connect();
      await device.tap(100, 200);
      expect(mockHdc.click).toHaveBeenCalledWith(100, 200);
    });

    it('should track lastTapPosition', async () => {
      await device.connect();
      await device.tap(300, 400);
      // Verify by inputText fallback using lastTapPosition
      await device.inputText('test');
      expect(mockHdc.inputText).toHaveBeenCalledWith(300, 400, 'test');
    });
  });

  describe('doubleTap', () => {
    it('should call hdc.doubleClick', async () => {
      await device.connect();
      await device.doubleTap(150, 300);
      expect(mockHdc.doubleClick).toHaveBeenCalledWith(150, 300);
    });
  });

  describe('longPress', () => {
    it('should call hdc.longClick', async () => {
      await device.connect();
      await device.longPress(200, 400);
      expect(mockHdc.longClick).toHaveBeenCalledWith(200, 400);
    });
  });

  describe('inputText', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should do nothing for empty text', async () => {
      await device.inputText('');
      expect(mockHdc.inputText).not.toHaveBeenCalled();
    });

    it('should use element center when element is provided', async () => {
      const element = { center: [500, 600] as [number, number] } as any;
      await device.inputText('hello', element);
      expect(mockHdc.inputText).toHaveBeenCalledWith(500, 600, 'hello');
    });

    it('should use lastTapPosition when no element', async () => {
      await device.tap(300, 400);
      mockHdc.inputText.mockClear();
      await device.inputText('world');
      expect(mockHdc.inputText).toHaveBeenCalledWith(300, 400, 'world');
    });

    it('should fallback to screen center when no element or lastTap', async () => {
      await device.inputText('test');
      // screen center: 1216/2=608, 2688/2=1344
      expect(mockHdc.inputText).toHaveBeenCalledWith(608, 1344, 'test');
    });

    it('should click+clearTextField before inputText when shouldReplace is true', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputText('new text', element, true);

      // 1. click to focus
      expect(mockHdc.click).toHaveBeenCalledWith(100, 200);
      // 2. clearTextField to batch-delete existing content
      expect(mockHdc.clearTextField).toHaveBeenCalledWith(100);
      // 3. actual inputText
      expect(mockHdc.inputText).toHaveBeenCalledWith(100, 200, 'new text');
    });

    it('should NOT use sentinel pattern when shouldReplace is false', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputText('append text', element, false);

      expect(mockHdc.inputText).toHaveBeenCalledTimes(1);
      expect(mockHdc.inputText).toHaveBeenCalledWith(100, 200, 'append text');
      expect(mockHdc.keyEvent).not.toHaveBeenCalled();
    });

    it('should NOT use sentinel pattern when shouldReplace is undefined', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputText('text', element);

      expect(mockHdc.inputText).toHaveBeenCalledTimes(1);
      expect(mockHdc.keyEvent).not.toHaveBeenCalled();
    });

    it('should dismiss keyboard when autoDismissKeyboard is true', async () => {
      const d = new HarmonyDevice('dev', { autoDismissKeyboard: true });
      await d.connect();
      const element = { center: [100, 200] as [number, number] } as any;
      await d.inputText('hi', element);

      // hideKeyboard sends Back keyEvent
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Back');
      await d.destroy();
    });

    it('should NOT dismiss keyboard when autoDismissKeyboard is not set', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputText('hi', element);
      expect(mockHdc.keyEvent).not.toHaveBeenCalled();
    });
  });

  describe('clearInput', () => {
    it('should call clearTextField to batch-delete text', async () => {
      await device.connect();
      await device.clearInput();
      expect(mockHdc.clearTextField).toHaveBeenCalledWith(100);
    });

    it('should click element before clearing when element is provided', async () => {
      await device.connect();
      const element = { center: [100, 200] as [number, number] } as any;
      await device.clearInput(element);
      expect(mockHdc.click).toHaveBeenCalledWith(100, 200);
      expect(mockHdc.clearTextField).toHaveBeenCalledWith(100);
    });
  });

  describe('keyboardPress', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it.each([
      ['Enter', '2054'],
      ['Backspace', '2055'],
      ['Tab', '2049'],
      ['Escape', '2070'],
      ['ArrowUp', '2012'],
      ['ArrowDown', '2013'],
      ['ArrowLeft', '2014'],
      ['ArrowRight', '2015'],
      ['Space', '2050'],
      ['Delete', '2071'],
    ])('should map %s to keycode %s', async (key, code) => {
      await device.keyboardPress(key);
      expect(mockHdc.keyEvent).toHaveBeenCalledWith(code);
    });

    it('should map Home to string "Home"', async () => {
      await device.keyboardPress('Home');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Home');
    });

    it('should normalize case-insensitive key names', async () => {
      await device.keyboardPress('enter');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2054');
    });

    it('should normalize aliases (esc -> Escape)', async () => {
      await device.keyboardPress('esc');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2070');
    });

    it('should normalize arrow aliases (up -> ArrowUp)', async () => {
      await device.keyboardPress('up');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2012');
    });

    it('should normalize arrow aliases (down/left/right)', async () => {
      await device.keyboardPress('down');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2013');

      mockHdc.keyEvent.mockClear();
      await device.keyboardPress('left');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2014');

      mockHdc.keyEvent.mockClear();
      await device.keyboardPress('right');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2015');
    });

    it('should pass through unknown keys as-is', async () => {
      await device.keyboardPress('F5');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('F5');
    });
  });

  describe('back / home / recentApps / hideKeyboard', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send Back key', async () => {
      await device.back();
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Back');
    });

    it('should send Home key', async () => {
      await device.home();
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Home');
    });

    it('should send RecentApps key', async () => {
      await device.recentApps();
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('RecentApps');
    });

    it('should send Back key for hideKeyboard', async () => {
      await device.hideKeyboard();
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Back');
    });
  });

  describe('launch', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should use aa start -U for http URLs', async () => {
      await device.launch('https://example.com');
      expect(mockHdc.shell).toHaveBeenCalledWith(
        'aa start -U https://example.com',
      );
      expect(device.uri).toBe('https://example.com');
    });

    it('should use aa start -U for https URLs', async () => {
      await device.launch('http://localhost:3000');
      expect(mockHdc.shell).toHaveBeenCalledWith(
        'aa start -U http://localhost:3000',
      );
    });

    it('should use aa start -U for custom scheme URIs', async () => {
      await device.launch('myapp://page');
      expect(mockHdc.shell).toHaveBeenCalledWith('aa start -U myapp://page');
    });

    it('should use startAbility for bundleName/abilityName format', async () => {
      await device.launch('com.example.app/MainAbility');
      expect(mockHdc.startAbility).toHaveBeenCalledWith(
        'com.example.app',
        'MainAbility',
      );
    });

    it('should use startAbility with EntryAbility for plain bundle name', async () => {
      await device.launch('com.example.app');
      expect(mockHdc.startAbility).toHaveBeenCalledWith(
        'com.example.app',
        'EntryAbility',
      );
    });

    it('should throw with descriptive error on launch failure', async () => {
      mockHdc.shell.mockRejectedValueOnce(new Error('app not found'));
      await expect(device.launch('https://bad.url')).rejects.toThrow(
        'Failed to launch https://bad.url',
      );
    });

    it('should return device instance for chaining', async () => {
      const result = await device.launch('com.example.app');
      expect(result).toBe(device);
    });
  });

  describe('scroll', () => {
    beforeEach(async () => {
      mockHdc.getScreenInfo.mockResolvedValue({ width: 1200, height: 2400 });
      device = new HarmonyDevice('test-device-id');
      await device.connect();
    });

    it('should throw if both deltas are zero', async () => {
      await expect(device.scroll(0, 0)).rejects.toThrow(
        'Scroll distance cannot be zero',
      );
    });

    it('should calculate swipe for scroll down (positive deltaY)', async () => {
      await device.scroll(0, 500);
      // For positive deltaY: startY = height/4 = 600, endY = 600 - 500 = 100
      expect(mockHdc.swipe).toHaveBeenCalledWith(300, 600, 300, 100, 600);
    });

    it('should calculate swipe for scroll up (negative deltaY)', async () => {
      await device.scroll(0, -500);
      // For negative deltaY: startY = 3/4 * 2400 = 1800, endY = 1800 + 500 = 2300
      expect(mockHdc.swipe).toHaveBeenCalledWith(300, 1800, 300, 2300, 600);
    });

    it('should accept custom speed', async () => {
      await device.scroll(0, 500, 1000);
      expect(mockHdc.swipe).toHaveBeenCalledWith(300, 600, 300, 100, 1000);
    });
  });

  describe('scrollDown / scrollUp', () => {
    beforeEach(async () => {
      mockHdc.getScreenInfo.mockResolvedValue({ width: 1200, height: 2400 });
      device = new HarmonyDevice('test-device-id');
      await device.connect();
    });

    it('scrollDown with startPoint should swipe from point upward', async () => {
      await device.scrollDown(500, { left: 600, top: 1200 });
      // endY = max(0, 1200-500) = 700
      expect(mockHdc.swipe).toHaveBeenCalledWith(600, 1200, 600, 700);
    });

    it('scrollDown without startPoint should call scroll', async () => {
      await device.scrollDown(500);
      // delegates to scroll(0, 500) -> swipe(300, 600, 300, 100, 600)
      expect(mockHdc.swipe).toHaveBeenCalled();
    });

    it('scrollDown without distance should use full height', async () => {
      await device.scrollDown();
      expect(mockHdc.swipe).toHaveBeenCalled();
    });

    it('scrollUp with startPoint should swipe from point downward', async () => {
      await device.scrollUp(500, { left: 600, top: 1200 });
      // endY = min(2400, 1200+500) = 1700
      expect(mockHdc.swipe).toHaveBeenCalledWith(600, 1200, 600, 1700);
    });
  });

  describe('scrollLeft / scrollRight', () => {
    beforeEach(async () => {
      mockHdc.getScreenInfo.mockResolvedValue({ width: 1200, height: 2400 });
      device = new HarmonyDevice('test-device-id');
      await device.connect();
    });

    it('scrollLeft with startPoint should swipe right', async () => {
      await device.scrollLeft(400, { left: 600, top: 1200 });
      // endX = min(1200, 600+400) = 1000
      expect(mockHdc.swipe).toHaveBeenCalledWith(600, 1200, 1000, 1200);
    });

    it('scrollRight with startPoint should swipe left', async () => {
      await device.scrollRight(400, { left: 600, top: 1200 });
      // endX = max(0, 600-400) = 200
      expect(mockHdc.swipe).toHaveBeenCalledWith(600, 1200, 200, 1200);
    });
  });

  describe('scrollUntil*', () => {
    beforeEach(async () => {
      mockHdc.getScreenInfo.mockResolvedValue({ width: 1200, height: 2400 });
      device = new HarmonyDevice('test-device-id');
      await device.connect();
    });

    it('scrollUntilTop with startPoint should fling multiple times', async () => {
      await device.scrollUntilTop({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      // fling toward bottom of screen (height=2400)
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 600, 2400, 2000);
    });

    it('scrollUntilBottom with startPoint should fling multiple times', async () => {
      await device.scrollUntilBottom({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      // fling toward top of screen (0)
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 600, 0, 2000);
    });

    it('scrollUntilTop without startPoint should use scroll', async () => {
      await device.scrollUntilTop();
      // Should call swipe 10 times via scroll
      expect(mockHdc.swipe).toHaveBeenCalledTimes(10);
    });

    it('scrollUntilBottom without startPoint should use scroll', async () => {
      await device.scrollUntilBottom();
      expect(mockHdc.swipe).toHaveBeenCalledTimes(10);
    });

    it('scrollUntilLeft with startPoint should fling multiple times', async () => {
      await device.scrollUntilLeft({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 1200, 1200, 2000);
    });

    it('scrollUntilRight with startPoint should fling multiple times', async () => {
      await device.scrollUntilRight({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 0, 1200, 2000);
    });
  });

  describe('getTimestamp', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should parse timestamp from device', async () => {
      mockHdc.shell.mockResolvedValueOnce('1709078400000\n');
      const ts = await device.getTimestamp();
      expect(ts).toBe(1709078400000);
      expect(mockHdc.shell).toHaveBeenCalledWith('date +%s%3N');
    });

    it('should throw on invalid timestamp', async () => {
      mockHdc.shell.mockResolvedValueOnce('not-a-number\n');
      await expect(device.getTimestamp()).rejects.toThrow(
        'Failed to get device time',
      );
    });

    it('should throw on shell error', async () => {
      mockHdc.shell.mockRejectedValueOnce(new Error('device offline'));
      await expect(device.getTimestamp()).rejects.toThrow(
        'Failed to get device time',
      );
    });
  });

  describe('screenshotBase64', () => {
    it('should take screenshot and return base64', async () => {
      await device.connect();
      const result = await device.screenshotBase64();
      expect(result).toBe('data:image/jpeg;base64,fake');
      expect(mockHdc.screenshot).toHaveBeenCalled();
      expect(mockHdc.fileRecv).toHaveBeenCalled();
    });
  });

  describe('actionSpace', () => {
    it('should return all expected actions', () => {
      const actions = device.actionSpace();
      const actionNames = actions.map((a: any) => a.name);

      expect(actionNames).toContain('Tap');
      expect(actionNames).toContain('DoubleClick');
      expect(actionNames).toContain('Input');
      expect(actionNames).toContain('Scroll');
      expect(actionNames).toContain('DragAndDrop');
      expect(actionNames).toContain('Swipe');
      expect(actionNames).toContain('KeyboardPress');
      expect(actionNames).toContain('CursorMove');
      expect(actionNames).toContain('LongPress');
      expect(actionNames).toContain('ClearInput');
      expect(actionNames).toContain('RunHdcShell');
      expect(actionNames).toContain('Launch');
      expect(actionNames).toContain('HarmonyBackButton');
      expect(actionNames).toContain('HarmonyHomeButton');
      expect(actionNames).toContain('HarmonyRecentAppsButton');
    });

    it('should include custom actions', () => {
      const customAction = {
        name: 'CustomAction',
        description: 'A custom test action',
        call: vi.fn(),
      };
      const d = new HarmonyDevice('dev', { customActions: [customAction] });
      const actionNames = d.actionSpace().map((a: any) => a.name);
      expect(actionNames).toContain('CustomAction');
    });

    it('should return 15 default actions + platform actions', () => {
      const actions = device.actionSpace();
      expect(actions.length).toBe(15);
    });
  });

  describe('setAppNameMapping', () => {
    it('should store mapping and resolve on launch', async () => {
      await device.connect();
      device.setAppNameMapping({
        browser: 'com.huawei.hmos.browser',
      });
      await device.launch('Browser');
      expect(mockHdc.startAbility).toHaveBeenCalledWith(
        'com.huawei.hmos.browser',
        'EntryAbility',
      );
    });

    it('should fall back to original name if not in mapping', async () => {
      await device.connect();
      device.setAppNameMapping({});
      await device.launch('com.unknown.app');
      expect(mockHdc.startAbility).toHaveBeenCalledWith(
        'com.unknown.app',
        'EntryAbility',
      );
    });
  });

  describe('getScreenSize', () => {
    it('should return cached size after connect', async () => {
      await device.connect();
      const size1 = await device.getScreenSize();
      const size2 = await device.getScreenSize();
      expect(size1).toEqual({ width: 1216, height: 2688 });
      expect(size2).toEqual({ width: 1216, height: 2688 });
      // Only called once during connect
      expect(mockHdc.getScreenInfo).toHaveBeenCalledTimes(1);
    });
  });
});
