import { useRef } from 'react';
import type { UpdateStatus } from '../../../shared/updater-contract';

const VERSION_CLICKS_TO_OPEN_RUN_DIRECTORY = 5;

export interface UpdaterSectionProps {
  status: UpdateStatus;
  appVersion: string | null;
  onDownload: () => void;
  onInstall: () => void;
  onOpenDownloadPage?: () => void;
  onOpenRunDirectory?: () => void;
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
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
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
  onOpenRunDirectory,
}: UpdaterSectionProps) {
  const versionClickCountRef = useRef(0);
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

  const handleVersionClick = () => {
    if (!onOpenRunDirectory) {
      return;
    }
    versionClickCountRef.current += 1;
    if (versionClickCountRef.current < VERSION_CLICKS_TO_OPEN_RUN_DIRECTORY) {
      return;
    }
    versionClickCountRef.current = 0;
    onOpenRunDirectory();
  };

  return (
    <div
      className="flex cursor-default px-[8px] py-[6px]"
      onClick={handleVersionClick}
    >
      <div className="flex min-h-[22px] w-full items-center justify-between gap-[12px]">
        <span className="shrink-0 font-sans text-[13px] leading-[22px] text-text-secondary">
          Version
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-[8px]">
          {updateAction}
          <span
            className="min-w-0 truncate font-sans text-[12px] leading-[18px] text-text-tertiary"
            title={versionLabel}
          >
            {versionLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
