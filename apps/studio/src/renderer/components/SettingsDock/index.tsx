import { assetUrls } from '../../assets';
import { useT } from '../../i18n';
import { MaskedIcon } from '../MaskedIcon';

function EnvIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-text-secondary"
      fill="none"
      viewBox="0 0 16 16"
    >
      <rect
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        width="11"
        x="2.5"
        y="3"
      />
      <path
        d="M5 6.5h6M5 9h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
      />
    </svg>
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
  onEnvClick?: () => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
}

export default function SettingsDock({
  onEnvClick,
  onToggleSettings,
  settingsOpen,
}: SettingsDockProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-[2px]">
      <DockRow
        icon={<EnvIcon />}
        label={t('settings.env')}
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
        label={t('settings.settings')}
        onClick={onToggleSettings}
      />
    </div>
  );
}
