export interface DisconnectedPreviewProps {
  iconSrc: string;
}

export default function DisconnectedPreview({
  iconSrc,
}: DisconnectedPreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-[4px]">
        <img
          alt=""
          aria-hidden="true"
          className="h-6 w-6 object-contain"
          src={iconSrc}
        />
        <h2 className="whitespace-nowrap text-center text-[13px] font-normal leading-[24px] text-text-primary">
          Connect Android Device
        </h2>
      </div>
    </div>
  );
}
