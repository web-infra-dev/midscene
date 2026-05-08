import { useEffect, useRef, useState } from 'react';
import { type StudioLocale, useLocale } from '../../i18n';
import {
  type StudioThemeMode,
  useStudioTheme,
} from '../../theme/ThemeProvider';
import SettingItem from './SettingItem';

const LANGUAGE_OPTIONS: { value: StudioLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
];

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

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[12px] w-[12px] text-text-primary"
      fill="none"
      viewBox="0 0 12 12"
    >
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
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

interface OptionListProps<T extends string> {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}

function OptionList<T extends string>({
  options,
  selected,
  onSelect,
}: OptionListProps<T>) {
  return (
    <div className="flex w-[160px] flex-col rounded-[10px] border border-border-subtle bg-surface-elevated p-[4px] shadow-lg">
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            className={`flex h-[32px] cursor-pointer items-center justify-between rounded-[8px] border-0 px-[8px] text-left ${
              isSelected
                ? 'bg-surface-hover'
                : 'bg-transparent hover:bg-surface-hover'
            }`}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <span className="overflow-hidden whitespace-nowrap font-sans text-[13px] leading-[22px] text-text-secondary">
              {option.label}
            </span>
            {isSelected ? <CheckIcon /> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface SettingsPanelProps {
  className?: string;
  onGithubClick?: () => void;
  onWebsiteClick?: () => void;
}

export default function SettingsPanel({
  className,
  onGithubClick,
  onWebsiteClick,
}: SettingsPanelProps) {
  const { mode, setMode } = useStudioTheme();
  const { t, locale, setLocale, localeLabel } = useLocale();
  const themeOptions: { value: StudioThemeMode; label: string }[] = [
    { value: 'light', label: t('settings.themes.light') },
    { value: 'dark', label: t('settings.themes.dark') },
    { value: 'system', label: t('settings.themes.system') },
  ];
  const themeLabel = t(`settings.themes.${mode}` as const);
  const [openPopover, setOpenPopover] = useState<'language' | 'theme' | null>(
    null,
  );
  const popoverWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPopover) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const wrapper = popoverWrapperRef.current;
      if (
        wrapper &&
        event.target instanceof Node &&
        wrapper.contains(event.target)
      ) {
        return;
      }
      setOpenPopover(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openPopover]);

  const wrapperClassName = ['relative', className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName} ref={popoverWrapperRef}>
      <div className="flex w-[244px] flex-col rounded-[12px] border border-border-subtle bg-surface-elevated p-[6px] shadow-lg">
        <div className="flex flex-col">
          <SettingItem
            label={t('settings.language')}
            onClick={() =>
              setOpenPopover((prev) =>
                prev === 'language' ? null : 'language',
              )
            }
            trailingIcon={<ChevronIcon />}
            value={localeLabel}
          />
          <SettingItem
            label={t('settings.theme')}
            onClick={() =>
              setOpenPopover((prev) => (prev === 'theme' ? null : 'theme'))
            }
            trailingIcon={<ChevronIcon />}
            value={themeLabel}
          />
        </div>

        <div className="my-[4px] h-px w-full bg-divider" />

        <div className="flex flex-col">
          <SettingItem
            label={t('common.github')}
            onClick={onGithubClick}
            trailingIcon={<ExternalLinkIcon />}
          />
          <SettingItem
            label={t('common.website')}
            onClick={onWebsiteClick}
            trailingIcon={<ExternalLinkIcon />}
          />
        </div>
      </div>

      {openPopover === 'language' ? (
        <div className="absolute bottom-0 left-[calc(100%+4px)] z-50">
          <OptionList
            onSelect={(value) => {
              setLocale(value);
              setOpenPopover(null);
            }}
            options={LANGUAGE_OPTIONS}
            selected={locale}
          />
        </div>
      ) : null}

      {openPopover === 'theme' ? (
        <div className="absolute bottom-0 left-[calc(100%+4px)] z-50">
          <OptionList
            onSelect={(value) => {
              setMode(value);
              setOpenPopover(null);
            }}
            options={themeOptions}
            selected={mode}
          />
        </div>
      ) : null}
    </div>
  );
}
