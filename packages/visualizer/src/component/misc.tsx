export function timeCostStrElement(timeCost?: number) {
  let str: string;
  if (typeof timeCost !== 'number') {
    str = '- ms';
  } else if (timeCost > 1000) {
    str = `${(timeCost / 1000).toFixed(2)}s`;
  } else {
    str = `${timeCost}ms`;
  }
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: 'tnum',
      }}
    >
      {str}
    </span>
  );
}
