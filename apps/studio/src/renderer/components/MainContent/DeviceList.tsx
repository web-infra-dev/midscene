import { assetUrls } from '../../assets';
import type {
  StudioAndroidDeviceItem,
  StudioSidebarDeviceBuckets,
  StudioSidebarPlatformKey,
} from '../../playground/types';

type DeviceConnectionState = 'idle' | 'live' | 'connecting';

interface PlatformConfig {
  iconSrc?: string;
  key: StudioSidebarPlatformKey;
  label: string;
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  { iconSrc: assetUrls.device.android, key: 'android', label: 'Android' },
  { iconSrc: assetUrls.device.ios, key: 'ios', label: 'iOS' },
  { iconSrc: assetUrls.device.computer, key: 'computer', label: 'Computer' },
  { iconSrc: assetUrls.device.harmony, key: 'harmony', label: 'HarmonyOS' },
  { iconSrc: assetUrls.device.web, key: 'web', label: 'Web' },
];

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M6.7 9.3l2.6-2.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M7.2 4.4l1.1-1.1a2.8 2.8 0 0 1 4 4l-1.1 1.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M8.8 11.6l-1.1 1.1a2.8 2.8 0 0 1-4-4l1.1-1.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="animate-spin"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle
        cx="8"
        cy="8"
        opacity="0.25"
        r="6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: DeviceConnectionState }) {
  if (status === 'idle') {
    return null;
  }
  const isLive = status === 'live';
  return (
    <div
      className={`inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full px-[6px] ${
        isLive ? 'bg-status-success-bg' : 'bg-status-info-bg'
      }`}
    >
      <div
        className={`h-[6px] w-[6px] rounded-full ${
          isLive ? 'bg-status-success' : 'bg-status-info'
        }`}
      />
      <span
        className={`font-['Inter'] text-[11px] font-medium leading-[12px] ${
          isLive ? 'text-status-success-fg' : 'text-status-info'
        }`}
      >
        {isLive ? 'Live' : 'Connecting'}
      </span>
    </div>
  );
}

export interface DeviceListProps {
  buckets: StudioSidebarDeviceBuckets;
  connectingDeviceId?: string;
  onConnect?: (
    platform: StudioSidebarPlatformKey,
    device: StudioAndroidDeviceItem,
  ) => void | Promise<void>;
}

function DeviceCard({
  device,
  iconSrc,
  status,
  onConnect,
}: {
  device: StudioAndroidDeviceItem;
  iconSrc?: string;
  status: DeviceConnectionState;
  onConnect?: () => void | Promise<void>;
}) {
  const isConnecting = status === 'connecting';
  const isLive = status === 'live';
  return (
    <button
      className="flex h-[66px] w-[394px] shrink-0 cursor-pointer items-center gap-[12px] rounded-[16px] border border-border-subtle bg-surface-elevated p-[12px] text-left hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isConnecting}
      onClick={() => {
        void onConnect?.();
      }}
      type="button"
    >
      <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[6px] bg-surface">
        {iconSrc ? (
          <img
            alt=""
            className="h-[40px] w-[40px] object-contain"
            src={iconSrc}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-[8px]">
          <span className="overflow-hidden truncate font-['PingFang_SC'] text-[14px] font-medium leading-[22px] text-text-primary">
            {device.label}
          </span>
          <StatusBadge status={status} />
        </div>
        <span className="overflow-hidden truncate font-['Inter'] text-[12px] leading-[20px] text-text-secondary">
          {device.description ?? device.id}
        </span>
      </div>

      <div
        className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center ${
          isConnecting
            ? 'text-status-info'
            : isLive
              ? 'text-status-success-fg'
              : 'text-text-tertiary'
        }`}
      >
        {isConnecting ? <SpinnerIcon /> : <LinkIcon />}
      </div>
    </button>
  );
}

export function DeviceList({
  buckets,
  connectingDeviceId,
  onConnect,
}: DeviceListProps) {
  const sections = PLATFORM_CONFIGS.map((config) => ({
    ...config,
    devices: buckets[config.key],
  }));

  return (
    <div className="flex h-full w-full flex-col gap-[32px] overflow-y-auto px-[118px] pb-[40px] pt-[59px]">
      {sections.map((section) => (
        <div className="flex w-[800px] flex-col gap-[16px]" key={section.key}>
          <span className="font-['Inter'] text-[13px] font-medium leading-[22px] text-text-secondary">
            {section.label}
          </span>
          {section.devices.length === 0 ? (
            <div className="flex h-[66px] w-[394px] items-center justify-center rounded-[16px] border border-dashed border-border-subtle font-['PingFang_SC'] text-[12px] text-text-tertiary">
              No devices
            </div>
          ) : (
            <div className="flex w-[800px] flex-wrap gap-[12px]">
              {section.devices.map((device) => {
                const status: DeviceConnectionState =
                  device.status === 'active'
                    ? 'live'
                    : connectingDeviceId === device.id
                      ? 'connecting'
                      : 'idle';
                return (
                  <DeviceCard
                    device={device}
                    iconSrc={section.iconSrc}
                    key={device.id}
                    onConnect={() =>
                      onConnect ? onConnect(section.key, device) : undefined
                    }
                    status={status}
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
