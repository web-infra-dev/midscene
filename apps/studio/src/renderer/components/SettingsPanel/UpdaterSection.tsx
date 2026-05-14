import { useMemo } from 'react';
import type {
  UpdateChannel,
  UpdateStatus,
} from '../../../shared/updater-contract';

export interface UpdaterSectionProps {
  status: UpdateStatus;
  appVersion: string | null;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onOpenDownloadPage?: () => void;
}

function formatPercent(percent: number): string {
  return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

function StatusLine({ status }: { status: UpdateStatus }) {
  const text = useMemo(() => {
    switch (status.state) {
      case 'checking':
        return 'Checking for updates…';
      case 'available':
        return `Update available · v${status.version}`;
      case 'downloading':
        return `Downloading v${status.version} · ${formatPercent(status.percent)}`;
      case 'downloaded':
        return `v${status.version} ready to install`;
      case 'not-available':
        return 'Already up to date';
      case 'error':
        return `Update error: ${status.message}`;
      default:
        return null;
    }
  }, [status]);

  if (!text) return null;

  const tone =
    status.state === 'error'
      ? 'text-red-500'
      : status.state === 'available' || status.state === 'downloaded'
        ? 'text-text-primary'
        : 'text-text-tertiary';

  return (
    <output className={`font-sans text-[12px] leading-[18px] ${tone}`}>
      {text}
    </output>
  );
}

function ActionButton({
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const base =
    'inline-flex h-[26px] cursor-pointer items-center justify-center rounded-[6px] border-0 px-[10px] font-sans text-[12px] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const tone = primary
    ? 'bg-text-primary text-surface-elevated hover:opacity-90'
    : 'bg-surface-hover text-text-primary hover:bg-surface-active';
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

function ProgressBar({ percent }: { percent: number }) {
  const width = formatPercent(percent);
  return (
    <div className="h-[4px] w-full overflow-hidden rounded-full bg-surface-hover">
      <div
        className="h-full bg-text-primary transition-[width] duration-150"
        style={{ width }}
      />
    </div>
  );
}

export default function UpdaterSection({
  status,
  appVersion,
  onCheck,
  onDownload,
  onInstall,
  onOpenDownloadPage,
}: UpdaterSectionProps) {
  const versionLabel = appVersion ? `v${appVersion}` : '—';
  const externalDownloadOnly =
    status.state === 'available' && status.externalDownloadOnly === true;

  return (
    <div className="flex flex-col gap-[6px] px-[8px] py-[6px]">
      <div className="flex items-center justify-between">
        <span className="font-sans text-[13px] leading-[22px] text-text-secondary">
          Version
        </span>
        <span className="font-sans text-[12px] leading-[18px] text-text-tertiary">
          {versionLabel}
        </span>
      </div>

      <StatusLine status={status} />

      {status.state === 'downloading' ? (
        <ProgressBar percent={status.percent} />
      ) : null}

      <div className="flex flex-wrap gap-[6px]">
        {status.state === 'available' ? (
          externalDownloadOnly && onOpenDownloadPage ? (
            <ActionButton
              label="Open download page"
              onClick={onOpenDownloadPage}
              primary
            />
          ) : (
            <ActionButton
              label="Download update"
              onClick={onDownload}
              primary
            />
          )
        ) : null}
        {status.state === 'downloaded' ? (
          <ActionButton
            label="Restart to install"
            onClick={onInstall}
            primary
          />
        ) : null}
        <ActionButton
          disabled={
            status.state === 'checking' || status.state === 'downloading'
          }
          label={
            status.state === 'checking' ? 'Checking…' : 'Check for updates'
          }
          onClick={onCheck}
        />
      </div>
    </div>
  );
}

export type { UpdateChannel };
