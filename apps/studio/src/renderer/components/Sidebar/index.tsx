import { useState } from 'react';
import { assetUrls } from '../../assets';
import {
  buildStudioSidebarDeviceBuckets,
  resolveConnectedAndroidDeviceId,
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

  const deviceBuckets =
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

  const connectedAndroidDeviceId =
    studioPlayground.phase === 'ready'
      ? resolveConnectedAndroidDeviceId(
          studioPlayground.controller.state.runtimeInfo,
        )
      : undefined;

  const androidDevices: DeviceItem[] =
    studioPlayground.phase === 'ready'
      ? deviceBuckets.android.map((item) => ({
          id: item.id,
          label: item.label,
          status: item.status,
          onClick: async () => {
            if (studioPlayground.phase !== 'ready') {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            state.form.setFieldsValue({ deviceId: item.id });
            onSelectDevice();
            if (connectedAndroidDeviceId === item.id) {
              return;
            }
            if (state.sessionViewState.connected) {
              await actions.destroySession();
            }
            const sessionValues = {
              ...state.form.getFieldsValue(true),
              deviceId: item.id,
            };
            await actions.createSession(sessionValues);
          },
        }))
      : [
          {
            id: 'android-placeholder',
            label:
              studioPlayground.phase === 'booting'
                ? 'Playground starting'
                : 'Android runtime failed to start',
            status: 'idle' as const,
          },
        ];

  const selectedAndroidDeviceIds =
    studioPlayground.phase === 'ready'
      ? new Set(
          deviceBuckets.android
            .filter((item) => item.selected)
            .map((item) => item.id),
        )
      : new Set<string>(['android-placeholder']);

  const totalDeviceCount = sectionDefinitions.reduce(
    (sum, section) => sum + deviceBuckets[section.key].length,
    0,
  );

  const resolvedSections = sectionDefinitions.map((section) => ({
    ...section,
    devices:
      section.key === 'android' ? androidDevices : deviceBuckets[section.key],
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
                    section.devices.map((device, index) => (
                      <DeviceRow
                        key={device.id}
                        selected={
                          section.key === 'android'
                            ? studioPlayground.phase === 'ready'
                              ? selectedAndroidDeviceIds.has(device.id)
                              : index === 0
                            : false
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
