import fs from 'node:fs';
import * as CoreUtils from '@midscene/core/utils';
import * as ImgUtils from '@midscene/shared/img';
import { ADB } from 'appium-adb';
import {
  type Mocked,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AndroidDevice } from '../../src/page';

// Mock the entire appium-adb module
vi.mock('appium-adb', () => {
  const mockAdb = {
    startUri: vi.fn(),
    startApp: vi.fn(),
    activateApp: vi.fn(),
    shell: vi.fn(),
    getScreenDensity: vi.fn(),
    takeScreenshot: vi.fn(),
    pull: vi.fn(),
    inputText: vi.fn(),
    keyevent: vi.fn(),
    hideKeyboard: vi.fn(),
    push: vi.fn(),
  };
  return {
    ADB: vi.fn(() => mockAdb),
    default: vi.fn(() => mockAdb),
  };
});

vi.mock('@midscene/shared/img');
vi.mock('@midscene/core/utils');
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
  default: {
    promises: {
      readFile: vi.fn(),
    },
  },
}));

describe('AndroidDevice', () => {
  let device: AndroidDevice;
  let mockAdb: Mocked<ADB>;

  beforeEach(() => {
    // Create a new mock instance for each test
    mockAdb = new (ADB as any)() as Mocked<ADB>;
    device = new AndroidDevice('test-device');
    // Manually assign the mocked adb instance
    (device as any).adb = mockAdb;
    (device as any).connectingAdb = Promise.resolve(mockAdb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw error if deviceId is not provided', () => {
    expect(() => new AndroidDevice(undefined as any)).toThrow(
      'deviceId is required for AndroidDevice',
    );
  });

  describe('launch', () => {
    it('should start URI for http/https links', async () => {
      const uri = 'https://example.com';
      await device.launch(uri);
      expect(mockAdb.startUri).toHaveBeenCalledWith(uri);
    });

    it('should start app for package/activity format', async () => {
      const uri = 'com.android.settings/.Settings';
      await device.launch(uri);
      expect(mockAdb.startApp).toHaveBeenCalledWith({
        pkg: 'com.android.settings',
        activity: '.Settings',
      });
    });

    it('should activate app for package name format', async () => {
      const uri = 'com.android.settings';
      await device.launch(uri);
      expect(mockAdb.activateApp).toHaveBeenCalledWith(uri);
    });
  });

  describe('size', () => {
    it('should calculate screen size', async () => {
      vi.spyOn(device as any, 'getScreenSize').mockResolvedValue({
        override: '1080x1920',
        physical: '1080x1920',
        orientation: 0,
      });
      mockAdb.getScreenDensity.mockResolvedValue(320);

      const size1 = await device.size();
      const size2 = await device.size();

      expect(size1).toEqual({ width: 540, height: 960, dpr: 2 });
      expect(size2).toEqual(size1);
      // Caching is removed, so it should be called twice
      expect(
        vi.spyOn(device as any, 'getScreenSize'),
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('getScreenSize', () => {
    it('should use fallback to get orientation when primary method fails', async () => {
      mockAdb.shell.mockImplementation(async (command: string | string[]) => {
        if (Array.isArray(command) && command.join(' ') === 'wm size') {
          return 'Physical size: 1080x1920';
        }
        if (command.includes('dumpsys input')) {
          return 'some other output'; // No match for SurfaceOrientation
        }
        if (command.includes('dumpsys display')) {
          return 'mCurrentOrientation=1';
        }
        return '';
      });

      const screenSize = await (device as any).getScreenSize();
      expect(screenSize.orientation).toBe(1);
      expect(mockAdb.shell).toHaveBeenCalledWith(
        'dumpsys input | grep SurfaceOrientation',
      );
      expect(mockAdb.shell).toHaveBeenCalledWith(
        'dumpsys display | grep mCurrentOrientation',
      );
    });

    it('should get orientation with primary method and not use fallback', async () => {
      mockAdb.shell.mockImplementation(async (command: string | string[]) => {
        if (Array.isArray(command) && command.join(' ') === 'wm size') {
          return 'Physical size: 1080x1920';
        }
        if (command.includes('dumpsys input')) {
          return 'SurfaceOrientation: 2';
        }
        if (command.includes('dumpsys display')) {
          // This should not be called
          return 'mCurrentOrientation=1';
        }
        return '';
      });

      const screenSize = await (device as any).getScreenSize();
      expect(screenSize.orientation).toBe(2);
      expect(mockAdb.shell).toHaveBeenCalledWith(
        'dumpsys input | grep SurfaceOrientation',
      );
      expect(mockAdb.shell).not.toHaveBeenCalledWith(
        'dumpsys display | grep mCurrentOrientation',
      );
    });
  });

  describe('screenshotBase64', () => {
    beforeEach(() => {
      vi.spyOn(device, 'size').mockResolvedValue({
        width: 1080,
        height: 1920,
        dpr: 2,
      });
      vi.spyOn(ImgUtils, 'isValidPNGImageBuffer').mockReturnValue(true);
      vi.spyOn(ImgUtils, 'resizeImg').mockImplementation(
        async (buffer) => buffer,
      );
    });

    it('should take screenshot successfully with takeScreenshot', async () => {
      const mockBuffer = Buffer.from('test-screenshot');
      mockAdb.takeScreenshot.mockResolvedValue(mockBuffer);
      const result = await device.screenshotBase64();
      expect(result).toContain(mockBuffer.toString('base64'));
      expect(mockAdb.shell).not.toHaveBeenCalled();
    });

    it('should fall back to screencap and pull if takeScreenshot fails', async () => {
      mockAdb.takeScreenshot.mockRejectedValue(new Error('fail'));
      const mockBuffer = Buffer.from('fallback-screenshot');
      vi.spyOn(CoreUtils, 'getTmpFile').mockReturnValue('/tmp/test.png');
      (fs.promises.readFile as Mock).mockResolvedValue(mockBuffer);

      const result = await device.screenshotBase64();

      expect(mockAdb.shell).toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p/),
      );
      expect(mockAdb.pull).toHaveBeenCalled();
      expect(fs.promises.readFile).toHaveBeenCalled();
      expect(result).toContain(mockBuffer.toString('base64'));
      expect(mockAdb.shell).toHaveBeenCalledWith(
        expect.stringMatching(/rm -f/),
      );
    });
  });

  describe('mouse', () => {
    it('click should call shell with adjusted coordinates', async () => {
      vi.spyOn(device as any, 'adjustCoordinates').mockReturnValue({
        x: 200,
        y: 300,
      });
      await device.mouse.click(100, 150);
      expect(mockAdb.shell).toHaveBeenCalledWith(
        'input swipe 200 300 200 300 150',
      );
    });

    it('drag should call shell with adjusted coordinates', async () => {
      const from = { x: 10, y: 20 };
      const to = { x: 30, y: 40 };
      vi.spyOn(device as any, 'adjustCoordinates')
        .mockReturnValueOnce({ x: 20, y: 40 })
        .mockReturnValueOnce({ x: 60, y: 80 });
      await device.mouse.drag(from, to);
      expect(mockAdb.shell).toHaveBeenCalledWith('input swipe 20 40 60 80 300');
    });
  });

  describe('keyboard', () => {
    it('type should call inputText for ASCII text', async () => {
      device.options = { imeStrategy: 'yadb-for-non-ascii' };
      vi.spyOn(device as any, 'ensureYadb').mockResolvedValue(undefined);
      await device.keyboard.type('hello');
      expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
      expect(mockAdb.hideKeyboard).toHaveBeenCalled();
    });

    it('press should call keyevent for mapped keys', async () => {
      await device.keyboard.press({ key: 'Enter' });
      expect(mockAdb.keyevent).toHaveBeenCalledWith(66);
    });
  });

  describe('scrolling', () => {
    beforeEach(() => {
      vi.spyOn(device, 'size').mockResolvedValue({
        width: 1080,
        height: 1920,
        dpr: 1,
      });
    });

    it('scrollUp should call mouseWheel with positive Y delta', async () => {
      const wheelSpy = vi
        .spyOn(device as any, 'mouseWheel')
        .mockResolvedValue(undefined);
      await device.scrollUp(100);
      expect(wheelSpy).toHaveBeenCalledWith(0, 100);
    });

    it('scrollDown should call mouseWheel with negative Y delta', async () => {
      const wheelSpy = vi
        .spyOn(device as any, 'mouseWheel')
        .mockResolvedValue(undefined);
      await device.scrollDown(100);
      expect(wheelSpy).toHaveBeenCalledWith(0, -100);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      await device.destroy();
      expect((device as any).adb).toBeNull();
      expect((device as any).destroyed).toBe(true);
    });
  });
});
