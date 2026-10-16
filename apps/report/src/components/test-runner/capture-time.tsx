export function formatCaptureTime(value: string, timeZone?: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${milliseconds} (${parts.timeZoneName.replace('GMT', 'UTC')})`;
}

export function CaptureTime({ value }: { value: string }): JSX.Element {
  return (
    <time
      dateTime={value}
      title={`Information is shown as captured at this time. See Events for later completion or cancellation.\nOriginal timestamp: ${value}`}
    >
      {formatCaptureTime(value)}
    </time>
  );
}
