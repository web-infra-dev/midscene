import { useStudioTheme } from '../../theme/ThemeProvider';
import SettingItem from './SettingItem';

const THEME_LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[12px] w-[12px] text-text-secondary"
      fill="none"
      viewBox="0 0 12 12"
    >
      <path
        d="M4.5 3L7.5 6L4.5 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[12px] w-[12px] text-text-secondary"
      fill="none"
      viewBox="0 0 12 12"
    >
      <path
        d="M7.5 2H10V4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M5 7L10 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M10 7.5V8.8C10 9.46274 9.46274 10 8.8 10H3.2C2.53726 10 2 9.46274 2 8.8V3.2C2 2.53726 2.53726 2 3.2 2H4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export interface SettingsPanelProps {
  className?: string;
  language?: string;
  onEnvConfigClick?: () => void;
  onGithubClick?: () => void;
  onLanguageClick?: () => void;
  onThemeClick?: () => void;
  onWebsiteClick?: () => void;
}

export default function SettingsPanel({
  className,
  language = 'English',
  onEnvConfigClick,
  onGithubClick,
  onLanguageClick,
  onThemeClick,
  onWebsiteClick,
}: SettingsPanelProps) {
  const { mode, cycleMode } = useStudioTheme();
  const panelClassName = [
    'flex h-[220px] w-[244px] flex-col overflow-hidden rounded-[12px] border border-border-subtle bg-surface-elevated p-[6px] shadow-lg',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={panelClassName}>
      <div className="flex flex-col">
        <SettingItem
          label="Language"
          onClick={onLanguageClick}
          trailingIcon={<ChevronIcon />}
          value={language}
        />
        <SettingItem
          label="Theme"
          onClick={cycleMode}
          trailingIcon={<ChevronIcon />}
          value={THEME_LABELS[mode]}
        />
      </div>

      <div className="my-[4px] h-px w-full bg-divider" />

      <div className="flex flex-col">
        <SettingItem
          label="GitHub"
          onClick={onGithubClick}
          trailingIcon={<ExternalLinkIcon />}
        />
        <SettingItem
          label="Website"
          onClick={onWebsiteClick}
          trailingIcon={<ExternalLinkIcon />}
        />
      </div>

      <div className="my-[4px] h-px w-full bg-divider" />

      <div className="flex flex-col">
        <SettingItem
          label="Environment"
          onClick={onEnvConfigClick}
          trailingIcon={<ChevronIcon />}
        />
      </div>
    </div>
  );
}
