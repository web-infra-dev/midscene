import { assetUrls } from '../../assets';
import { MaskedIcon } from '../MaskedIcon';

function EnvIcon({ alert }: { alert?: boolean }) {
  // Use the same env.svg asset that the ModelConfigCard header in the
  // middle area renders, so both surfaces speak the same visual language.
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <MaskedIcon
        className="h-4 w-4 shrink-0 text-text-secondary"
        src={assetUrls.main.env}
      />
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
  title?: string;
}

function DockRow({
  active,
  ariaExpanded,
  icon,
  label,
  onClick,
  title,
}: DockRowProps) {
  return (
    <button
      aria-expanded={ariaExpanded}
      className={`relative flex h-[32px] w-full items-center rounded-lg border-0 px-[8px] text-left transition-colors ${
        active
          ? 'bg-surface-hover dark:bg-white/[0.1]'
          : 'bg-transparent hover:bg-surface-hover dark:hover:bg-white/[0.16]'
      }`}
      onClick={onClick}
      title={title}
      type="button"
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
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
        title="Settings"
      />
    </div>
  );
}
