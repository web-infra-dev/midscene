import type { ReactNode } from 'react';

export interface SettingItemProps {
  label: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  trailingIcon?: ReactNode;
  value?: string;
}

export default function SettingItem({
  label,
  onClick,
  onMouseEnter,
  onMouseLeave,
  trailingIcon,
  value,
}: SettingItemProps) {
  return (
    <button
      className="flex h-[32px] w-full cursor-pointer items-center justify-between rounded-[10px] border-0 bg-transparent px-[8px] text-left hover:bg-surface-hover"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      type="button"
    >
      <span className="overflow-hidden whitespace-nowrap font-sans text-[13px] leading-[22px] text-text-secondary">
        {label}
      </span>
      <div className="flex items-center gap-[12px]">
        {value ? (
          <span className="overflow-hidden whitespace-nowrap font-sans text-[13px] leading-[22px] text-text-secondary">
            {value}
          </span>
        ) : null}
        {trailingIcon}
      </div>
    </button>
  );
}
