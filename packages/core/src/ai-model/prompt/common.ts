import type { vlLocateMode } from '@midscene/shared/env';
export function bboxDescription(vlMode: ReturnType<typeof vlLocateMode>) {
  if (vlMode === 'gemini') {
    return '2d bounding box as [ymin, xmin, ymax, xmax]';
  }
  return '2d bounding box as [xmin, ymin, xmax, ymax]';
}

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
