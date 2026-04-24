import { assetUrls } from '../../assets';

function ChevronRight() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-text-tertiary"
      fill="none"
      height="7"
      viewBox="0 0 4 7"
      width="4"
    >
      <path
        d="M0.5 0.5L3.5 3.5L0.5 6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ActionChipProps {
  label: string;
  onClick?: () => void;
}

function ActionChip({ label, onClick }: ActionChipProps) {
  return (
    <button
      className="flex h-[24px] cursor-pointer items-center gap-[4px] rounded-lg border border-border-strong bg-surface-elevated px-[6px] hover:bg-surface-hover"
      onClick={onClick}
      type="button"
    >
      <span className="overflow-hidden whitespace-nowrap text-center font-['PingFang_SC'] text-[11px] leading-[12px] text-text-secondary">
        {label}
      </span>
      <ChevronRight />
    </button>
  );
}

export interface SettingsDockProps {
  onEnvClick?: () => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
}

export default function SettingsDock({
  onEnvClick,
  onToggleSettings,
  settingsOpen,
}: SettingsDockProps) {
  return (
    <div className="flex h-[32px] items-center justify-between gap-[6px]">
      <button
        aria-expanded={settingsOpen}
        className={`relative flex h-[30px] w-[139px] items-center rounded-lg border-0 px-[8px] text-left ${
          settingsOpen
            ? 'bg-surface-hover'
            : 'bg-transparent hover:bg-surface-hover'
        }`}
        onClick={onToggleSettings}
        type="button"
      >
        <img
          alt=""
          className="h-4 w-4 shrink-0"
          src={assetUrls.sidebar.settings}
        />
        <span className="ml-[6px] overflow-hidden whitespace-nowrap font-['PingFang_SC'] text-[13px] leading-[22px] text-text-secondary">
          Settings
        </span>
      </button>

      <div className="flex items-center gap-[4px]">
        <ActionChip label="Env" onClick={onEnvClick} />
      </div>
    </div>
  );
}
