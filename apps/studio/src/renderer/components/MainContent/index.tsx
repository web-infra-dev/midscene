import { PlaygroundPreview } from '@midscene/playground-app';
import { useEffect, useState } from 'react';
import { assetUrls } from '../../assets';
import {
  buildAndroidDeviceItems,
  buildStudioSidebarDeviceBuckets,
  resolveAndroidDeviceLabel,
  resolveConnectedAndroidDeviceId,
  resolveSelectedAndroidDeviceId,
} from '../../playground/selectors';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import ConnectingPreview from '../ConnectingPreview';
import ConnectionFailedPreview from '../ConnectionFailedPreview';
import DisconnectedPreview from '../DisconnectedPreview';
import type { ShellActiveView } from '../ShellLayout/types';
import { DeviceList } from './DeviceList';

export interface MainContentProps {
  activeView: ShellActiveView;
  envConfigured: boolean;
  headerOffsetClass?: string;
  onOpenModelConfig?: () => void;
  onOpenSettings?: () => void;
  onSelectDeviceView?: () => void;
}

type PreviewConnectionState =
  | 'connecting'
  | 'waiting-for-stream'
  | 'connected'
  | 'disconnected'
  | 'error'
  | null;

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={spinning ? 'animate-spin' : undefined}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M13.5 2.5v3h-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function OverviewToolbar({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="absolute right-[16px] top-[12px] z-10 flex items-center gap-[8px]">
      <button
        aria-label="Refresh devices"
        className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[8px] border border-border-subtle bg-surface text-text-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        <RefreshIcon spinning={refreshing} />
      </button>
    </div>
  );
}

function OverviewEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <div className="flex w-[360px] flex-col items-center gap-[12px]">
      <img
        alt=""
        aria-hidden="true"
        className="h-[95px] w-[120px] object-contain"
        src={assetUrls.main.devices}
      />

      <div className="w-[260px] overflow-hidden text-center font-['PingFang_SC'] text-[13px] font-medium leading-[24px] text-black">
        Finish environment setup to browse and connect devices
      </div>

      <button
        className="flex h-[32px] w-[117px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-surface-muted p-0 transition-colors hover:bg-surface-hover-strong active:bg-surface-active"
        onClick={onAction}
        type="button"
      >
        <span className="block overflow-hidden text-center text-[13px] font-medium leading-[22px] text-black">
          Configuration
        </span>
      </button>
    </div>
  );
}

export default function MainContent({
  activeView,
  envConfigured,
  headerOffsetClass,
  onOpenModelConfig,
  onOpenSettings,
  onSelectDeviceView,
}: MainContentProps) {
  const studioPlayground = useStudioPlayground();
  const [previewStatus, setPreviewStatus] =
    useState<PreviewConnectionState>(null);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const isReady = studioPlayground.phase === 'ready';
  const androidItems = isReady
    ? buildAndroidDeviceItems({
        formValues: studioPlayground.controller.state.formValues,
        runtimeInfo: studioPlayground.controller.state.runtimeInfo,
        targets: studioPlayground.controller.state.sessionSetup?.targets || [],
      })
    : [];
  const deviceLabel =
    studioPlayground.phase === 'error'
      ? 'Android Runtime Error'
      : isReady
        ? resolveAndroidDeviceLabel(androidItems)
        : 'Android playground starting';
  const isConnected = isReady
    ? studioPlayground.controller.state.sessionViewState.connected
    : false;
  const connectedAndroidDeviceId = isReady
    ? resolveConnectedAndroidDeviceId(
        studioPlayground.controller.state.runtimeInfo,
      )
    : undefined;
  const selectedAndroidDeviceId = isReady
    ? resolveSelectedAndroidDeviceId(
        studioPlayground.controller.state.formValues,
      )
    : undefined;
  const previewDeviceId = connectedAndroidDeviceId ?? selectedAndroidDeviceId;
  const disconnectDisabled =
    !isReady || !studioPlayground.controller.state.sessionViewState.connected;
  const previewConnectionFailed =
    previewStatus === 'error' || previewStatus === 'disconnected';
  const connectionStatusLabel = !isReady
    ? 'Setup'
    : previewConnectionFailed
      ? 'Connection failed'
      : isConnected
        ? 'Live'
        : 'Not connected';

  useEffect(() => {
    if (!isConnected) {
      setPreviewStatus(null);
    }
  }, [isConnected]);

  if (activeView === 'overview') {
    if (!envConfigured) {
      return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] border-r border-border-subtle bg-surface">
          <div className="flex h-full w-full items-center justify-center">
            <OverviewEmptyState
              onAction={onOpenModelConfig ?? onOpenSettings}
            />
          </div>
        </div>
      );
    }

    const overviewBuckets = isReady
      ? buildStudioSidebarDeviceBuckets({
          formValues: studioPlayground.controller.state.formValues,
          runtimeInfo: studioPlayground.controller.state.runtimeInfo,
          targets:
            studioPlayground.controller.state.sessionSetup?.targets || [],
        })
      : { android: [], ios: [], computer: [], harmony: [], web: [] };
    const overviewSelectedDeviceId =
      isReady && studioPlayground.controller.state.sessionMutating
        ? selectedAndroidDeviceId
        : undefined;

    return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] border-r border-border-subtle bg-surface">
        <OverviewToolbar
          onRefresh={async () => {
            if (!isReady || overviewRefreshing) {
              return;
            }
            setOverviewRefreshing(true);
            try {
              await studioPlayground.controller.actions.refreshSessionSetup(
                studioPlayground.controller.state.formValues,
              );
            } finally {
              setOverviewRefreshing(false);
            }
          }}
          refreshing={overviewRefreshing}
        />
        <DeviceList
          buckets={overviewBuckets}
          connectingDeviceId={overviewSelectedDeviceId}
          onConnect={async (_platform, device) => {
            if (!isReady) {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            state.form.setFieldsValue({ deviceId: device.id });
            onSelectDeviceView?.();
            if (connectedAndroidDeviceId === device.id) {
              return;
            }
            if (state.sessionViewState.connected) {
              await actions.destroySession();
            }
            const sessionValues = {
              ...state.form.getFieldsValue(true),
              deviceId: device.id,
            };
            await actions.createSession(sessionValues);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] border-r border-border-subtle bg-surface">
      <div
        className={`flex h-[52px] items-center pr-4 ${
          headerOffsetClass || 'pl-[8px]'
        }`}
      >
        <div className="flex items-center">
          <div className="ml-[8px] flex h-6 w-6 items-center justify-center rounded-[3.6px] bg-surface">
            <img alt="" className="h-[21.6px]" src={assetUrls.main.device} />
          </div>
          <span className="ml-[8px] w-[134px] overflow-hidden whitespace-nowrap text-[13px] leading-[22.1px] font-medium text-text-primary">
            {deviceLabel}
          </span>
          <div
            className={`ml-[8px] flex h-[28px] items-center gap-[8.04px] rounded-[16.07px] px-[10px] ${
              previewConnectionFailed
                ? 'bg-status-error-bg'
                : isConnected
                  ? 'bg-status-success-bg'
                  : 'bg-surface-muted'
            }`}
          >
            <div
              className={`h-2 w-2 rounded-full border-2 border-transparent ${
                previewConnectionFailed
                  ? 'bg-status-error'
                  : isConnected
                    ? 'bg-status-success'
                    : 'bg-status-idle'
              }`}
            />
            <span
              className={`text-[12.1px] leading-[12.1px] font-medium ${
                previewConnectionFailed
                  ? 'text-status-error'
                  : isConnected
                    ? 'text-status-success-fg'
                    : 'text-text-tertiary'
              }`}
            >
              {connectionStatusLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-1 justify-end gap-[8.04px]">
          <button
            className={`flex h-8 items-center rounded-lg border border-border-subtle px-3 ${
              isConnected
                ? 'bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                : 'bg-transparent'
            } ${disconnectDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
            disabled={disconnectDisabled}
            onClick={() => {
              if (studioPlayground.phase !== 'ready') {
                return;
              }

              void studioPlayground.controller.actions.destroySession();
            }}
            type="button"
          >
            <img
              alt=""
              className="mr-[5px] h-3.5 w-3.5"
              src={assetUrls.main.disconnect}
            />
            <span className="whitespace-nowrap px-[3px] text-[13px] leading-[20px] font-medium text-text-primary">
              Disconnect
            </span>
          </button>
          <button
            className="flex h-8 items-center gap-[4.02px] rounded-lg border border-border-subtle bg-surface-muted px-3"
            type="button"
          >
            <div className="flex h-4 w-4 items-center">
              <img alt="" className="h-4 w-4" src={assetUrls.main.chat} />
            </div>
            <span className="overflow-hidden whitespace-nowrap text-[13px] leading-[20px] font-medium text-text-primary">
              Chat
            </span>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface">
        {studioPlayground.phase === 'booting' ? (
          <div className="flex h-full items-center justify-center px-6 text-[14px] text-text-tertiary">
            Android playground starting...
          </div>
        ) : studioPlayground.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="max-w-[420px] text-[14px] leading-[22px] text-text-secondary">
              {studioPlayground.error}
            </div>
            <button
              className="rounded-lg border border-border-subtle px-4 py-2 text-[13px] font-medium text-text-primary"
              onClick={() => {
                void studioPlayground.restartAndroidPlayground();
              }}
              type="button"
            >
              Retry Android runtime
            </button>
          </div>
        ) : !studioPlayground.controller.state.serverOnline ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-[14px] leading-[22px] text-text-tertiary">
            Android playground server is offline.
          </div>
        ) : studioPlayground.controller.state.sessionViewState.connected ? (
          <div className="h-full w-full">
            <PlaygroundPreview
              connectingOverlay={
                <ConnectingPreview
                  pcSrc={assetUrls.main.pc}
                  phoneSrc={assetUrls.main.phone}
                />
              }
              onScrcpyStatusChange={setPreviewStatus}
              renderErrorOverlay={({ retry }) => (
                <ConnectionFailedPreview
                  adbId={previewDeviceId}
                  iconSrc={assetUrls.main.connectionFailed}
                  onReconnect={retry}
                />
              )}
              playgroundSDK={studioPlayground.controller.state.playgroundSDK}
              runtimeInfo={studioPlayground.controller.state.runtimeInfo}
              serverUrl={studioPlayground.serverUrl}
              serverOnline={studioPlayground.controller.state.serverOnline}
              isUserOperating={
                studioPlayground.controller.state.isUserOperating
              }
            />
          </div>
        ) : (
          <DisconnectedPreview iconSrc={assetUrls.main.connectionClosed} />
        )}
      </div>
    </div>
  );
}
