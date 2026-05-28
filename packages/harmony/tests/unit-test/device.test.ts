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
        keyboardDismissStrategy: 'esc-first',
      });
      expect(d).toBeDefined();
      expect(d.options?.hdcPath).toBe('/custom/hdc');
      expect(d.options?.autoDismissKeyboard).toBe(true);
      expect(d.options?.keyboardDismissStrategy).toBe('esc-first');
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

    it('should warn when deprecated screenshotResizeScale is used', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const d = new HarmonyDevice('dev', { screenshotResizeScale: 0.5 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('screenshotResizeScale is deprecated'),
      );
      warnSpy.mockRestore();
    });

    it('should ignore deprecated screenshotResizeScale in size()', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const d = new HarmonyDevice('dev', { screenshotResizeScale: 0.5 });
      await d.connect();
      const size = await d.size();
      // size() should return raw physical size, ignoring screenshotResizeScale
      expect(size).toEqual({ width: 1216, height: 2688 });
      await d.destroy();
      warnSpy.mockRestore();
    });
  });

  describe('tap', () => {
    it('should call hdc.click', async () => {
      await device.connect();
      await device.inputPrimitives.pointer.tap({ x: 100, y: 200 });
      expect(mockHdc.click).toHaveBeenCalledWith(100, 200);
    });

    it('should track lastTapPosition', async () => {
      await device.connect();
      await device.inputPrimitives.pointer.tap({ x: 300, y: 400 });
      // Verify by inputText fallback using lastTapPosition
      await device.inputPrimitives.keyboard.typeText('test');
      expect(mockHdc.inputText).toHaveBeenCalledWith(300, 400, 'test');
    });
  });

  describe('doubleTap', () => {
    it('should call hdc.doubleClick', async () => {
      await device.connect();
      await device.inputPrimitives.pointer.doubleClick({ x: 150, y: 300 });
      expect(mockHdc.doubleClick).toHaveBeenCalledWith(150, 300);
    });
  });

  describe('longPress', () => {
    it('should call hdc.longClick', async () => {
      await device.connect();
      await device.inputPrimitives.pointer.longPress({ x: 200, y: 400 });
      expect(mockHdc.longClick).toHaveBeenCalledWith(200, 400);
    });
  });

  describe('inputText', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should do nothing for empty text', async () => {
      await device.inputPrimitives.keyboard.typeText('');
      expect(mockHdc.inputText).not.toHaveBeenCalled();
    });

    it('should use element center when element is provided', async () => {
      const element = { center: [500, 600] as [number, number] } as any;
      await device.inputPrimitives.keyboard.typeText('hello', {
        target: element,
        replace: false,
      });
      expect(mockHdc.inputText).toHaveBeenCalledWith(500, 600, 'hello');
    });

    it('should use lastTapPosition when no element', async () => {
      await device.inputPrimitives.pointer.tap({ x: 300, y: 400 });
      mockHdc.inputText.mockClear();
      await device.inputPrimitives.keyboard.typeText('world');
      expect(mockHdc.inputText).toHaveBeenCalledWith(300, 400, 'world');
    });

    it('should fallback to screen center when no element or lastTap', async () => {
      await device.inputPrimitives.keyboard.typeText('test');
      // screen center: 1216/2=608, 2688/2=1344
      expect(mockHdc.inputText).toHaveBeenCalledWith(608, 1344, 'test');
    });

    it('should click+clearTextField before inputText when shouldReplace is true', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputPrimitives.keyboard.typeText('new text', {
        target: element,
        replace: true,
      });

      // 1. click to focus
      expect(mockHdc.click).toHaveBeenCalledWith(100, 200);
      // 2. clearTextField to batch-delete existing content
      expect(mockHdc.clearTextField).toHaveBeenCalledWith(100);
      // 3. actual inputText
      expect(mockHdc.inputText).toHaveBeenCalledWith(100, 200, 'new text');
    });

    it('should NOT use sentinel pattern when shouldReplace is false', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputPrimitives.keyboard.typeText('append text', {
        target: element,
        replace: false,
      });

      expect(mockHdc.inputText).toHaveBeenCalledTimes(1);
      expect(mockHdc.inputText).toHaveBeenCalledWith(100, 200, 'append text');
      expect(mockHdc.click).not.toHaveBeenCalled();
      expect(mockHdc.clearTextField).not.toHaveBeenCalled();
    });

    it('should NOT use sentinel pattern when shouldReplace is undefined', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputPrimitives.keyboard.typeText('text', {
        target: element,
        replace: false,
      });

      expect(mockHdc.inputText).toHaveBeenCalledTimes(1);
      expect(mockHdc.click).not.toHaveBeenCalled();
      expect(mockHdc.clearTextField).not.toHaveBeenCalled();
    });

    it('should dismiss keyboard when autoDismissKeyboard is true', async () => {
      const d = new HarmonyDevice('dev', { autoDismissKeyboard: true });
      await d.connect();
      const element = { center: [100, 200] as [number, number] } as any;
      await d.inputPrimitives.keyboard.typeText('hi', {
        target: element,
        replace: false,
      });

      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2070');
      await d.destroy();
    });

    it('should dismiss keyboard by default with esc-first strategy', async () => {
      const element = { center: [100, 200] as [number, number] } as any;
      await device.inputPrimitives.keyboard.typeText('hi', {
        target: element,
        replace: false,
      });
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2070');
    });

    it('should use back-first strategy when specified on device options', async () => {
      const d = new HarmonyDevice('dev', {
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'back-first',
      });
      await d.connect();
      const element = { center: [100, 200] as [number, number] } as any;
      await d.inputPrimitives.keyboard.typeText('hi', {
        target: element,
        replace: false,
      });

      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Back');
      await d.destroy();
    });

    it('should respect keyboardDismissStrategy passed to typeText', async () => {
      const d = new HarmonyDevice('dev', {
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'esc-first',
      });
      await d.connect();

      await d.inputPrimitives.keyboard.typeText('hi', {
        replace: false,
        keyboardDismissStrategy: 'back-first',
      });

      expect(mockHdc.inputText).toHaveBeenCalledWith(608, 1344, 'hi');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Back');
      await d.destroy();
    });

    it('should respect autoDismissKeyboard passed to Input action', async () => {
      const d = new HarmonyDevice('dev', { autoDismissKeyboard: true });
      const inputAction = d
        .actionSpace()
        .find((action) => action.name === 'Input') as any;
      const param = inputAction.paramSchema.parse({
        value: 'hi',
        autoDismissKeyboard: false,
      });

      await inputAction.call(param);

      expect(mockHdc.inputText).toHaveBeenCalledWith(608, 1344, 'hi');
      expect(mockHdc.keyEvent).not.toHaveBeenCalled();
      await d.destroy();
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
      await device.inputPrimitives.keyboard.keyboardPress(key);
      expect(mockHdc.keyEvent).toHaveBeenCalledWith(code);
    });

    it('should map Home to string "Home"', async () => {
      await device.inputPrimitives.keyboard.keyboardPress('Home');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('Home');
    });

    it('should normalize case-insensitive key names', async () => {
      await device.inputPrimitives.keyboard.keyboardPress('enter');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2054');
    });

    it('should normalize aliases (esc -> Escape)', async () => {
      await device.inputPrimitives.keyboard.keyboardPress('esc');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2070');
    });

    it('should normalize arrow aliases (up -> ArrowUp)', async () => {
      await device.inputPrimitives.keyboard.keyboardPress('up');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2012');
    });

    it('should normalize arrow aliases (down/left/right)', async () => {
      await device.inputPrimitives.keyboard.keyboardPress('down');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2013');

      mockHdc.keyEvent.mockClear();
      await device.inputPrimitives.keyboard.keyboardPress('left');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2014');

      mockHdc.keyEvent.mockClear();
      await device.inputPrimitives.keyboard.keyboardPress('right');
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2015');
    });

    it('should pass through unknown keys as-is', async () => {
      await device.inputPrimitives.keyboard.keyboardPress('F5');
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

    it('should send Escape key for hideKeyboard by default', async () => {
      await device.hideKeyboard();
      expect(mockHdc.keyEvent).toHaveBeenCalledWith('2070');
    });

    it('should send Back key for hideKeyboard when back-first is specified', async () => {
      await device.hideKeyboard({ keyboardDismissStrategy: 'back-first' });
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

  describe('terminate', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should force-stop app by bundle name', async () => {
      await device.terminate('com.example.app');
      expect(mockHdc.forceStop).toHaveBeenCalledWith('com.example.app');
    });

    it('should use bundle part when uri contains slash', async () => {
      await device.terminate('com.example.app/MainAbility');
      expect(mockHdc.forceStop).toHaveBeenCalledWith('com.example.app');
    });

    it('should resolve app name mapping before force-stop', async () => {
      device.setAppNameMapping({
        music: 'com.huawei.hmsapp.music',
      });
      await device.terminate('Music');
      expect(mockHdc.forceStop).toHaveBeenCalledWith('com.huawei.hmsapp.music');
    });

    it('should throw on terminate failure', async () => {
      mockHdc.forceStop.mockRejectedValueOnce(new Error('force-stop failed'));
      await expect(device.terminate('com.bad.app')).rejects.toThrow(
        'Failed to terminate com.bad.app',
      );
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

    it('should calculate fling for scroll down (positive deltaY)', async () => {
      await device.scroll(0, 500);
      // For positive deltaY: startY = height/4 = 600, endY = 600 - 500 = 100
      expect(mockHdc.fling).toHaveBeenCalledWith(300, 600, 300, 100, 2000);
    });

    it('should calculate fling for scroll up (negative deltaY)', async () => {
      await device.scroll(0, -500);
      // For negative deltaY: startY = 3/4 * 2400 = 1800, endY = 1800 + 500 = 2300
      expect(mockHdc.fling).toHaveBeenCalledWith(300, 1800, 300, 2300, 2000);
    });

    it('should accept custom speed', async () => {
      await device.scroll(0, 500, 1000);
      expect(mockHdc.fling).toHaveBeenCalledWith(300, 600, 300, 100, 1000);
    });

    it('should clamp endpoint to screen edge margin', async () => {
      // deltaY=9999 clamped to startY=600, endY would be 0 → clamped to 50
      await device.scroll(0, 9999);
      expect(mockHdc.fling).toHaveBeenCalledWith(300, 600, 300, 50, 2000);
    });
  });

  describe('scrollDown / scrollUp', () => {
    beforeEach(async () => {
      mockHdc.getScreenInfo.mockResolvedValue({ width: 1200, height: 2400 });
      device = new HarmonyDevice('test-device-id');
      await device.connect();
    });

    it('scrollDown with startPoint should fling from point upward', async () => {
      await device.scrollDown(500, { left: 600, top: 1200 });
      // endY = max(0, 1200-500) = 700
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 600, 700, 2000);
    });

    it('scrollDown without startPoint should call scroll', async () => {
      await device.scrollDown(500);
      // delegates to scroll(0, 500) -> fling(300, 600, 300, 100, 2000)
      expect(mockHdc.fling).toHaveBeenCalled();
    });

    it('scrollDown without distance should use full height', async () => {
      await device.scrollDown();
      expect(mockHdc.fling).toHaveBeenCalled();
    });

    it('scrollUp with startPoint should fling from point downward', async () => {
      await device.scrollUp(500, { left: 600, top: 1200 });
      // endY = min(2400, 1200+500) = 1700
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 600, 1700, 2000);
    });
  });

  describe('scrollLeft / scrollRight', () => {
    beforeEach(async () => {
      mockHdc.getScreenInfo.mockResolvedValue({ width: 1200, height: 2400 });
      device = new HarmonyDevice('test-device-id');
      await device.connect();
    });

    it('scrollLeft with startPoint should fling right', async () => {
      await device.scrollLeft(400, { left: 600, top: 1200 });
      // endX = min(1200, 600+400) = 1000
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 1000, 1200, 2000);
    });

    it('scrollRight with startPoint should fling left', async () => {
      await device.scrollRight(400, { left: 600, top: 1200 });
      // endX = max(0, 600-400) = 200
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 200, 1200, 2000);
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
      // fling toward bottom of screen (height=2400 - margin=50 = 2350)
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 600, 2350, 2000);
    });

    it('scrollUntilBottom with startPoint should fling multiple times', async () => {
      await device.scrollUntilBottom({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      // fling toward top of screen (margin=50)
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 600, 50, 2000);
    });

    it('scrollUntilTop without startPoint should use scroll', async () => {
      await device.scrollUntilTop();
      // Should call fling 10 times via scroll
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
    });

    it('scrollUntilBottom without startPoint should use scroll', async () => {
      await device.scrollUntilBottom();
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
    });

    it('scrollUntilLeft with startPoint should fling multiple times', async () => {
      await device.scrollUntilLeft({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 1150, 1200, 2000);
    });

    it('scrollUntilRight with startPoint should fling multiple times', async () => {
      await device.scrollUntilRight({ left: 600, top: 1200 });
      expect(mockHdc.fling).toHaveBeenCalledTimes(10);
      expect(mockHdc.fling).toHaveBeenCalledWith(600, 1200, 50, 1200, 2000);
    });
  });

  describe('getDeviceLocalTimeString', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should return device-local time with the default format', async () => {
      mockHdc.shell.mockResolvedValueOnce('2023-10-15T15:37:02\n');

      const result = await device.getDeviceLocalTimeString();

      expect(mockHdc.shell).toHaveBeenCalledWith('date +%Y-%m-%dT%H:%M:%S');
      expect(result).toBe('2023-10-15 15:37:02 (YYYY-MM-DD HH:mm:ss)');
    });

    it('should apply custom format tokens to device-local time', async () => {
      mockHdc.shell.mockResolvedValueOnce('2023-10-15T15:37:02');

      const result = await device.getDeviceLocalTimeString('HH:mm');

      expect(result).toBe('15:37 (HH:mm)');
    });

    it('should throw on invalid device-local time format', async () => {
      mockHdc.shell.mockResolvedValueOnce('not-a-time\n');

      await expect(device.getDeviceLocalTimeString()).rejects.toThrow(
        'Failed to get device local time',
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

    it('should return 16 default actions + platform actions', () => {
      const actions = device.actionSpace();
      expect(actions.length).toBe(16);
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

  // Cross-platform contract for https://github.com/web-infra-dev/midscene/issues/2313:
  // Launch/Terminate on every mobile platform must expose the SAME `uri` field.
  describe('Launch/Terminate action schema contract', () => {
    it('Launch paramSchema is a ZodObject with a `uri: ZodString` field', () => {
      const launchAction = device
        .actionSpace()
        .find((action) => action.name === 'Launch');
      expect(launchAction).toBeDefined();
      expect((launchAction!.paramSchema as any)?._def?.typeName).toBe(
        'ZodObject',
      );
      expect(
        (launchAction!.paramSchema as any).shape?.uri?._def?.typeName,
      ).toBe('ZodString');
    });

    it('Terminate paramSchema is a ZodObject with a `uri: ZodString` field', () => {
      const terminateAction = device
        .actionSpace()
        .find((action) => action.name === 'Terminate');
      expect(terminateAction).toBeDefined();
      expect((terminateAction!.paramSchema as any)?._def?.typeName).toBe(
        'ZodObject',
      );
      expect(
        (terminateAction!.paramSchema as any).shape?.uri?._def?.typeName,
      ).toBe('ZodString');
    });
  });
});
