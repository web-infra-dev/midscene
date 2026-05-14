import { assetUrls } from '../../assets';
import { MaskedIcon } from '../MaskedIcon';

function EnvIcon({ alert }: { alert?: boolean }) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <svg
        aria-hidden="true"
        className="h-4 w-4 text-text-secondary"
        fill="none"
        viewBox="0 0 16 16"
      >
        <rect
          height="11"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
          width="13"
          x="1.5"
          y="2.5"
        />
        <path
          d="M4 6.5h8M4 9.5h5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
      </svg>
      {alert ? (
        <span
          aria-label="Model config incomplete"
          className="pointer-events-none absolute -right-[2px] -top-[2px] flex h-[8px] w-[8px] items-center justify-center rounded-full border border-surface-elevated bg-[#e13e37]"
          role="img"
        />
      ) : null}
    </span>
  );
}

interface DockRowProps {
  active?: boolean;
  ariaExpanded?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function DockRow({ active, ariaExpanded, icon, label, onClick }: DockRowProps) {
  return (
    <button
      aria-expanded={ariaExpanded}
      className={`relative flex h-[32px] w-full items-center rounded-lg border-0 px-[8px] text-left ${
        active ? 'bg-surface-hover' : 'bg-transparent hover:bg-surface-hover'
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="ml-[6px] overflow-hidden whitespace-nowrap font-sans text-[13px] leading-[22px] text-text-secondary">
        {label}
      </span>
    </button>
  );
}

export interface SettingsDockProps {
  envAlert?: boolean;
  onEnvClick?: () => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
}

export default function SettingsDock({
  envAlert,
  onEnvClick,
  onToggleSettings,
  settingsOpen,
}: SettingsDockProps) {
  return (
    <div className="flex flex-col gap-[2px]">
      <DockRow
        icon={<EnvIcon alert={envAlert} />}
        label="Model Config"
        onClick={onEnvClick}
      />
      <DockRow
        active={settingsOpen}
        ariaExpanded={settingsOpen}
        icon={
          <MaskedIcon
            className="h-4 w-4 shrink-0 text-text-secondary"
            src={assetUrls.sidebar.settings}
          />
        }
        label="Settings"
        onClick={onToggleSettings}
      />
    </div>
  );
}
