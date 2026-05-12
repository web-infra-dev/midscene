import { useEffect, useState } from 'react';
import { assetUrls } from '../../assets';
import {
  buildDeviceSelectionFormValues,
  buildStudioSidebarDeviceBuckets,
  mergeSidebarDeviceBucketsWithDiscovery,
  normalizeStudioPlatformId,
  resolveConnectedDeviceId,
  resolveSelectedDeviceId,
} from '../../playground/selectors';
import type { StudioSidebarPlatformKey } from '../../playground/types';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { MaskedIcon } from '../MaskedIcon';
import { ConnectionStatusDot } from '../PlaygroundShell';
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

function SectionHeader({
  iconSrc,
  label,
  onClick,
}: {
  iconSrc?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="mb-[2px] flex h-8 w-full appearance-none items-center gap-[6px] rounded-lg border-0 bg-transparent px-[12px] text-left hover:bg-surface-hover"
      onClick={onClick}
      type="button"
    >
      {iconSrc ? (
        <MaskedIcon
          className="h-4 w-4 shrink-0 text-text-secondary"
          src={iconSrc}
        />
      ) : (
        <div className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 overflow-hidden whitespace-nowrap font-sans text-[13px] font-medium leading-[22px] text-text-secondary">
        {label}
      </span>
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
      className={`flex h-8 w-full cursor-pointer appearance-none items-center gap-[6px] rounded-[10px] border-0 px-[12px] text-left transition-colors ${
        selected
          ? 'bg-surface-hover hover:bg-surface-hover'
          : 'bg-transparent hover:bg-surface-hover active:bg-surface-active'
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="h-4 w-4 shrink-0" />
      <span
        className={`flex-1 overflow-hidden whitespace-nowrap font-sans text-[13px] ${
          selected
            ? 'font-medium leading-[22.11px] text-text-primary'
            : 'font-normal leading-[13px] text-text-secondary'
        }`}
      >
        {label}
      </span>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <ConnectionStatusDot
          size={6}
          status={status === 'active' ? 'connected' : 'disconnected'}
        />
      </span>
    </button>
  );
}

function EmptyDeviceRow() {
  return (
    <div className="flex h-8 w-full items-center gap-[6px] rounded-lg px-[12px]">
      <div className="h-4 w-4 shrink-0" />
      <span className="flex-1 overflow-hidden whitespace-nowrap font-sans text-[13px] font-normal leading-[13px] text-text-tertiary">
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
  // Sticky record of the user's most recent click. Kept locally so the
  // highlight survives any transient form-state churn during the
  // destroy → refreshSessionSetup → createSession round-trip.
  const [stickySelection, setStickySelection] = useState<
    { platformKey: StudioSidebarPlatformKey; deviceId: string } | undefined
  >(undefined);

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

  const runtimeInfo =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.runtimeInfo
      : null;
  const connectedDeviceId = resolveConnectedDeviceId(runtimeInfo);
  const connectedPlatformKey = normalizeStudioPlatformId(
    runtimeInfo?.platformId ?? runtimeInfo?.interface?.type,
  );

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

    return devices.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      onClick: async () => {
        if (studioPlayground.phase !== 'ready') {
          return;
        }
        const { actions, state } = studioPlayground.controller;

        // Stamp the highlight synchronously so the row stays selected
        // even before the form state propagates through useWatch.
        setStickySelection({ platformKey, deviceId: item.id });

        if (item.selected && item.status === 'active') {
          onSelectDevice();
          return;
        }

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
          // refreshSessionSetup inside destroySession may overwrite the
          // selection we just stamped — re-apply it so the highlight
          // and the next createSession agree.
          state.form.setFieldsValue(selectionValues);
        }
        const sessionValues = {
          ...state.form.getFieldsValue(true),
          ...selectionValues,
        };
        await actions.createSession(sessionValues);
      },
    }));
  };

  // Source-of-truth for the sidebar highlight is the form's selection
  // (i.e. the row the user most recently clicked) — not the connected
  // device, so the highlight stays put during the session swap from one
  // device to another. The active-status dot still tracks the live
  // connection separately.
  const formValues =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.formValues
      : undefined;
  const formSelectedPlatformKey = formValues
    ? normalizeStudioPlatformId(formValues.platformId)
    : undefined;
  const formSelectedDeviceId = formValues
    ? resolveSelectedDeviceId(formValues)
    : undefined;

  // Keep stickySelection in lockstep with the form whenever the form
  // actually identifies a device. This way, if some downstream effect
  // (e.g. refreshSessionSetup, discovery auto-select) updates the form,
  // the sticky highlight follows instead of pointing at the previous
  // click. We only clear sticky when the form has no selection AND no
  // recent click — never let an empty form wipe a fresh click.
  useEffect(() => {
    if (!formSelectedPlatformKey || !formSelectedDeviceId) {
      return;
    }
    setStickySelection((prev) => {
      if (
        prev &&
        prev.platformKey === formSelectedPlatformKey &&
        prev.deviceId === formSelectedDeviceId
      ) {
        return prev;
      }
      return {
        platformKey: formSelectedPlatformKey,
        deviceId: formSelectedDeviceId,
      };
    });
  }, [formSelectedPlatformKey, formSelectedDeviceId]);

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
        className={`flex h-8 w-full appearance-none items-center gap-[6px] border-0 px-[12px] text-left ${
          overviewActive
            ? 'rounded-[10px] bg-black/5'
            : 'rounded-lg bg-transparent hover:bg-surface-hover'
        }`}
        onClick={onSelectOverview}
        type="button"
      >
        <MaskedIcon
          className="h-4 w-4 shrink-0 text-text-secondary"
          src={assetUrls.sidebar.overview}
        />
        <span className="flex-1 overflow-hidden whitespace-nowrap font-sans text-[13px] font-medium leading-[22px] text-text-secondary">
          Overview
        </span>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center font-sans text-[11px] font-normal leading-none text-text-tertiary">
          {totalDeviceCount}
        </span>
      </button>

      <div className="mt-1 flex flex-col">
        <div className="flex h-8 w-full items-center pl-[12px]">
          <span className="overflow-hidden whitespace-nowrap font-sans text-[13px] font-medium leading-[22px] text-text-placeholder">
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
                  iconSrc={section.iconSrc}
                  label={section.label}
                  onClick={() => toggleSection(section.key)}
                />

                {isExpanded ? (
                  hasDevices ? (
                    section.devices.map((device) => {
                      // Three independent signals can light up a row:
                      //   - matchesConnected: this device is the one
                      //     currently powering the middle preview area.
                      //   - matchesForm: form's selectedDeviceId points
                      //     here (the source of truth for "what the user
                      //     picked" once it settles).
                      //   - matchesSticky: synchronous record of the
                      //     last click, kept locally so the highlight is
                      //     instant.
                      // OR-ing them avoids a single-frame gap during the
                      // hand-off where `connectedDeviceId` has just
                      // landed but the matching bucket entry hasn't
                      // re-rendered with the same id yet.
                      const matchesConnected =
                        !!connectedDeviceId &&
                        section.key === connectedPlatformKey &&
                        device.id === connectedDeviceId;
                      const matchesForm =
                        !!formSelectedDeviceId &&
                        section.key === formSelectedPlatformKey &&
                        device.id === formSelectedDeviceId;
                      const matchesSticky =
                        !!stickySelection &&
                        stickySelection.platformKey === section.key &&
                        stickySelection.deviceId === device.id;
                      return (
                        <DeviceRow
                          key={device.id}
                          selected={
                            !device.isPlaceholder &&
                            (matchesConnected || matchesForm || matchesSticky)
                          }
                          {...device}
                        />
                      );
                    })
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
