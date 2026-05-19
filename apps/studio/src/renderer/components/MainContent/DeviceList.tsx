import type { ReactNode } from 'react';
import { STUDIO_EXTERNAL_LINKS } from '../../../shared/external-links';
import { assetUrls } from '../../assets';
import type {
  DiscoveryErrorsByPlatform,
  StudioAndroidDeviceItem,
  StudioSidebarDeviceBuckets,
  StudioSidebarPlatformKey,
} from '../../playground/types';
import {
  IOSCreateAgentCard,
  type IOSCreateInput,
  WebCreateAgentCard,
  type WebCreateInput,
} from './CreateAgentCard';
import { ModelConfigCard } from './ModelConfigCard';

type DeviceConnectionState = 'idle' | 'live' | 'connecting';

interface PlatformConfig {
  iconSrc?: string;
  key: StudioSidebarPlatformKey;
  label: string;
  /** Subtext label shown before the device id, e.g. "ADB Device". */
  idLabel?: string;
}

// Per-platform glyphs mirror the connected-device chip at the top of the
// shell, so the overview cards stay visually aligned with the preview
// header.
const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    iconSrc: assetUrls.main.platformAndroid,
    idLabel: 'ADB Device',
    key: 'android',
    label: 'Android',
  },
  {
    iconSrc: assetUrls.main.platformIos,
    idLabel: 'UDID',
    key: 'ios',
    label: 'iOS',
  },
  {
    iconSrc: assetUrls.main.platformPc,
    idLabel: 'Display',
    key: 'computer',
    label: 'Computer',
  },
  {
    iconSrc: assetUrls.main.platformHarmony,
    idLabel: 'HDC Device',
    key: 'harmony',
    label: 'HarmonyOS',
  },
  {
    iconSrc: assetUrls.main.platformWeb,
    idLabel: 'Target',
    key: 'web',
    label: 'Web',
  },
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

function LiveBadge() {
  return (
    <span className="inline-flex h-[17px] shrink-0 items-center gap-[6px] rounded-[12px] bg-status-success-bg px-[6px]">
      <span className="h-[6px] w-[6px] rounded-full bg-status-success shadow-[0_0_0_1.4px_rgba(66,181,108,0.25)]" />
      <span className="font-sans text-[11px] font-medium leading-[12px] text-status-success-fg">
        Live
      </span>
    </span>
  );
}

function ConnectingBadge() {
  return (
    <span className="inline-flex h-[17px] shrink-0 items-center gap-[6px] rounded-[12px] bg-status-info-bg px-[6px]">
      <span className="h-[6px] w-[6px] rounded-full bg-status-info" />
      <span className="font-sans text-[11px] font-medium leading-[12px] text-status-info">
        Connecting
      </span>
    </span>
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
  /** Whether MIDSCENE_MODEL_* env values are complete enough to run. */
  modelConfigComplete?: boolean;
  /** Raw env text — previewed in the expanded Model Config card. */
  modelEnvText?: string;
  /** Opens the env config modal anchored in the shell. */
  onOpenEnvModal?: () => void;
  /**
   * Submits a Web playground session (URL / viewport / browser mode).
   * Rendered as an inline form at the top of the Web section.
   */
  onCreateWebSession?: (input: WebCreateInput) => void | Promise<void>;
  /**
   * Submits an iOS playground session (WDA host / port). Rendered as an
   * inline form at the top of the iOS section.
   */
  onCreateIOSSession?: (input: IOSCreateInput) => void | Promise<void>;
  /** Disables form submission while a session is being mutated. */
  sessionMutating?: boolean;
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
      className="flex h-[66px] w-[704px] cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border-subtle bg-transparent px-[16px] font-sans text-[12px] text-text-secondary underline-offset-2 transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-text-primary hover:underline"
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
  idLabel,
  status,
  trailingSlot,
}: {
  device: StudioAndroidDeviceItem;
  iconSrc?: string;
  idLabel?: string;
  status: DeviceConnectionState;
  trailingSlot: ReactNode;
}) {
  // device.description carries the platform-native identifier (ADB serial,
  // udid, display index…). Fall back to id when it equals the label so the
  // row still has a meta line.
  const idText = device.description ?? device.id;
  const showIdLine = Boolean(idText && idText !== device.label);

  return (
    <>
      <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border-subtle bg-surface-muted">
        {iconSrc ? (
          <img
            alt=""
            className="h-[36px] w-[36px] object-contain"
            src={iconSrc}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2px]">
        <div className="flex items-center gap-[8px]">
          <span className="overflow-hidden truncate font-sans text-[14px] font-medium leading-[22px] text-text-primary">
            {device.label}
          </span>
          {status === 'live' ? <LiveBadge /> : null}
          {status === 'connecting' ? <ConnectingBadge /> : null}
        </div>
        {showIdLine ? (
          <span className="flex items-center gap-[8px] font-sans text-[10px] leading-[12px] text-[#000000] dark:text-white">
            <span className="overflow-hidden truncate">
              {idLabel ? `${idLabel}：${idText}` : idText}
            </span>
          </span>
        ) : null}
      </div>

      {trailingSlot}
    </>
  );
}

function DeviceCard({
  device,
  iconSrc,
  idLabel,
  status,
  onConnect,
  onDisconnect,
}: {
  device: StudioAndroidDeviceItem;
  iconSrc?: string;
  idLabel?: string;
  status: DeviceConnectionState;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
}) {
  const isConnecting = status === 'connecting';
  const isLive = status === 'live';
  // Live cards stay clickable so the user can jump back into the device
  // view without disconnecting first — the onConnect handler in
  // MainContent already short-circuits the createSession step when the
  // clicked device is the currently-connected one, and only swaps the
  // active view to 'device'.
  const interactionClassName = isConnecting
    ? 'cursor-not-allowed opacity-70'
    : 'cursor-pointer hover:bg-surface-hover';
  const cardClassName =
    `box-border flex h-[66px] w-[704px] shrink-0 items-center gap-[12px] rounded-[8px] bg-transparent px-[12px] py-[12px] text-left outline-none focus-visible:bg-surface-hover ${interactionClassName}`.trim();

  const handleCardClick = () => {
    if (isConnecting) return;
    void onConnect?.();
  };
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isConnecting) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void onConnect?.();
    }
  };

  return (
    <div
      aria-disabled={isConnecting ? true : undefined}
      className={cardClassName}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      // biome-ignore lint/a11y/useSemanticElements: the card embeds its own Disconnect <button>; nesting button-in-button would be invalid HTML.
      role="button"
      tabIndex={isConnecting ? -1 : 0}
    >
      <DeviceCardBody
        device={device}
        iconSrc={iconSrc}
        idLabel={idLabel}
        status={status}
        trailingSlot={
          isLive ? (
            <button
              aria-label="Disconnect"
              className="flex h-[28px] w-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent p-0 text-status-success-fg transition-colors hover:bg-status-error-bg hover:text-status-error"
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
              className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center ${
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
  modelConfigComplete,
  modelEnvText,
  onConnect,
  onCreateIOSSession,
  onCreateWebSession,
  onDisconnect,
  onOpenEnvModal,
  sessionMutating,
}: DeviceListProps) {
  const sections = PLATFORM_CONFIGS.map((config) => ({
    ...config,
    devices: buckets[config.key],
    toolchainHint:
      errors?.[config.key]?.kind === 'toolchain-missing'
        ? PLATFORM_TOOLCHAIN_HINTS[config.key]
        : undefined,
  }));

  const showModelConfigCard = typeof modelConfigComplete === 'boolean';

  const renderSectionCreateForm = (key: StudioSidebarPlatformKey) => {
    if (key === 'web' && onCreateWebSession) {
      return (
        <WebCreateAgentCard
          busy={sessionMutating}
          onSubmit={onCreateWebSession}
        />
      );
    }
    if (key === 'ios' && onCreateIOSSession) {
      return (
        <IOSCreateAgentCard
          busy={sessionMutating}
          onSubmit={onCreateIOSSession}
        />
      );
    }
    return null;
  };

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto px-[16px] pb-[40px] pt-[59px]">
      <div className="flex w-[704px] flex-col gap-[32px]">
        {showModelConfigCard ? (
          <ModelConfigCard
            complete={Boolean(modelConfigComplete)}
            envText={modelEnvText}
            onOpen={onOpenEnvModal}
          />
        ) : null}
        {sections.map((section) => {
          const createForm = renderSectionCreateForm(section.key);
          const hasDevices = section.devices.length > 0;
          return (
            <div className="flex w-[704px] flex-col" key={section.key}>
              <div className="flex h-[22px] items-center">
                <span className="font-sans text-[14px] font-medium leading-[22px] text-text-secondary">
                  {section.label}
                </span>
              </div>
              <div className="mt-[8px] h-[1px] w-full bg-divider" />
              <div className="mt-[16px] flex flex-col gap-[8px]">
                {createForm}
                {hasDevices ? (
                  section.devices.map((device) => {
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
                        idLabel={section.idLabel}
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
                  })
                ) : createForm ? null : section.toolchainHint ? (
                  <ToolchainMissingTile
                    href={section.toolchainHint.href}
                    label={section.toolchainHint.label}
                  />
                ) : (
                  <div className="flex h-[66px] w-[704px] items-center justify-center font-sans text-[12px] text-text-tertiary">
                    No Device，Please plug in the device and check.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
