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
    isSoftKeyboardPresent: vi.fn().mockResolvedValue(false),
  };
  return {
    ADB: vi.fn(() => mockAdb),
    default: vi.fn(() => mockAdb),
  };
});

vi.mock('@midscene/shared/img');
vi.mock('@midscene/core/utils');
vi.mock('node:fs', async (importOriginal) => {
  const original = (await importOriginal()) as {
    default: Record<string, unknown>;
  };
  return {
    ...original,
    promises: {
      readFile: vi.fn(),
    },
    default: {
      ...original.default,
      promises: {
        readFile: vi.fn(),
      },
    },
  };
});

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
      expect(vi.spyOn(device as any, 'getScreenSize')).toHaveBeenCalledTimes(2);
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
      mockAdb.isSoftKeyboardPresent.mockResolvedValue(false); // keyboard already hidden
      await device.keyboard.type('hello');
      expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
      // Since keyboard is already hidden, no keyevent should be called
      expect(mockAdb.isSoftKeyboardPresent).toHaveBeenCalled();
    });

    it('type should hide keyboard when shown', async () => {
      device.options = { imeStrategy: 'yadb-for-non-ascii' };
      vi.spyOn(device as any, 'ensureYadb').mockResolvedValue(undefined);
      // First call returns true (keyboard shown), second returns false (keyboard hidden)
      mockAdb.isSoftKeyboardPresent
        .mockResolvedValueOnce({
          isKeyboardShown: true,
          canCloseKeyboard: true,
        })
        .mockResolvedValueOnce({
          isKeyboardShown: false,
          canCloseKeyboard: true,
        });
      await device.keyboard.type('hello');
      expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(111); // ESC key
    });

    it('press should call keyevent for mapped keys', async () => {
      await device.keyboard.press({ key: 'Enter' });
      expect(mockAdb.keyevent).toHaveBeenCalledWith(66);
    });

    describe('autoDismissKeyboard option', () => {
      beforeEach(() => {
        vi.spyOn(device as any, 'ensureYadb').mockResolvedValue(undefined);
      });

      it('should hide keyboard when autoDismissKeyboard is true (default)', async () => {
        device.options = { imeStrategy: 'yadb-for-non-ascii' };
        mockAdb.isSoftKeyboardPresent
          .mockResolvedValueOnce({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          }) // keyboard shown initially
          .mockResolvedValueOnce({
            isKeyboardShown: false,
            canCloseKeyboard: true,
          }); // keyboard hidden after ESC

        await device.keyboard.type('hello');

        expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
        expect(mockAdb.isSoftKeyboardPresent).toHaveBeenCalled();
        expect(mockAdb.keyevent).toHaveBeenCalledWith(111); // ESC key
      });

      it('should hide keyboard when autoDismissKeyboard is explicitly true', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          autoDismissKeyboard: true,
        };
        mockAdb.isSoftKeyboardPresent
          .mockResolvedValueOnce({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          }) // keyboard shown initially
          .mockResolvedValueOnce({
            isKeyboardShown: false,
            canCloseKeyboard: true,
          }); // keyboard hidden after ESC

        await device.keyboard.type('hello');

        expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
        expect(mockAdb.isSoftKeyboardPresent).toHaveBeenCalled();
        expect(mockAdb.keyevent).toHaveBeenCalledWith(111); // ESC key
      });

      it('should not hide keyboard when autoDismissKeyboard is false', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          autoDismissKeyboard: false,
        };
        mockAdb.isSoftKeyboardPresent.mockClear();
        mockAdb.keyevent.mockClear();

        await device.keyboard.type('hello');

        expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
        expect(mockAdb.isSoftKeyboardPresent).not.toHaveBeenCalled();
        expect(mockAdb.keyevent).not.toHaveBeenCalled();
      });

      it('should respect autoDismissKeyboard option passed to type method', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          autoDismissKeyboard: true,
        };
        mockAdb.isSoftKeyboardPresent.mockClear();
        mockAdb.keyevent.mockClear();

        // Override with false in method call
        await device.keyboard.type('hello', { autoDismissKeyboard: false });

        expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
        expect(mockAdb.isSoftKeyboardPresent).not.toHaveBeenCalled();
        expect(mockAdb.keyevent).not.toHaveBeenCalled();
      });
    });

    describe('keyboardDismissStrategy option', () => {
      beforeEach(() => {
        vi.spyOn(device as any, 'ensureYadb').mockResolvedValue(undefined);
        mockAdb.keyevent.mockClear();
        mockAdb.isSoftKeyboardPresent.mockClear();
      });

      it('should use esc-first strategy by default', async () => {
        device.options = { imeStrategy: 'yadb-for-non-ascii' };
        mockAdb.isSoftKeyboardPresent
          .mockResolvedValueOnce({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          }) // keyboard shown initially
          .mockResolvedValueOnce({
            isKeyboardShown: false,
            canCloseKeyboard: true,
          }); // keyboard hidden after ESC

        await device.keyboard.type('hello');

        expect(mockAdb.keyevent).toHaveBeenCalledWith(111); // ESC key first
        expect(mockAdb.keyevent).toHaveBeenCalledTimes(1);
      });

      it('should use back-first strategy when specified', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          keyboardDismissStrategy: 'back-first',
        };
        mockAdb.isSoftKeyboardPresent
          .mockResolvedValueOnce({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          }) // keyboard shown initially
          .mockResolvedValueOnce({
            isKeyboardShown: false,
            canCloseKeyboard: true,
          }); // keyboard hidden after BACK

        await device.keyboard.type('hello');

        expect(mockAdb.keyevent).toHaveBeenCalledWith(4); // BACK key first
        expect(mockAdb.keyevent).toHaveBeenCalledTimes(1);
      });

      it('should try second key if first fails with esc-first strategy', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          keyboardDismissStrategy: 'esc-first',
        };

        // Mock hideKeyboard to use a small timeout for faster test
        const originalHideKeyboard = (device as any).hideKeyboard.bind(device);
        vi.spyOn(device as any, 'hideKeyboard').mockImplementation(
          async (options) => {
            // Use 150ms timeout to ensure at least one check in the loop
            const result = await originalHideKeyboard(options, 150);
            return result;
          },
        );

        // Mock to simulate: keyboard shown -> ESC fails (stays shown) -> BACK succeeds (hidden)
        let callCount = 0;
        let currentKeyEvent = 0;

        // Track keyevent calls
        mockAdb.keyevent.mockImplementation((keyCode) => {
          currentKeyEvent++;
          return Promise.resolve();
        });

        mockAdb.isSoftKeyboardPresent.mockImplementation(() => {
          callCount++;

          // Initial check - keyboard is shown
          if (callCount === 1) {
            return Promise.resolve({
              isKeyboardShown: true,
              canCloseKeyboard: true,
            });
          }

          // If we're checking after the first key (ESC=111), keyboard stays shown
          if (currentKeyEvent === 1) {
            return Promise.resolve({
              isKeyboardShown: true,
              canCloseKeyboard: true,
            });
          }

          // After second key (BACK=4), keyboard is hidden
          if (currentKeyEvent === 2) {
            return Promise.resolve({
              isKeyboardShown: false,
              canCloseKeyboard: true,
            });
          }

          return Promise.resolve({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          });
        });

        await device.keyboard.type('hello');

        expect(mockAdb.keyevent).toHaveBeenNthCalledWith(1, 111); // ESC first
        expect(mockAdb.keyevent).toHaveBeenNthCalledWith(2, 4); // BACK second
        expect(mockAdb.keyevent).toHaveBeenCalledTimes(2);
      });

      it('should try second key if first fails with back-first strategy', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          keyboardDismissStrategy: 'back-first',
        };

        // Mock hideKeyboard to use a small timeout for faster test
        const originalHideKeyboard = (device as any).hideKeyboard.bind(device);
        vi.spyOn(device as any, 'hideKeyboard').mockImplementation(
          async (options) => {
            // Use 150ms timeout to ensure at least one check in the loop
            const result = await originalHideKeyboard(options, 150);
            return result;
          },
        );

        // Mock to simulate: keyboard shown -> BACK fails (stays shown) -> ESC succeeds (hidden)
        let callCount = 0;
        let currentKeyEvent = 0;

        // Track keyevent calls
        mockAdb.keyevent.mockImplementation((keyCode) => {
          currentKeyEvent++;
          return Promise.resolve();
        });

        mockAdb.isSoftKeyboardPresent.mockImplementation(() => {
          callCount++;

          // Initial check - keyboard is shown
          if (callCount === 1) {
            return Promise.resolve({
              isKeyboardShown: true,
              canCloseKeyboard: true,
            });
          }

          // If we're checking after the first key (BACK=4), keyboard stays shown
          if (currentKeyEvent === 1) {
            return Promise.resolve({
              isKeyboardShown: true,
              canCloseKeyboard: true,
            });
          }

          // After second key (ESC=111), keyboard is hidden
          if (currentKeyEvent === 2) {
            return Promise.resolve({
              isKeyboardShown: false,
              canCloseKeyboard: true,
            });
          }

          return Promise.resolve({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          });
        });

        await device.keyboard.type('hello');

        expect(mockAdb.keyevent).toHaveBeenNthCalledWith(1, 4); // BACK first
        expect(mockAdb.keyevent).toHaveBeenNthCalledWith(2, 111); // ESC second
        expect(mockAdb.keyevent).toHaveBeenCalledTimes(2);
      });

      it('should respect keyboardDismissStrategy option passed to type method', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          keyboardDismissStrategy: 'esc-first',
        };
        mockAdb.isSoftKeyboardPresent
          .mockResolvedValueOnce({
            isKeyboardShown: true,
            canCloseKeyboard: true,
          }) // keyboard shown initially
          .mockResolvedValueOnce({
            isKeyboardShown: false,
            canCloseKeyboard: true,
          }); // keyboard hidden after BACK

        // Override with back-first in method call
        await device.keyboard.type('hello', {
          keyboardDismissStrategy: 'back-first',
        });

        expect(mockAdb.keyevent).toHaveBeenCalledWith(4); // BACK key first (overridden)
        expect(mockAdb.keyevent).toHaveBeenCalledTimes(1);
      });

      it('should log warning if both keys fail to hide keyboard', async () => {
        device.options = {
          imeStrategy: 'yadb-for-non-ascii',
          keyboardDismissStrategy: 'esc-first',
        };
        // Always return true (keyboard always shown)
        mockAdb.isSoftKeyboardPresent.mockResolvedValue({
          isKeyboardShown: true,
          canCloseKeyboard: true,
        });

        // Mock hideKeyboard to use a small timeout for faster test
        const originalHideKeyboard = (device as any).hideKeyboard.bind(device);
        vi.spyOn(device as any, 'hideKeyboard').mockImplementation(
          (options) => originalHideKeyboard(options, 100), // Use 100ms timeout instead of default 1000ms
        );

        // Spy on console.warn to verify warning is logged
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Should not throw error anymore
        await device.keyboard.type('hello', { autoDismissKeyboard: true });

        // Verify warning was logged
        expect(warnSpy).toHaveBeenCalledWith(
          'Warning: Failed to hide the software keyboard after trying both ESC and BACK keys',
        );

        // Clean up
        warnSpy.mockRestore();
      });

      it('should handle keyboard already hidden scenario', async () => {
        device.options = { imeStrategy: 'yadb-for-non-ascii' };
        mockAdb.isSoftKeyboardPresent.mockResolvedValue({
          isKeyboardShown: false,
          canCloseKeyboard: true,
        }); // keyboard already hidden
        mockAdb.keyevent.mockClear();

        await device.keyboard.type('hello');

        expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
        expect(mockAdb.isSoftKeyboardPresent).toHaveBeenCalled();
        expect(mockAdb.keyevent).not.toHaveBeenCalled(); // No key events needed
      });
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
