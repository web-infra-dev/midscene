import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const promiseExec = promisify(exec);

interface WindowController {
  minimize(): Promise<void>;
  restore(): Promise<void>;
}

/**
 * macOS window control using AppleScript
 */
class MacOSWindowController implements WindowController {
  async minimize(): Promise<void> {
    try {
      // Use System Events to minimize the frontmost window
      await promiseExec(
        `osascript -e 'tell application "System Events"' -e 'set visible of first process whose frontmost is true to false' -e 'end tell'`,
      );
      console.log('Browser window minimized');
    } catch (error) {
      console.warn('Failed to minimize window:', error);
    }
  }

  async restore(): Promise<void> {
    try {
      // Try to activate common browser names
      const browsers = [
        'Google Chrome',
        'Google Chrome for Testing',
        'Chromium',
        'Safari',
      ];

      for (const browser of browsers) {
        try {
          await promiseExec(
            `osascript -e 'tell application "${browser}"' -e 'activate' -e 'end tell'`,
          );
          console.log('Browser window restored');
          return;
        } catch {
          // Try next browser
        }
      }

      console.warn('Failed to restore window: no browser found');
    } catch (error) {
      console.warn('Failed to restore window:', error);
    }
  }
}

/**
 * Windows window control using PowerShell
 */
class WindowsWindowController implements WindowController {
  async minimize(): Promise<void> {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Window {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
"@
      $hwnd = [Window]::GetForegroundWindow()
      [Window]::ShowWindow($hwnd, 6)  # SW_MINIMIZE = 6
    `;

    try {
      await promiseExec(`powershell -Command "${script.replace(/\n/g, ' ')}"`);
      console.log('Browser window minimized');
    } catch (error) {
      console.warn('Failed to minimize window:', error);
    }
  }

  async restore(): Promise<void> {
    // On Windows, restoring requires knowing the window handle
    // For simplicity, we'll just skip restoration - user can click taskbar
    console.log('Window restore not implemented for Windows');
  }
}

/**
 * Linux window control using xdotool
 */
class LinuxWindowController implements WindowController {
  async minimize(): Promise<void> {
    try {
      // Get active window ID
      const { stdout: windowId } = await promiseExec('xdotool getactivewindow');

      // Minimize the window
      await promiseExec(`xdotool windowminimize ${windowId.trim()}`);
      console.log('Browser window minimized');
    } catch (error) {
      console.warn('Failed to minimize window (xdotool required):', error);
    }
  }

  async restore(): Promise<void> {
    try {
      // Find Chrome/Chromium window and activate it
      await promiseExec(
        'xdotool search --name "Computer Playground" windowactivate',
      );
      console.log('Browser window restored');
    } catch (error) {
      console.warn('Failed to restore window:', error);
    }
  }
}

/**
 * No-op controller for unsupported platforms
 */
class NoOpWindowController implements WindowController {
  async minimize(): Promise<void> {
    console.log('Window control not supported on this platform');
  }

  async restore(): Promise<void> {
    console.log('Window control not supported on this platform');
  }
}

/**
 * Create a window controller based on the current platform
 */
export function createWindowController(): WindowController {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return new MacOSWindowController();
    case 'win32':
      return new WindowsWindowController();
    case 'linux':
      return new LinuxWindowController();
    default:
      return new NoOpWindowController();
  }
}
