export interface ConnectingPreviewProps {
  className?: string;
  pcSrc: string;
  phoneSrc: string;
  statusLabel?: string;
}

export default function ConnectingPreview({
  className,
  pcSrc,
  phoneSrc,
  statusLabel = 'Preparing device connection...',
}: ConnectingPreviewProps) {
  const rootClassName = [
    'flex h-full w-full items-center justify-center bg-white',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      <div className="relative h-[600px] w-[600px]">
        <div className="absolute inset-0 rounded-full border border-[#E8EDF5]" />
        <div className="absolute inset-[72px] rounded-full border border-[#EEF2F7]" />
        <div className="absolute inset-[144px] rounded-full border border-[#F3F5F9]" />
        <div className="absolute inset-[216px] rounded-full border border-[#F6F7FA]" />

        <div className="absolute left-1/2 top-[256px] flex -translate-x-1/2 flex-col items-center">
          <div className="relative h-[88px] w-[116px]">
            <img
              alt=""
              aria-hidden="true"
              className="absolute left-[4px] top-[30px] h-[44px] w-[69px] object-contain"
              src={pcSrc}
            />
            <img
              alt=""
              aria-hidden="true"
              className="absolute left-[52px] top-0 h-[64px] w-[64px] object-contain"
              src={phoneSrc}
            />
          </div>

          <span className="mt-[16px] whitespace-nowrap text-center text-[13px] font-medium leading-[12px] text-[#0D0D0D]">
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
