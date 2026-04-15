import { incutPlaygroundImportAssets } from '../../assets';

interface IncutSidebarNavItemProps {
  count?: string;
  fontWeight?: '400' | '500';
  gap?: number;
  hasArrow?: boolean;
  iconUrl?: string;
  isActive?: boolean;
  isLastSubItem?: boolean;
  isSubItem?: boolean;
  label: string;
  labelHeight?: number;
  labelWidth?: number | string;
  customRadius?: number;
  dotUrl?: string;
}

export function IncutSidebarNavItem({
  count,
  fontWeight = '400',
  gap = 6,
  hasArrow,
  iconUrl,
  isActive,
  isLastSubItem = false,
  isSubItem = false,
  label,
  labelHeight,
  labelWidth = 158,
  customRadius,
  dotUrl,
}: IncutSidebarNavItemProps) {
  const radius = customRadius ?? (isActive ? 10 : 8);

  return (
    <div
      className={[
        "flex h-8 w-[232px] cursor-pointer items-center font-['Inter',_'PingFang_SC'] transition-colors",
        isActive ? 'bg-black/5' : 'hover:bg-black/2',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderRadius: `${radius}px`,
        gap: `${gap}px`,
        paddingLeft: '12px',
        paddingRight: '12px',
      }}
    >
      <div className="relative flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
        {isSubItem ? (
          <>
            <div
              className={`absolute left-[11px] top-0 w-px bg-[#d9d9d9] ${
                isLastSubItem ? 'h-4' : 'h-full'
              }`}
            />
            <div className="absolute left-[11px] top-4 h-px w-[11px] bg-[#d9d9d9]" />
          </>
        ) : iconUrl ? (
          <img alt="" className="h-4 w-4 object-contain" src={iconUrl} />
        ) : null}
      </div>

      <span
        className={[
          'flex items-center overflow-hidden whitespace-nowrap text-[13px] text-ellipsis',
          fontWeight === '500' ? 'font-medium' : 'font-normal',
          isActive ? 'text-[#0d0d0d]' : 'text-[#474848]',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          display: 'flex',
          height: labelHeight ? `${labelHeight}px` : '100%',
          width:
            typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth,
        }}
      >
        {label}
      </span>

      <div className="flex items-center gap-1">
        {count ? (
          <span className="flex h-5 items-center font-['PingFang_SC'] text-[11px] text-[#797a7a]">
            {count}
          </span>
        ) : null}

        {dotUrl ? (
          <img
            alt="status"
            className={
              label === 'iPhone 17 Pro'
                ? 'h-[6px] w-[6px] object-contain'
                : 'h-4 w-4 object-contain'
            }
            src={dotUrl}
          />
        ) : null}

        {hasArrow ? (
          <div className="flex h-1 w-2 items-center justify-center">
            <img
              alt="expand"
              className="h-1 w-2 object-contain"
              src={incutPlaygroundImportAssets.sidebar.navChevron}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
