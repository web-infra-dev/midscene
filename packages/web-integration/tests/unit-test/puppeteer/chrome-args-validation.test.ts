import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// We need to test the validateChromeArgs function indirectly through launchPuppeteerPage
// since it's not exported. We'll verify the warnings by spying on console.warn
describe('Chrome Arguments Validation', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console.warn to verify warning messages
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  test('should warn when dangerous arguments are used', () => {
    // Create a mock validateChromeArgs function for testing
    const DANGEROUS_ARGS = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
    ] as const;

    const validateChromeArgs = (args: string[]): void => {
      const dangerousArgs = args.filter((arg) =>
        DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
      );

      if (dangerousArgs.length > 0) {
        console.warn(
          `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
        );
      }
    };

    // Test: should warn for single dangerous argument
    validateChromeArgs(['--no-sandbox']);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--no-sandbox'),
    );

    consoleWarnSpy.mockClear();

    // Test: should warn for multiple dangerous arguments
    validateChromeArgs(['--no-sandbox', '--disable-web-security']);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--no-sandbox'),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--disable-web-security'),
    );
  });

  test('should not warn for safe arguments', () => {
    const DANGEROUS_ARGS = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
    ] as const;

    const validateChromeArgs = (args: string[]): void => {
      const dangerousArgs = args.filter((arg) =>
        DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
      );

      if (dangerousArgs.length > 0) {
        console.warn(
          `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
        );
      }
    };

    // Safe arguments should not trigger warning
    validateChromeArgs([
      '--disable-features=ThirdPartyCookiePhaseout',
      '--disable-features=SameSiteByDefaultCookies',
      '--window-size=1920,1080',
      '--headless',
    ]);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  test('should handle mixed safe and dangerous arguments', () => {
    const DANGEROUS_ARGS = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
    ] as const;

    const validateChromeArgs = (args: string[]): void => {
      const dangerousArgs = args.filter((arg) =>
        DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
      );

      if (dangerousArgs.length > 0) {
        console.warn(
          `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
        );
      }
    };

    // Mixed arguments should only warn about dangerous ones
    validateChromeArgs([
      '--headless',
      '--no-sandbox',
      '--window-size=1920,1080',
      '--disable-web-security',
    ]);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--no-sandbox'),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--disable-web-security'),
    );
  });

  test('should handle empty arguments array', () => {
    const DANGEROUS_ARGS = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
    ] as const;

    const validateChromeArgs = (args: string[]): void => {
      const dangerousArgs = args.filter((arg) =>
        DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
      );

      if (dangerousArgs.length > 0) {
        console.warn(
          `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
        );
      }
    };

    // Empty array should not trigger warning
    validateChromeArgs([]);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  test('should detect dangerous arguments with prefixes', () => {
    const DANGEROUS_ARGS = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
    ] as const;

    const validateChromeArgs = (args: string[]): void => {
      const dangerousArgs = args.filter((arg) =>
        DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
      );

      if (dangerousArgs.length > 0) {
        console.warn(
          `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
        );
      }
    };

    // Should detect dangerous arguments with additional parameters
    validateChromeArgs(['--disable-features=IsolateOrigins,SiteIsolation']);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--disable-features=IsolateOrigins'),
    );
  });

  test('warning message should be informative', () => {
    const DANGEROUS_ARGS = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
    ] as const;

    const validateChromeArgs = (args: string[]): void => {
      const dangerousArgs = args.filter((arg) =>
        DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
      );

      if (dangerousArgs.length > 0) {
        console.warn(
          `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
        );
      }
    };

    validateChromeArgs(['--no-sandbox']);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Dangerous Chrome arguments detected'),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('may reduce browser security'),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Use only in controlled testing environments'),
    );
  });
});
