export interface ConnectingPreviewProps {
  className?: string;
  iconSrc: string;
  /** Aspect ratio for the device illustration. 'phone' uses a tall 40x80 box;
   * 'desktop' uses a wide 56x56 box matching desktop/web platforms. */
  iconVariant?: 'phone' | 'desktop';
  statusLabel?: string;
}

export default function ConnectingPreview({
  className,
  iconSrc,
  iconVariant = 'desktop',
  statusLabel = 'Preparing device connection...',
}: ConnectingPreviewProps) {
  const rootClassName = [
    'flex h-full w-full items-center justify-center bg-surface',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const iconBoxClass =
    iconVariant === 'phone' ? 'h-[80px] w-[40px]' : 'h-[56px] w-[56px]';

  return (
    <div className={rootClassName}>
      <div className="relative h-[600px] w-[600px]">
        <div className="absolute inset-0 rounded-full border border-divider" />
        <div className="absolute inset-[72px] rounded-full border border-divider opacity-70" />
        <div className="absolute inset-[144px] rounded-full border border-divider opacity-50" />
        <div className="absolute inset-[216px] rounded-full border border-divider opacity-30" />

        <div className="absolute left-1/2 top-[256px] flex -translate-x-1/2 flex-col items-center">
          <img
            alt=""
            aria-hidden="true"
            className={`${iconBoxClass} object-contain`}
            src={iconSrc}
          />

          <span className="mt-[16px] whitespace-nowrap text-center text-[13px] font-medium leading-[12px] text-text-primary">
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
