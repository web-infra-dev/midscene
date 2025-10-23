import fs from 'node:fs';
import * as CoreUtils from '@midscene/core/utils';
import * as ImgUtils from '@midscene/shared/img';
import { ADB } from 'appium-adb';
import {
  type Mock,
  type Mocked,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AndroidDevice } from '../../src/device';

// Mock the entire appium-adb module
const createMockAdb = () => ({
  startUri: vi.fn(),
  startApp: vi.fn(),
  activateApp: vi.fn(),
  shell: vi.fn(),
  getScreenDensity: vi.fn(),
  takeScreenshot: vi.fn(),
  pull: vi.fn(),
  inputText: vi.fn(),
  keyevent: vi.fn(),
  clearTextField: vi.fn(),
  hideKeyboard: vi.fn(),
  push: vi.fn(),
  isSoftKeyboardPresent: vi.fn().mockResolvedValue(false),
});

let mockAdbInstance: ReturnType<typeof createMockAdb>;

vi.mock('appium-adb', () => {
  return {
    ADB: vi.fn(() => {
      if (!mockAdbInstance) {
        mockAdbInstance = createMockAdb();
      }
      return mockAdbInstance;
    }),
  };
});

vi.mock('@midscene/core/utils');
vi.mock('@midscene/shared/img');
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
    // Ensure mockAdbInstance is available
    if (!mockAdbInstance) {
      mockAdbInstance = createMockAdb();
    }
    // Create a new mock instance for each test
    mockAdb = new (ADB as any)() as Mocked<ADB>;
    device = new AndroidDevice('test-device');
    // Manually assign the mocked adb instance
    vi.spyOn(device, 'getAdb').mockResolvedValue(mockAdb);
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
      vi.spyOn(ImgUtils, 'resizeAndConvertImgBuffer').mockImplementation(
        async (format, buffer) => ({
          buffer,
          format,
        }),
      );
    });

    it('should take screenshot successfully with takeScreenshot', async () => {
      const mockBuffer = Buffer.from('test-screenshot');
      mockAdb.takeScreenshot.mockResolvedValue(mockBuffer);

      // Mock createImgBase64ByFormat
      vi.spyOn(ImgUtils, 'createImgBase64ByFormat').mockReturnValue(
        `data:image/png;base64,${mockBuffer.toString('base64')}`,
      );

      const result = await device.screenshotBase64();
      expect(result).toContain(mockBuffer.toString('base64'));
      expect(mockAdb.shell).not.toHaveBeenCalled();
    });

    it('should fall back to screencap and pull if takeScreenshot fails', async () => {
      mockAdb.takeScreenshot.mockRejectedValue(new Error('fail'));
      const mockBuffer = Buffer.from('fallback-screenshot');
      vi.spyOn(CoreUtils, 'getTmpFile').mockReturnValue('/tmp/test.png');
      (fs.promises.readFile as Mock).mockResolvedValue(mockBuffer);

      // Mock createImgBase64ByFormat
      vi.spyOn(ImgUtils, 'createImgBase64ByFormat').mockReturnValue(
        `data:image/png;base64,${mockBuffer.toString('base64')}`,
      );

      const result = await device.screenshotBase64();

      expect(mockAdb.shell).toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p/),
      );
      expect(mockAdb.pull).toHaveBeenCalled();
      expect(fs.promises.readFile).toHaveBeenCalled();
      expect(result).toContain(mockBuffer.toString('base64'));
      expect(mockAdb.shell).toHaveBeenCalledWith(expect.stringMatching(/rm/));
    });
  });

  describe('mouse', () => {
    it('click should call shell with adjusted coordinates', async () => {
      vi.spyOn(device as any, 'adjustCoordinates').mockReturnValue({
        x: 200,
        y: 300,
      });
      await device.mouseClick(100, 150);
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
      await device.mouseDrag(from, to);
      expect(mockAdb.shell).toHaveBeenCalledWith(
        'input swipe 20 40 60 80 1000',
      );
    });
  });

  describe('keyboard', () => {
    it('type should call inputText for ASCII text', async () => {
      device.options = { imeStrategy: 'yadb-for-non-ascii' };
      vi.spyOn(device as any, 'ensureYadb').mockResolvedValue(undefined);
      mockAdb.isSoftKeyboardPresent.mockResolvedValue({
        isKeyboardShown: false,
        canCloseKeyboard: true,
      }); // keyboard already hidden
      await device.keyboardType('hello');
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
      await device.keyboardType('hello');
      expect(mockAdb.inputText).toHaveBeenCalledWith('hello');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(111); // ESC key
    });

    it('press should call keyevent for mapped keys', async () => {
      await device.keyboardPress('Enter');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(66);
    });

    it('press should handle case-insensitive key names', async () => {
      // Test lowercase keys
      await device.keyboardPress('enter');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(66);

      await device.keyboardPress('escape');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(111);

      await device.keyboardPress('tab');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(61);

      // Test uppercase keys (should still work)
      await device.keyboardPress('ENTER');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(66);

      await device.keyboardPress('ESCAPE');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(111);
    });

    it('press should handle arrow key variations', async () => {
      // Test full arrow key names (lowercase)
      await device.keyboardPress('arrowup');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(19);

      await device.keyboardPress('arrowdown');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(20);

      // Test short arrow key names
      await device.keyboardPress('up');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(19);

      await device.keyboardPress('down');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(20);

      await device.keyboardPress('left');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(21);

      await device.keyboardPress('right');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(22);
    });

    it('press should handle common key abbreviations', async () => {
      // Test 'esc' as abbreviation for 'Escape'
      await device.keyboardPress('esc');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(111);

      await device.keyboardPress('ESC');
      expect(mockAdb.keyevent).toHaveBeenCalledWith(111);
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

        await device.keyboardType('hello');

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

        await device.keyboardType('hello');

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

        await device.keyboardType('hello');

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
        await device.keyboardType('hello', { autoDismissKeyboard: false });

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

        await device.keyboardType('hello');

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

        await device.keyboardType('hello');

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

        await device.keyboardType('hello');

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

        await device.keyboardType('hello');

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
        await device.keyboardType('hello', {
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
        await device.keyboardType('hello', { autoDismissKeyboard: true });

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

        await device.keyboardType('hello');

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

    it('scrollUp should call scroll with negative Y delta', async () => {
      const wheelSpy = vi
        .spyOn(device as any, 'scroll')
        .mockResolvedValue(undefined);
      await device.scrollUp(100);
      expect(wheelSpy).toHaveBeenCalledWith(0, -100);
    });

    it('scrollDown should call scroll with positive Y delta', async () => {
      const wheelSpy = vi
        .spyOn(device as any, 'scroll')
        .mockResolvedValue(undefined);
      await device.scrollDown(100);
      expect(wheelSpy).toHaveBeenCalledWith(0, 100);
    });

    describe('scroll input validation', () => {
      it('should throw error when both deltaX and deltaY are zero', async () => {
        await expect((device as any).scroll(0, 0)).rejects.toThrow(
          'Scroll distance cannot be zero in both directions',
        );
      });

      it('should allow scrolling with non-zero deltaX and zero deltaY', async () => {
        vi.spyOn(device as any, 'adjustCoordinates')
          .mockReturnValueOnce({ x: 270, y: 480 })
          .mockReturnValueOnce({ x: 540, y: 480 });

        await expect((device as any).scroll(100, 0)).resolves.not.toThrow();

        expect(mockAdb.shell).toHaveBeenCalledWith(
          expect.stringContaining('input swipe'),
        );
      });

      it('should allow scrolling with zero deltaX and non-zero deltaY', async () => {
        vi.spyOn(device as any, 'adjustCoordinates')
          .mockReturnValueOnce({ x: 270, y: 480 })
          .mockReturnValueOnce({ x: 270, y: 240 });

        await expect((device as any).scroll(0, 100)).resolves.not.toThrow();

        expect(mockAdb.shell).toHaveBeenCalledWith(
          expect.stringContaining('input swipe'),
        );
      });

      it('should allow scrolling with both deltaX and deltaY non-zero', async () => {
        vi.spyOn(device as any, 'adjustCoordinates')
          .mockReturnValueOnce({ x: 270, y: 480 })
          .mockReturnValueOnce({ x: 540, y: 240 });

        await expect((device as any).scroll(50, 75)).resolves.not.toThrow();

        expect(mockAdb.shell).toHaveBeenCalledWith(
          expect.stringContaining('input swipe'),
        );
      });
    });

    describe('calculateScrollEndPoint', () => {
      it('should calculate end point for horizontal scroll within bounds', () => {
        const start = { x: 100, y: 200 };
        const deltaX = 50;
        const deltaY = 0;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 150, y: 200 });
      });

      it('should calculate end point for vertical scroll within bounds', () => {
        const start = { x: 100, y: 200 };
        const deltaX = 0;
        const deltaY = 100;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 100, y: 300 });
      });

      it('should limit scroll to screen boundaries - right edge', () => {
        const start = { x: 1000, y: 200 };
        const deltaX = 200; // Would go beyond maxWidth
        const deltaY = 0;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 1080, y: 200 }); // Capped at maxWidth
      });

      it('should limit scroll to screen boundaries - left edge', () => {
        const start = { x: 100, y: 200 };
        const deltaX = -200; // Would go beyond left edge
        const deltaY = 0;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 0, y: 200 }); // Capped at 0
      });

      it('should limit scroll to screen boundaries - bottom edge', () => {
        const start = { x: 100, y: 1800 };
        const deltaX = 0;
        const deltaY = 300; // Would go beyond maxHeight
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 100, y: 1920 }); // Capped at maxHeight
      });

      it('should limit scroll to screen boundaries - top edge', () => {
        const start = { x: 100, y: 100 };
        const deltaX = 0;
        const deltaY = -200; // Would go beyond top edge
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 100, y: 0 }); // Capped at 0
      });

      it('should maintain minimum scroll distance when available space is large', () => {
        const start = { x: 500, y: 500 };
        const deltaX = 10; // Small delta, but current logic doesn't enforce minimum
        const deltaY = 0;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        // Current implementation doesn't enforce minimum scroll distance
        // when delta is smaller than minimum, it just uses the delta
        expect(result.x).toBe(start.x + deltaX);
        expect(result.y).toBe(start.y);
      });

      it('should respect available space when smaller than minimum scroll distance', () => {
        const start = { x: 1070, y: 200 }; // Very close to right edge
        const deltaX = 50;
        const deltaY = 0;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        // Should only move to the edge, not enforce minimum distance
        expect(result).toEqual({ x: 1080, y: 200 });
      });

      it('should handle diagonal scrolling correctly', () => {
        const start = { x: 100, y: 100 };
        const deltaX = 50;
        const deltaY = 75;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 150, y: 175 });
      });

      it('should handle negative deltas correctly', () => {
        const start = { x: 500, y: 600 };
        const deltaX = -100;
        const deltaY = -150;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 400, y: 450 });
      });

      it('should not modify coordinates when delta is zero', () => {
        const start = { x: 500, y: 600 };
        const deltaX = 0;
        const deltaY = 0;
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 500, y: 600 });
      });

      it('should handle edge case when start point is at boundary', () => {
        const start = { x: 0, y: 0 };
        const deltaX = -50; // Trying to scroll left from left edge
        const deltaY = -50; // Trying to scroll up from top edge
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 0, y: 0 }); // Should stay at boundary
      });

      it('should handle edge case when start point is at max boundary', () => {
        const start = { x: 1080, y: 1920 };
        const deltaX = 50; // Trying to scroll right from right edge
        const deltaY = 50; // Trying to scroll down from bottom edge
        const maxWidth = 1080;
        const maxHeight = 1920;

        const result = (device as any).calculateScrollEndPoint(
          start,
          deltaX,
          deltaY,
          maxWidth,
          maxHeight,
        );

        expect(result).toEqual({ x: 1080, y: 1920 }); // Should stay at boundary
      });
    });

    describe('scroll methods with calculateScrollEndPoint integration', () => {
      beforeEach(() => {
        vi.spyOn(device as any, 'mouseDrag').mockResolvedValue(undefined);
      });

      it('scrollDown with startPoint should use calculateScrollEndPoint', async () => {
        const startPoint = { left: 100, top: 200 };
        const scrollDistance = 300;

        const calculateScrollEndPointSpy = vi.spyOn(
          device as any,
          'calculateScrollEndPoint',
        );

        await device.scrollDown(scrollDistance, startPoint);

        expect(calculateScrollEndPointSpy).toHaveBeenCalledWith(
          { x: 100, y: 200 },
          0,
          -scrollDistance,
          0,
          1920, // height from mocked size()
        );
      });

      it('scrollUp with startPoint should use calculateScrollEndPoint', async () => {
        const startPoint = { left: 100, top: 200 };
        const scrollDistance = 300;

        const calculateScrollEndPointSpy = vi.spyOn(
          device as any,
          'calculateScrollEndPoint',
        );

        await device.scrollUp(scrollDistance, startPoint);

        expect(calculateScrollEndPointSpy).toHaveBeenCalledWith(
          { x: 100, y: 200 },
          0,
          scrollDistance,
          0,
          1920, // height from mocked size()
        );
      });

      it('scrollLeft with startPoint should use calculateScrollEndPoint', async () => {
        const startPoint = { left: 100, top: 200 };
        const scrollDistance = 150;

        const calculateScrollEndPointSpy = vi.spyOn(
          device as any,
          'calculateScrollEndPoint',
        );

        await device.scrollLeft(scrollDistance, startPoint);

        expect(calculateScrollEndPointSpy).toHaveBeenCalledWith(
          { x: 100, y: 200 },
          scrollDistance,
          0,
          1080, // width from mocked size()
          0,
        );
      });

      it('scrollRight with startPoint should use calculateScrollEndPoint', async () => {
        const startPoint = { left: 100, top: 200 };
        const scrollDistance = 150;

        const calculateScrollEndPointSpy = vi.spyOn(
          device as any,
          'calculateScrollEndPoint',
        );

        await device.scrollRight(scrollDistance, startPoint);

        expect(calculateScrollEndPointSpy).toHaveBeenCalledWith(
          { x: 100, y: 200 },
          -scrollDistance,
          0,
          1080, // width from mocked size()
          0,
        );
      });

      it('scrollDown with startPoint should call mouseDrag with calculated end point', async () => {
        const startPoint = { left: 100, top: 200 };
        const scrollDistance = 300;
        const mockEndPoint = { x: 100, y: 100 }; // Mocked calculated end point

        vi.spyOn(device as any, 'calculateScrollEndPoint').mockReturnValue(
          mockEndPoint,
        );

        await device.scrollDown(scrollDistance, startPoint);

        expect((device as any).mouseDrag).toHaveBeenCalledWith(
          { x: 100, y: 200 },
          mockEndPoint,
        );
      });

      it('scrollUp with startPoint should call mouseDrag with calculated end point', async () => {
        const startPoint = { left: 150, top: 400 };
        const scrollDistance = 200;
        const mockEndPoint = { x: 150, y: 600 }; // Mocked calculated end point

        vi.spyOn(device as any, 'calculateScrollEndPoint').mockReturnValue(
          mockEndPoint,
        );

        await device.scrollUp(scrollDistance, startPoint);

        expect((device as any).mouseDrag).toHaveBeenCalledWith(
          { x: 150, y: 400 },
          mockEndPoint,
        );
      });

      it('scrollLeft with startPoint should call mouseDrag with calculated end point', async () => {
        const startPoint = { left: 500, top: 300 };
        const scrollDistance = 100;
        const mockEndPoint = { x: 600, y: 300 }; // Mocked calculated end point

        vi.spyOn(device as any, 'calculateScrollEndPoint').mockReturnValue(
          mockEndPoint,
        );

        await device.scrollLeft(scrollDistance, startPoint);

        expect((device as any).mouseDrag).toHaveBeenCalledWith(
          { x: 500, y: 300 },
          mockEndPoint,
        );
      });

      it('scrollRight with startPoint should call mouseDrag with calculated end point', async () => {
        const startPoint = { left: 200, top: 250 };
        const scrollDistance = 80;
        const mockEndPoint = { x: 120, y: 250 }; // Mocked calculated end point

        vi.spyOn(device as any, 'calculateScrollEndPoint').mockReturnValue(
          mockEndPoint,
        );

        await device.scrollRight(scrollDistance, startPoint);

        expect((device as any).mouseDrag).toHaveBeenCalledWith(
          { x: 200, y: 250 },
          mockEndPoint,
        );
      });

      it('scroll methods should use default scroll distance when not provided', async () => {
        const startPoint = { left: 100, top: 200 };

        const calculateScrollEndPointSpy = vi.spyOn(
          device as any,
          'calculateScrollEndPoint',
        );

        // scrollDown without distance should use screen height
        await device.scrollDown(undefined, startPoint);

        expect(calculateScrollEndPointSpy).toHaveBeenCalledWith(
          { x: 100, y: 200 },
          0,
          -1920, // negative screen height for scrollDown
          0,
          1920,
        );
      });
    });
  });

  describe('displayId', () => {
    let deviceWithDisplay: AndroidDevice;

    const setupMockAdb = (adbInstance: any) => {
      adbInstance.shell.mockImplementation((cmd: string) => {
        if (cmd.includes('wm size')) {
          return Promise.resolve('Physical size: 1080x1920');
        }
        if (cmd.includes('dumpsys') && cmd.includes('input')) {
          return Promise.resolve('SurfaceOrientation: 0');
        }
        if (cmd.includes('dumpsys SurfaceFlinger --display-id')) {
          return Promise.resolve(
            'Display 4630946423637606531 (HWC display 1): valid=true\n',
          );
        }
        if (cmd.includes('dumpsys display')) {
          return Promise.resolve(
            'DisplayInfo{real 1080 x 1920, rotation 0, density 420, uniqueId "local:4630946423637606531"}\n',
          );
        }
        if (cmd.includes('screencap')) {
          return Promise.resolve('');
        }
        if (cmd.includes('rm')) {
          return Promise.resolve('');
        }
        return Promise.resolve('');
      });
      adbInstance.getScreenDensity.mockResolvedValue(420);
      adbInstance.pull.mockResolvedValue(undefined);
    };

    beforeEach(() => {
      vi.spyOn(
        AndroidDevice.prototype as any,
        'getScreenSize',
      ).mockResolvedValue({
        physical: '1080x1920',
        override: '',
        orientation: 0,
      });
    });

    afterEach(() => {
      if (deviceWithDisplay) {
        deviceWithDisplay.destroy();
      }
      vi.restoreAllMocks();
    });

    describe('displayId', () => {
      let deviceWithDisplay: AndroidDevice;

      const setupMockAdb = (adbInstance: any) => {
        adbInstance.shell.mockImplementation((cmd: string) => {
          if (cmd.includes('wm size')) {
            return Promise.resolve('Physical size: 1080x1920');
          }
          if (cmd.includes('dumpsys') && cmd.includes('input')) {
            return Promise.resolve('SurfaceOrientation: 0');
          }
          if (cmd.includes('dumpsys SurfaceFlinger --display-id')) {
            return Promise.resolve(
              'Display 4630946423637606531 (HWC display 1): valid=true\n',
            );
          }
          if (cmd.includes('dumpsys display')) {
            return Promise.resolve(
              'DisplayInfo{real 1080 x 1920, rotation 0, density 420, uniqueId "local:4630946423637606531"}\n',
            );
          }
          if (cmd.includes('screencap')) {
            return Promise.resolve('');
          }
          if (cmd.includes('rm')) {
            return Promise.resolve('');
          }
          return Promise.resolve('');
        });
        adbInstance.getScreenDensity.mockResolvedValue(420);
        adbInstance.pull.mockResolvedValue(undefined);
      };

      beforeEach(() => {
        vi.spyOn(
          AndroidDevice.prototype as any,
          'getScreenSize',
        ).mockResolvedValue({
          physical: '1080x1920',
          override: '',
          orientation: 0,
        });
      });

      afterEach(() => {
        if (deviceWithDisplay) {
          deviceWithDisplay.destroy();
        }
        vi.restoreAllMocks();
      });

      it('should include display argument in shell commands when displayId is set', async () => {
        deviceWithDisplay = new AndroidDevice('test-device', {
          displayId: 2,
        });

        // Setup mock using global mockAdbInstance
        setupMockAdb(mockAdbInstance);

        vi.spyOn(deviceWithDisplay, 'getAdb').mockResolvedValue(
          mockAdbInstance as any,
        );

        // Set device pixel ratio for coordinate adjustment
        (deviceWithDisplay as any).devicePixelRatio = 1;

        // Test mouse click command
        await deviceWithDisplay.mouseClick(100, 200);
        expect(mockAdbInstance.shell).toHaveBeenCalledWith(
          expect.stringContaining('input -d 2 swipe'),
        );
      });
    });

    it('should not include display argument in shell commands when displayId is not set', async () => {
      deviceWithDisplay = new AndroidDevice('test-device');

      // Setup mock using global mockAdbInstance
      setupMockAdb(mockAdbInstance);

      // Manually assign the mocked adb instance to bypass initialization
      (deviceWithDisplay as any).adb = mockAdbInstance;
      (deviceWithDisplay as any).connectingAdb =
        Promise.resolve(mockAdbInstance);

      // Set device pixel ratio for coordinate adjustment
      (deviceWithDisplay as any).devicePixelRatio = 1;

      // Test mouse click command
      await deviceWithDisplay.mouseClick(100, 200);
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        expect.stringContaining('input swipe'),
      );
      expect(mockAdbInstance.shell).not.toHaveBeenCalledWith(
        expect.stringContaining('input -d'),
      );
    });

    it('should call dumpsys SurfaceFlinger with correct display ID for getPhysicalDisplayId', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 1,
      });

      setupMockAdb(mockAdbInstance);
      await deviceWithDisplay.getAdb();

      // Call a method that would trigger getPhysicalDisplayId
      const physicalDisplayIdMethod = (
        deviceWithDisplay as any
      ).getPhysicalDisplayId.bind(deviceWithDisplay);
      const result = await physicalDisplayIdMethod();

      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        'dumpsys SurfaceFlinger --display-id 1',
      );
      expect(result).toBe('4630946423637606531');
    });

    it('should use display-specific size when displayId is set', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 1,
      });

      setupMockAdb(mockAdbInstance);
      await deviceWithDisplay.getAdb();

      const size = await deviceWithDisplay.size();

      expect(mockAdbInstance.shell).toHaveBeenCalledWith('dumpsys display');
      expect(size.width).toBe(411); // 1080 / (420/160) ≈ 411
      expect(size.height).toBe(731); // 1920 / (420/160) ≈ 731
      // dpr is no longer returned in size()
    });

    it('should use display ID for screenshots by default when displayId is set', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 1,
      });

      setupMockAdb(mockAdbInstance);

      // Mock the scenario where takeScreenshot fails and we fall back to shell screencap
      mockAdbInstance.takeScreenshot.mockRejectedValue(
        new Error('Display 1 requires shell screencap'),
      );

      await deviceWithDisplay.getAdb();

      // Mock fs.promises.readFile to return a valid PNG buffer
      const mockBuffer = Buffer.from('fake-png-data');
      (fs.promises.readFile as any).mockResolvedValue(mockBuffer);

      // Mock image utilities
      (ImgUtils.isValidPNGImageBuffer as any).mockReturnValue(true);
      (ImgUtils.resizeAndConvertImgBuffer as any).mockResolvedValue({
        buffer: mockBuffer,
        format: 'png' as const,
      });
      (ImgUtils.createImgBase64ByFormat as any).mockReturnValue(
        'data:image/png;base64,fake-data',
      );

      await deviceWithDisplay.screenshotBase64();

      // Verify that screencap command uses the display ID by default
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p -d 1/),
      );
      expect(mockAdbInstance.shell).not.toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p -d 4630946423637606531/),
      );
    });

    it('should use physical display ID for screenshots when usePhysicalDisplayIdForScreenshot is true', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 1,
        usePhysicalDisplayIdForScreenshot: true,
      });

      setupMockAdb(mockAdbInstance);

      // Mock the scenario where takeScreenshot fails and we fall back to shell screencap
      mockAdbInstance.takeScreenshot.mockRejectedValue(
        new Error('Display 1 requires shell screencap'),
      );

      await deviceWithDisplay.getAdb();

      // Mock fs.promises.readFile to return a valid PNG buffer
      const mockBuffer = Buffer.from('fake-png-data');
      (fs.promises.readFile as any).mockResolvedValue(mockBuffer);

      // Mock image utilities
      (ImgUtils.isValidPNGImageBuffer as any).mockReturnValue(true);
      (ImgUtils.resizeAndConvertImgBuffer as any).mockResolvedValue({
        buffer: mockBuffer,
        format: 'png' as const,
      });
      (ImgUtils.createImgBase64ByFormat as any).mockReturnValue(
        'data:image/png;base64,fake-data',
      );

      await deviceWithDisplay.screenshotBase64();

      // Verify that screencap command uses the physical display ID
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p -d 4630946423637606531/),
      );
    });

    it('should use display ID for screenshots when usePhysicalDisplayIdForScreenshot is false', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 2,
        usePhysicalDisplayIdForScreenshot: false,
      });

      setupMockAdb(mockAdbInstance);

      // Mock the scenario where takeScreenshot fails and we fall back to shell screencap
      mockAdbInstance.takeScreenshot.mockRejectedValue(
        new Error('Display 2 requires shell screencap'),
      );

      // Manually assign the mocked adb instance
      (deviceWithDisplay as any).adb = mockAdbInstance;
      (deviceWithDisplay as any).connectingAdb =
        Promise.resolve(mockAdbInstance);

      // Mock fs.promises.readFile to return a valid PNG buffer
      const mockBuffer = Buffer.from('fake-png-data');
      (fs.promises.readFile as any).mockResolvedValue(mockBuffer);

      // Mock image utilities
      (ImgUtils.isValidPNGImageBuffer as any).mockReturnValue(true);
      (ImgUtils.resizeAndConvertImgBuffer as any).mockResolvedValue({
        buffer: mockBuffer,
        format: 'png' as const,
      });
      (ImgUtils.createImgBase64ByFormat as any).mockReturnValue(
        'data:image/png;base64,fake-data',
      );

      // Mock size method
      vi.spyOn(deviceWithDisplay, 'size').mockResolvedValue({
        width: 1080,
        height: 1920,
        dpr: 2,
      });

      await deviceWithDisplay.screenshotBase64();

      // Verify that screencap command uses the display ID (2), not the long one
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p -d 2/),
      );
      expect(mockAdbInstance.shell).not.toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p -d 4630946423637606531/),
      );
    });

    it('should handle keyboard operations with display argument when displayId is set', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 2,
        imeStrategy: 'yadb-for-non-ascii', // Use strategy that will call inputText for ASCII
      });

      setupMockAdb(mockAdbInstance);

      // Manually assign the mocked adb instance
      (deviceWithDisplay as any).adb = mockAdbInstance;
      (deviceWithDisplay as any).connectingAdb =
        Promise.resolve(mockAdbInstance);

      // Mock ensureYadb method
      vi.spyOn(deviceWithDisplay as any, 'ensureYadb').mockResolvedValue(
        undefined,
      );

      // Mock keyboard state management
      let keyboardHidden = false;
      mockAdbInstance.isSoftKeyboardPresent.mockImplementation(() => {
        return Promise.resolve({
          isKeyboardShown: !keyboardHidden,
          canCloseKeyboard: true,
        });
      });

      mockAdbInstance.keyevent.mockImplementation(() => {
        keyboardHidden = true;
        return Promise.resolve();
      });

      await deviceWithDisplay.keyboardType('test');

      expect(mockAdbInstance.inputText).toHaveBeenCalledWith('test');
      expect(mockAdbInstance.keyevent).toHaveBeenCalledWith(111); // ESC key for hiding keyboard
    });

    it('should handle back, home, and recentApps operations with display argument', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 1,
      });

      setupMockAdb(mockAdbInstance);
      await deviceWithDisplay.getAdb();
      mockAdbInstance.shell.mockClear();

      await deviceWithDisplay.back();
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        'input -d 1 keyevent 4',
      );

      await deviceWithDisplay.home();
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        'input -d 1 keyevent 3',
      );

      await deviceWithDisplay.recentApps();
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        'input -d 1 keyevent 187',
      );
    });

    it('should handle long press operations with display argument', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        displayId: 2,
      });

      setupMockAdb(mockAdbInstance);

      // Manually assign the mocked adb instance to bypass initialization
      (deviceWithDisplay as any).adb = mockAdbInstance;
      (deviceWithDisplay as any).connectingAdb =
        Promise.resolve(mockAdbInstance);

      // Set device pixel ratio for coordinate adjustment
      (deviceWithDisplay as any).devicePixelRatio = 1;

      await deviceWithDisplay.longPress(100, 200, 1500);
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        'input -d 2 swipe 100 200 100 200 1500',
      );
    });

    it('should not use display ID for screenshots when displayId is not set', async () => {
      deviceWithDisplay = new AndroidDevice('test-device', {
        usePhysicalDisplayIdForScreenshot: true, // This should be ignored when no displayId
      });

      setupMockAdb(mockAdbInstance);

      // Mock the scenario where takeScreenshot fails and we fall back to shell screencap
      mockAdbInstance.takeScreenshot.mockRejectedValue(
        new Error('takeScreenshot failed'),
      );

      // Manually assign the mocked adb instance
      (deviceWithDisplay as any).adb = mockAdbInstance;
      (deviceWithDisplay as any).connectingAdb =
        Promise.resolve(mockAdbInstance);

      // Mock fs.promises.readFile to return a valid PNG buffer
      const mockBuffer = Buffer.from('fake-png-data');
      (fs.promises.readFile as any).mockResolvedValue(mockBuffer);

      // Mock image utilities
      (ImgUtils.isValidPNGImageBuffer as any).mockReturnValue(true);
      (ImgUtils.resizeAndConvertImgBuffer as any).mockResolvedValue({
        buffer: mockBuffer,
        format: 'png' as const,
      });
      (ImgUtils.createImgBase64ByFormat as any).mockReturnValue(
        'data:image/png;base64,fake-data',
      );

      // Mock size method
      vi.spyOn(deviceWithDisplay, 'size').mockResolvedValue({
        width: 1080,
        height: 1920,
        dpr: 2,
      });

      await deviceWithDisplay.screenshotBase64();

      // Verify that screencap command does not use any display ID (note the extra space)
      expect(mockAdbInstance.shell).toHaveBeenCalledWith(
        expect.stringMatching(
          /screencap -p {2}\/data\/local\/tmp\/midscene_screenshot_/,
        ),
      );
      expect(mockAdbInstance.shell).not.toHaveBeenCalledWith(
        expect.stringMatching(/screencap -p -d/),
      );
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
