export function getTimeZoneInfo(): { timezone: string; isChina: boolean } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset() / 60;

  return {
    timezone: `UTC${offset >= 0 ? '+' : ''}${offset}`,
    isChina: timeZone === 'Asia/Shanghai',
  };
}

export const preferredLanguage = getTimeZoneInfo().isChina
  ? 'Chinese'
  : 'English';
