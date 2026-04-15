import { useState } from 'react';
import { assetUrls } from '../../assets';

type DeviceStatus = 'active' | 'idle';

interface DeviceItem {
  id: string;
  label: string;
  status: DeviceStatus;
}

interface SectionItem {
  count?: number;
  countClassName?: string;
  iconSrc?: string;
  key: string;
  label: string;
  devices: DeviceItem[];
}

const sections: SectionItem[] = [
  {
    key: 'android',
    label: 'Android',
    devices: [
      {
        id: 'android-primary',
        label: '三星 Galaxy S26 Ultra',
        status: 'idle',
      },
      {
        id: 'android-1',
        label: '三星 Galaxy S26 Ultra',
        status: 'idle',
      },
      {
        id: 'android-2',
        label: '三星 Galaxy S26 Ultra',
        status: 'idle',
      },
      {
        id: 'android-3',
        label: '三星 Galaxy S26 Ultra',
        status: 'idle',
      },
    ],
  },
  {
    iconSrc: assetUrls.sidebar.ios,
    key: 'ios',
    label: 'iOS',
    devices: [
      {
        id: 'ios-1',
        label: 'iPhone 12 Pro Max',
        status: 'active',
      },
      {
        id: 'ios-2',
        label: 'iPhone 17 Pro',
        status: 'idle',
      },
    ],
  },
  {
    iconSrc: assetUrls.sidebar.computer,
    key: 'computer',
    label: 'Computer',
    devices: [
      {
        id: 'computer-1',
        label: 'Macbook pro 16',
        status: 'idle',
      },
    ],
  },
  {
    count: 0,
    countClassName:
      "absolute left-[155.5px] top-[6px] text-[12px] leading-[20px] font-normal text-[#474848] font-['PingFang_SC']",
    iconSrc: assetUrls.sidebar.harmony,
    key: 'harmony',
    label: 'HarmonyOS',
    devices: [
      {
        id: 'harmony-1',
        label: '华为P50(鸿蒙3.0.0)',
        status: 'idle',
      },
      {
        id: 'harmony-2',
        label: '华为P50(鸿蒙3.0.0)',
        status: 'idle',
      },
    ],
  },
  {
    iconSrc: assetUrls.sidebar.web,
    key: 'web',
    label: 'Web',
    devices: [],
  },
];

function ChevronDown({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg
        aria-hidden="true"
        fill="none"
        height="4"
        viewBox="0 0 8 4"
        width="8"
      >
        <path d="M1 1L4 3L7 1" stroke="#797A7A" />
      </svg>
    </div>
  );
}

function SectionHeader({
  count,
  countClassName,
  iconSrc,
  label,
  onClick,
}: {
  count?: number;
  countClassName?: string;
  iconSrc?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="relative h-8 w-full appearance-none rounded-lg border-0 bg-transparent p-0 text-left hover:bg-black/5"
      onClick={onClick}
      type="button"
    >
      {iconSrc ? (
        <img
          alt=""
          className="absolute left-[15px] top-[8px] h-4 w-4"
          src={iconSrc}
        />
      ) : (
        <div className="absolute left-[15px] top-[8px] h-4 w-4" />
      )}
      <span className="absolute left-[40px] top-[5px] text-[13px] font-medium text-[#474848] leading-[22px]">
        {label}
      </span>
      {typeof count === 'number' ? (
        <span className={countClassName}>{count}</span>
      ) : null}
      <ChevronDown className="absolute left-[204px] top-0 flex h-full w-4 items-center justify-center" />
    </button>
  );
}

function DeviceRow({
  label,
  selected,
  status,
}: DeviceItem & {
  selected: boolean;
}) {
  return (
    <div
      className={`relative h-8 w-full ${
        selected ? 'rounded-[10px] bg-black/5' : 'rounded-lg hover:bg-black/5'
      }`}
    >
      <div className="absolute left-[23px] top-0 h-full w-[1px] bg-[#D9D9D9]" />
      <span
        className={`absolute left-[40px] w-[158px] overflow-hidden whitespace-nowrap text-[13px] ${
          selected
            ? 'top-[4.5px] font-medium leading-[22.1px] text-[#0D0D0D]'
            : 'top-[8px] font-normal leading-[15.7px] text-[#474848]'
        }`}
      >
        {label}
      </span>
      <div className="absolute left-[204px] top-[8px] flex h-4 w-4 items-center justify-center">
        <div
          className={`h-[6px] w-[6px] rounded-full ${
            status === 'active' ? 'bg-[#12B981]' : 'bg-[#B6B6B6]'
          }`}
        />
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    android: true,
    computer: true,
    harmony: true,
    ios: true,
    web: true,
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  return (
    <div className="flex flex-col">
      <div className="relative h-8 w-full rounded-[10px] bg-black/5">
        <img
          alt=""
          className="absolute left-[12px] top-[8px] h-4 w-4"
          src={assetUrls.sidebar.overview}
        />
        <span className="absolute left-[40px] top-[5px] overflow-hidden whitespace-nowrap text-[13px] font-medium text-[#474848] leading-[22px]">
          设备总览
        </span>
      </div>

      <div className="mt-1 flex flex-col">
        <div className="relative h-8 w-full">
          <span className="absolute left-[12px] top-[5px] overflow-hidden whitespace-nowrap text-[13px] font-medium leading-[22px] text-[#9D9FA0]">
            Platform
          </span>
          <span className="absolute left-[204px] top-[6px] font-['PingFang_SC'] text-[12px] font-normal leading-[20px] text-[#474848]">
            4
          </span>
        </div>

        <div className="flex flex-col">
          {sections.map((section) => (
            <div className="flex flex-col" key={section.key}>
              <SectionHeader
                count={section.count}
                countClassName={section.countClassName}
                iconSrc={section.iconSrc}
                label={section.label}
                onClick={() => toggleSection(section.key)}
              />

              {expandedSections[section.key]
                ? section.devices.map((device, index) => (
                    <DeviceRow
                      key={device.id}
                      selected={section.key === 'android' && index === 0}
                      {...device}
                    />
                  ))
                : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SidebarFooter() {
  return (
    <div className="flex flex-col">
      <div className="relative flex h-8 items-center rounded-lg px-3 hover:bg-black/5">
        <img alt="" className="h-4 w-4" src={assetUrls.sidebar.settings} />
        <span className="ml-[6px] font-['PingFang_SC'] text-[13px] font-normal leading-[22px] text-[#474848]">
          设置
        </span>
        <div className="absolute right-[6px] top-[1px] flex items-center gap-[6px]">
          <button
            className="flex h-[30px] min-w-[44px] items-center justify-center rounded-[14px] border border-black/8 bg-white px-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            type="button"
          >
            <span className="overflow-hidden whitespace-nowrap font-['PingFang_SC'] text-[11px] font-medium leading-[20px] text-[#474848]">
              模型
            </span>
          </button>
          <button
            className="flex h-[30px] min-w-[44px] items-center justify-center rounded-[14px] border border-black/8 bg-white px-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            type="button"
          >
            <span className="overflow-hidden whitespace-nowrap text-[11px] font-medium leading-[20px] text-[#474848]">
              环境
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
