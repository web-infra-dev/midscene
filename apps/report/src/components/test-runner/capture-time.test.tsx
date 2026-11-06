import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaptureTime, formatCaptureTime } from './capture-time';

describe('information capture time', () => {
  const at = '2026-10-13T03:09:03.241Z';

  it.each([
    ['Asia/Shanghai', '2026-10-13 11:09:03.241 (UTC+8)'],
    ['Asia/Kathmandu', '2026-10-13 08:54:03.241 (UTC+5:45)'],
    ['America/New_York', '2026-10-12 23:09:03.241 (UTC-4)'],
    ['UTC', '2026-10-13 03:09:03.241 (UTC)'],
  ])('shows the date and offset in %s', (zone, expected) => {
    expect(formatCaptureTime(at, zone)).toBe(expected);
  });

  it('uses the viewing environment time zone by default', () => {
    expect(formatCaptureTime(at)).toBe(
      formatCaptureTime(
        at,
        new Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    );
  });

  it('keeps the original timestamp and explanation in the hover hint', () => {
    const html = renderToStaticMarkup(<CaptureTime value={at} />);
    expect(html).toContain(`dateTime="${at}"`);
    expect(html).toContain(`Original timestamp: ${at}`);
    expect(html).toContain(
      'title="Information is shown as captured at this time.',
    );
    expect(html).toContain('See Events for later completion or cancellation.');
    const visible = html.replace(/<[^>]*>/g, '');
    expect(visible).toBe(formatCaptureTime(at));
    expect(visible).not.toContain('See Events');
    expect(visible).not.toContain(at);
  });
});
