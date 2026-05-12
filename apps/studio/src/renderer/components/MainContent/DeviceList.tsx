import type { ReactNode } from 'react';
import { STUDIO_EXTERNAL_LINKS } from '../../../shared/external-links';
import { assetUrls } from '../../assets';
import type {
  DiscoveryErrorsByPlatform,
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

// Header (MainContent) shows two platform glyphs: a phone for
// android/ios/harmony, a PC for computer/web. Mirror that mapping here so
// the overview cards stay visually aligned with the connected-device chip
// at the top of the shell.
const PLATFORM_CONFIGS: PlatformConfig[] = [
  { iconSrc: assetUrls.main.platformPhone, key: 'android', label: 'Android' },
  { iconSrc: assetUrls.main.platformPhone, key: 'ios', label: 'iOS' },
  { iconSrc: assetUrls.main.platformPc, key: 'computer', label: 'Computer' },
  {
    iconSrc: assetUrls.main.platformPhone,
    key: 'harmony',
    label: 'HarmonyOS',
  },
  { iconSrc: assetUrls.main.platformPc, key: 'web', label: 'Web' },
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
        className={`font-sans text-[11px] font-medium leading-[12px] ${
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
  errors?: DiscoveryErrorsByPlatform;
  onConnect?: (
    platform: StudioSidebarPlatformKey,
    device: StudioAndroidDeviceItem,
  ) => void | Promise<void>;
  onDisconnect?: (
    platform: StudioSidebarPlatformKey,
    device: StudioAndroidDeviceItem,
  ) => void | Promise<void>;
}

const PLATFORM_TOOLCHAIN_HINTS: Partial<
  Record<StudioSidebarPlatformKey, { label: string; href: string }>
> = {
  android: {
    label: '⚠️ ADB not detected',
    href: STUDIO_EXTERNAL_LINKS.androidIntegrationFaq,
  },
};

function ToolchainMissingTile({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <button
      className="flex h-[66px] w-[394px] cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border-subtle bg-transparent px-[16px] font-sans text-[12px] text-text-secondary underline-offset-2 transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-text-primary hover:underline"
      onClick={() => {
        void window.electronShell?.openExternalUrl(href);
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function DeviceCardBody({
  device,
  iconSrc,
  status,
  trailingSlot,
}: {
  device: StudioAndroidDeviceItem;
  iconSrc?: string;
  status: DeviceConnectionState;
  trailingSlot: ReactNode;
}) {
  return (
    <>
      {iconSrc ? (
        <img
          alt=""
          className="h-[40px] w-[40px] shrink-0 object-contain"
          src={iconSrc}
        />
      ) : (
        <div className="h-[40px] w-[40px] shrink-0" />
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-[8px]">
          <span className="overflow-hidden truncate font-sans text-[14px] font-medium leading-[22px] text-text-primary">
            {device.label}
          </span>
          <StatusBadge status={status} />
        </div>
        <span className="overflow-hidden truncate font-sans text-[12px] leading-[20px] text-text-secondary">
          {device.description ?? device.id}
        </span>
      </div>

      {trailingSlot}
    </>
  );
}

function DeviceCard({
  device,
  iconSrc,
  status,
  onConnect,
  onDisconnect,
}: {
  device: StudioAndroidDeviceItem;
  iconSrc?: string;
  status: DeviceConnectionState;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
}) {
  const isConnecting = status === 'connecting';
  const isLive = status === 'live';
  const interactionClassName = isLive
    ? ''
    : isConnecting
      ? 'cursor-not-allowed opacity-70'
      : 'cursor-pointer hover:border-border-strong';
  const cardClassName =
    `box-border flex h-[66px] w-[394px] shrink-0 items-center justify-between gap-[12px] rounded-[8px] border border-border-subtle bg-surface-elevated p-[12px] text-left ${interactionClassName}`.trim();

  const handleCardClick = () => {
    if (isLive || isConnecting) return;
    void onConnect?.();
  };
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isLive || isConnecting) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void onConnect?.();
    }
  };

  return (
    <div
      aria-disabled={isLive || isConnecting ? true : undefined}
      className={cardClassName}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role={isLive ? undefined : 'button'}
      tabIndex={isLive || isConnecting ? -1 : 0}
    >
      <DeviceCardBody
        device={device}
        iconSrc={iconSrc}
        status={status}
        trailingSlot={
          isLive ? (
            <button
              aria-label="Disconnect"
              className="flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent p-0 text-status-success-fg transition-colors hover:bg-status-error-bg hover:text-status-error"
              onClick={(event) => {
                event.stopPropagation();
                void onDisconnect?.();
              }}
              title="Disconnect"
              type="button"
            >
              <LinkIcon />
            </button>
          ) : (
            <div
              className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center ${
                isConnecting ? 'text-status-info' : 'text-text-tertiary'
              }`}
            >
              {isConnecting ? <SpinnerIcon /> : <LinkIcon />}
            </div>
          )
        }
      />
    </div>
  );
}

export function DeviceList({
  buckets,
  connectingDeviceId,
  errors,
  onConnect,
  onDisconnect,
}: DeviceListProps) {
  const sections = PLATFORM_CONFIGS.map((config) => ({
    ...config,
    devices: buckets[config.key],
    toolchainHint:
      errors?.[config.key]?.kind === 'toolchain-missing'
        ? PLATFORM_TOOLCHAIN_HINTS[config.key]
        : undefined,
  }));

  return (
    <div className="flex h-full w-full flex-col gap-[32px] overflow-y-auto px-[118px] pb-[40px] pt-[59px]">
      {sections.map((section) => (
        <div className="flex w-[800px] flex-col gap-[16px]" key={section.key}>
          <span className="font-sans text-[13px] font-medium leading-[22px] text-text-secondary">
            {section.label}
          </span>
          {section.devices.length === 0 ? (
            section.toolchainHint ? (
              <ToolchainMissingTile
                href={section.toolchainHint.href}
                label={section.toolchainHint.label}
              />
            ) : (
              <div className="flex h-[66px] w-[394px] items-center justify-center rounded-[8px] border border-dashed border-border-subtle font-sans text-[12px] text-text-tertiary">
                No devices
              </div>
            )
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
                    onDisconnect={() =>
                      onDisconnect
                        ? onDisconnect(section.key, device)
                        : undefined
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
