import { useState } from 'react';
import { assetUrls } from '../../assets';
import {
  buildDeviceSelectionFormValues,
  buildStudioSidebarDeviceBuckets,
  mergeSidebarDeviceBucketsWithDiscovery,
  resolveConnectedDeviceId,
} from '../../playground/selectors';
import type { StudioSidebarPlatformKey } from '../../playground/types';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import SettingsDock from '../SettingsDock';
import type { ShellActiveView } from '../ShellLayout/types';

type DeviceStatus = 'active' | 'idle';

interface DeviceItem {
  id: string;
  label: string;
  status: DeviceStatus;
  onClick?: () => void | Promise<void>;
  /** Purely informational rows that should never appear "selected". */
  isPlaceholder?: boolean;
}

interface SectionDefinition {
  iconSrc?: string;
  key: StudioSidebarPlatformKey;
  label: string;
}

const sectionDefinitions: SectionDefinition[] = [
  { iconSrc: assetUrls.sidebar.android, key: 'android', label: 'Android' },
  { iconSrc: assetUrls.sidebar.ios, key: 'ios', label: 'iOS' },
  { iconSrc: assetUrls.sidebar.computer, key: 'computer', label: 'Computer' },
  { iconSrc: assetUrls.sidebar.harmony, key: 'harmony', label: 'HarmonyOS' },
  { iconSrc: assetUrls.sidebar.web, key: 'web', label: 'Web' },
];

const EMPTY_DEVICE_ID_PREFIX = '__empty__';

function SectionChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M12 10L8 6L4 10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionHeader({
  expanded,
  iconSrc,
  label,
  onClick,
}: {
  expanded: boolean;
  iconSrc?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="relative h-8 w-full appearance-none rounded-lg border-0 bg-transparent p-0 text-left hover:bg-surface-hover"
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
      <span className="absolute left-[40px] top-[5px] text-[13px] leading-[22px] font-medium text-text-secondary">
        {label}
      </span>
      <div className="absolute left-[204px] top-0 flex h-full w-4 items-center justify-center">
        <SectionChevron expanded={expanded} />
      </div>
    </button>
  );
}

function DeviceRow({
  label,
  onClick,
  selected,
  status,
}: DeviceItem & {
  selected: boolean;
}) {
  return (
    <button
      className={`relative h-8 w-full cursor-pointer appearance-none rounded-[10px] border-0 bg-transparent p-0 text-left transition-colors ${
        selected
          ? 'bg-surface-hover-strong hover:bg-surface-active'
          : 'hover:bg-surface-hover active:bg-surface-active'
      }`}
      onClick={onClick}
      type="button"
    >
      <span
        className={`absolute left-[40px] w-[158px] overflow-hidden whitespace-nowrap text-[13px] ${
          selected
            ? 'top-[4.5px] font-medium leading-[22.1px] text-text-primary'
            : 'top-[8px] font-normal leading-[15.7px] text-text-secondary'
        }`}
      >
        {label}
      </span>
      <div className="absolute left-[204px] top-[8px] flex h-4 w-4 items-center justify-center">
        <div
          className={`h-[6px] w-[6px] rounded-full ${
            status === 'active' ? 'bg-status-success' : 'bg-status-idle'
          }`}
        />
      </div>
    </button>
  );
}

function EmptyDeviceRow() {
  return (
    <div className="relative h-8 w-full rounded-lg">
      <span className="absolute left-[40px] top-[8px] overflow-hidden whitespace-nowrap text-[12px] font-normal leading-[15.7px] text-text-tertiary">
        No devices
      </span>
    </div>
  );
}

export interface SidebarProps {
  activeView: ShellActiveView;
  onSelectOverview: () => void;
  onSelectDevice: () => void;
}

export default function Sidebar({
  activeView,
  onSelectOverview,
  onSelectDevice,
}: SidebarProps) {
  const studioPlayground = useStudioPlayground();
  const [expandedSections, setExpandedSections] = useState<
    Record<StudioSidebarPlatformKey, boolean>
  >({
    android: true,
    computer: true,
    harmony: true,
    ios: true,
    web: true,
  });

  const toggleSection = (sectionKey: StudioSidebarPlatformKey) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  // Device buckets: merge session-setup targets (from the currently
  // selected platform) with cross-platform discovered devices. Discovery
  // is the source of truth for platforms that support it (ADB/HDC/
  // displays) — this is what makes an unplug disappear from the list.
  const sessionBuckets =
    studioPlayground.phase === 'ready'
      ? buildStudioSidebarDeviceBuckets({
          formValues: studioPlayground.controller.state.formValues,
          runtimeInfo: studioPlayground.controller.state.runtimeInfo,
          targets:
            studioPlayground.controller.state.sessionSetup?.targets || [],
        })
      : {
          android: [],
          ios: [],
          computer: [],
          harmony: [],
          web: [],
        };

  const deviceBuckets = mergeSidebarDeviceBucketsWithDiscovery(
    sessionBuckets,
    studioPlayground.discoveredDevices,
  );

  const connectedDeviceId =
    studioPlayground.phase === 'ready'
      ? resolveConnectedDeviceId(studioPlayground.controller.state.runtimeInfo)
      : undefined;

  /**
   * Build a click-enabled device list for any platform section. The
   * multi-platform session manager expects:
   *   - `platformId` — which platform this device belongs to
   *   - `{platformId}.deviceId` — the prefixed field key for the target
   */
  const buildDeviceItemsForPlatform = (
    platformKey: StudioSidebarPlatformKey,
    devices: typeof deviceBuckets.android,
  ): DeviceItem[] => {
    if (studioPlayground.phase !== 'ready') {
      if (platformKey === 'android') {
        return [
          {
            id: `${platformKey}-placeholder`,
            label:
              studioPlayground.phase === 'booting'
                ? 'Playground starting'
                : 'Runtime failed to start',
            status: 'idle' as const,
            isPlaceholder: true,
          },
        ];
      }
      return [];
    }

    // iOS discovery needs WebDriverAgent running, which is a manual
    // setup step; surface a hint row instead of an empty section so
    // users know it isn't a bug.
    if (platformKey === 'ios' && devices.length === 0) {
      return [
        {
          id: 'ios-setup-hint',
          label: 'Set up iOS via the playground form',
          status: 'idle' as const,
          isPlaceholder: true,
          onClick: async () => {
            if (studioPlayground.phase !== 'ready') {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            const nextValues = {
              ...state.form.getFieldsValue(true),
              platformId: 'ios',
            };
            state.form.setFieldsValue(nextValues);
            onSelectDevice();
            await actions.refreshSessionSetup(nextValues);
          },
        },
      ];
    }

    return devices.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      onClick: async () => {
        if (studioPlayground.phase !== 'ready') {
          return;
        }
        const { actions, state } = studioPlayground.controller;

        // Tell the multi-platform session manager which platform +
        // device to target. Field keys follow the `{platformId}.fieldKey`
        // convention from `prepareMultiPlatformPlayground`.
        const selectionValues = buildDeviceSelectionFormValues(
          platformKey,
          item,
        );
        state.form.setFieldsValue(selectionValues);

        onSelectDevice();

        if (connectedDeviceId === item.id) {
          return;
        }
        if (state.sessionViewState.connected) {
          await actions.destroySession();
        }
        const sessionValues = {
          ...state.form.getFieldsValue(true),
          ...selectionValues,
        };
        await actions.createSession(sessionValues);
      },
    }));
  };

  const selectedDeviceIds =
    studioPlayground.phase === 'ready'
      ? new Set(
          Object.values(deviceBuckets)
            .flat()
            .filter((item) => item.selected)
            .map((item) => item.id),
        )
      : new Set<string>();

  const totalDeviceCount = sectionDefinitions.reduce(
    (sum, section) => sum + deviceBuckets[section.key].length,
    0,
  );

  const resolvedSections = sectionDefinitions.map((section) => ({
    ...section,
    devices: buildDeviceItemsForPlatform(
      section.key,
      deviceBuckets[section.key],
    ),
  }));

  const overviewActive = activeView === 'overview';

  return (
    <div className="flex flex-col">
      <button
        className={`relative h-8 w-full appearance-none border-0 p-0 text-left ${
          overviewActive
            ? 'rounded-[10px] bg-black/5'
            : 'rounded-lg bg-transparent hover:bg-surface-hover'
        }`}
        onClick={onSelectOverview}
        type="button"
      >
        <img
          alt=""
          className="absolute left-[12px] top-[8px] h-4 w-4"
          src={assetUrls.sidebar.overview}
        />
        <span className="absolute left-[40px] top-[5px] overflow-hidden whitespace-nowrap text-[13px] leading-[22px] font-medium text-text-secondary">
          Device overview
        </span>
        <span className="absolute right-[12px] top-[6px] font-['PingFang_SC'] text-[11px] font-normal leading-[20px] text-text-tertiary">
          {totalDeviceCount}
        </span>
      </button>

      <div className="mt-1 flex flex-col">
        <div className="relative h-8 w-full">
          <span className="absolute left-[12px] top-[5px] overflow-hidden whitespace-nowrap text-[13px] font-medium leading-[22px] text-text-tertiary">
            Platform
          </span>
        </div>

        <div className="flex flex-col">
          {resolvedSections.map((section) => {
            const isExpanded = expandedSections[section.key];
            const hasDevices = section.devices.length > 0;
            return (
              <div className="flex flex-col" key={section.key}>
                <SectionHeader
                  expanded={isExpanded}
                  iconSrc={section.iconSrc}
                  label={section.label}
                  onClick={() => toggleSection(section.key)}
                />

                {isExpanded ? (
                  hasDevices ? (
                    section.devices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        selected={
                          !device.isPlaceholder &&
                          selectedDeviceIds.has(device.id)
                        }
                        {...device}
                      />
                    ))
                  ) : (
                    <EmptyDeviceRow
                      key={`${EMPTY_DEVICE_ID_PREFIX}${section.key}`}
                    />
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface SidebarFooterProps {
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onEnvClick?: () => void;
}

export function SidebarFooter({
  settingsOpen,
  onToggleSettings,
  onEnvClick,
}: SidebarFooterProps) {
  return (
    <SettingsDock
      onEnvClick={onEnvClick}
      onToggleSettings={onToggleSettings}
      settingsOpen={settingsOpen}
    />
  );
}
