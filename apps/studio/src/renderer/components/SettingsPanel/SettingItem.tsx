import type { ReactNode } from 'react';

export interface SettingItemProps {
  label: string;
  onClick?: () => void;
  trailingIcon?: ReactNode;
  value?: string;
}

export default function SettingItem({
  label,
  onClick,
  trailingIcon,
  value,
}: SettingItemProps) {
  return (
    <button
      className="flex h-[32px] w-full cursor-pointer items-center justify-between rounded-[10px] border-0 bg-transparent px-[8px] text-left hover:bg-gray-50"
      onClick={onClick}
      type="button"
    >
      <span className="overflow-hidden whitespace-nowrap font-['PingFang_SC'] text-[13px] leading-[22px] text-[#474848]">
        {label}
      </span>
      <div className="flex items-center gap-[12px]">
        {value ? (
          <span className="overflow-hidden whitespace-nowrap font-['PingFang_SC'] text-[13px] leading-[22px] text-[#474848]">
            {value}
          </span>
        ) : null}
        {trailingIcon}
      </div>
    </button>
  );
}
