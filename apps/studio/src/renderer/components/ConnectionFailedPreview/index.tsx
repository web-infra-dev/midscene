export interface ConnectionFailedPreviewProps {
  adbId?: string;
  className?: string;
  iconSrc: string;
  onReconnect?: () => void;
}

export default function ConnectionFailedPreview({
  adbId,
  className,
  iconSrc,
  onReconnect,
}: ConnectionFailedPreviewProps) {
  const rootClassName = [
    'flex h-full w-full items-center justify-center bg-surface',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      <div className="flex w-[190px] flex-col items-center">
        <div className="flex justify-center">
          <img
            alt=""
            aria-hidden="true"
            className="h-6 w-6 object-contain"
            src={iconSrc}
          />
        </div>

        <div className="mt-[4px] w-[130px] overflow-hidden whitespace-nowrap text-center text-[13px] font-medium leading-[24px] text-text-primary">
          Connection failed
        </div>

        <div className="mt-[4px] w-[190px] text-center text-[12px] leading-[20px] text-text-secondary">
          {adbId
            ? `ADB Device: ${adbId}`
            : 'Unable to reconnect to this device.'}
        </div>

        <button
          className="mt-[12px] flex h-8 cursor-pointer items-center justify-center rounded-[8px] bg-surface-muted px-[16px] text-[13px] font-medium leading-[22px] text-text-primary transition-colors hover:bg-surface-hover-strong active:bg-surface-active"
          onClick={onReconnect}
          type="button"
        >
          Reconnect
        </button>
      </div>
    </div>
  );
}
