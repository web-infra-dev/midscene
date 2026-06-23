interface ModeIconProps {
  className?: string;
}

const recorderModeIconUrl = new URL('./icons/recorder.svg', import.meta.url)
  .href;
const apiPlaygroundModeIconUrl = new URL(
  './icons/api-playground.svg',
  import.meta.url,
).href;

export function RecorderModeIcon({ className }: ModeIconProps) {
  return (
    <img
      alt=""
      className={className}
      draggable={false}
      src={recorderModeIconUrl}
    />
  );
}

export function ApiPlaygroundModeIcon({ className }: ModeIconProps) {
  return (
    <img
      alt=""
      className={className}
      draggable={false}
      src={apiPlaygroundModeIconUrl}
    />
  );
}
