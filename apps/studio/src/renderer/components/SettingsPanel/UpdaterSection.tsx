import type { UpdateStatus } from '../../../shared/updater-contract';

export interface UpdaterSectionProps {
  status: UpdateStatus;
  appVersion: string | null;
  onDownload: () => void;
  onInstall: () => void;
  onOpenDownloadPage?: () => void;
}

function formatPercent(percent: number): string {
  return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

function InlineUpdateButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    'inline-flex h-[20px] min-w-[48px] cursor-pointer items-center justify-center rounded-[5px] border-0 px-[7px] font-sans text-[12px] font-semibold leading-none transition-colors disabled:cursor-default disabled:opacity-70';
  const tone = 'bg-surface-hover text-text-secondary hover:bg-surface-active';
  return (
    <button
      className={`${base} ${tone}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export default function UpdaterSection({
  status,
  appVersion,
  onDownload,
  onInstall,
  onOpenDownloadPage,
}: UpdaterSectionProps) {
  const versionLabel = appVersion ? `v${appVersion}` : '—';
  const externalDownloadOnly =
    status.state === 'available' && status.externalDownloadOnly === true;
  const updateAction =
    status.state === 'available' ? (
      <InlineUpdateButton
        label="update"
        onClick={
          externalDownloadOnly && onOpenDownloadPage
            ? onOpenDownloadPage
            : onDownload
        }
      />
    ) : status.state === 'downloaded' ? (
      <InlineUpdateButton label="restart" onClick={onInstall} />
    ) : status.state === 'downloading' ? (
      <InlineUpdateButton
        disabled
        label={formatPercent(status.percent)}
        onClick={() => {}}
      />
    ) : null;

  return (
    <div className="flex px-[8px] py-[6px]">
      <div className="flex min-h-[22px] w-full items-center justify-between gap-[12px]">
        <span className="shrink-0 font-sans text-[13px] leading-[22px] text-text-secondary">
          Version
        </span>
        <div className="flex min-w-0 items-center gap-[8px]">
          {updateAction}
          <span className="shrink-0 font-sans text-[12px] leading-[18px] text-text-tertiary">
            {versionLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
