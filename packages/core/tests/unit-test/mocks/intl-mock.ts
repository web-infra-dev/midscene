/**
 * Mock file for Intl.DateTimeFormat
 * This mock ensures that getTimeZoneInfo always returns non-China timezone
 */

const originalIntl = global.Intl;

export function mockNonChinaTimeZone() {
  const mockIntl = {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({
        timeZone: 'America/New_York', // Using US timezone as non-China example
      }),
    }),
  };

  // @ts-ignore - Overriding readonly property
  global.Intl = { ...originalIntl, ...mockIntl };
}

export function restoreIntl() {
  // @ts-ignore - Restoring readonly property
  global.Intl = originalIntl;
}
