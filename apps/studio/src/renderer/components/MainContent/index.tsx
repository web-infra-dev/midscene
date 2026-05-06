import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { assetUrls } from '../../assets';
import {
  type StudioPreviewConnectionState,
  shouldPauseDiscoveryPollingDuringPreview,
} from '../../playground/preview-discovery';
import {
  buildDeviceSelectionFormValues,
  buildStudioSidebarDeviceBuckets,
  mergeSidebarDeviceBucketsWithDiscovery,
  resolveConnectedDeviceId,
  resolveConnectedDeviceLabel,
  resolveSelectedDeviceId,
} from '../../playground/selectors';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import ConnectingPreview from '../ConnectingPreview';
import ConnectionFailedPreview from '../ConnectionFailedPreview';
import DisconnectedPreview from '../DisconnectedPreview';
import type { ShellActiveView } from '../ShellLayout/types';
import { DeviceList } from './DeviceList';
import { MobilePreviewFrame } from './MobilePreviewFrame';
import {
  shouldEnableMobilePreviewFrame,
  shouldUseComputerPreviewPadding,
} from './preview-layout';

const LazyPlaygroundPreview = lazy(() => import('./LazyPlaygroundPreview'));

export interface MainContentProps {
  activeView: ShellActiveView;
  headerOffsetClass?: string;
  onSelectDeviceView?: () => void;
}

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

export default function MainContent({
  activeView,
  headerOffsetClass,
  onSelectDeviceView,
}: MainContentProps) {
  const studioPlayground = useStudioPlayground();
  const [previewStatus, setPreviewStatus] =
    useState<StudioPreviewConnectionState>(null);
  const [previewStatusText, setPreviewStatusText] = useState<string | null>(
    null,
  );
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const isReady = studioPlayground.phase === 'ready';
  const deviceLabel =
    studioPlayground.phase === 'error'
      ? 'Runtime Error'
      : isReady
        ? resolveConnectedDeviceLabel(
            studioPlayground.controller.state.runtimeInfo,
            { emptyLabel: 'No device selected' },
          )
        : 'Playground starting';
  const isConnected = isReady
    ? studioPlayground.controller.state.sessionViewState.connected
    : false;
  const connectedDeviceId = isReady
    ? resolveConnectedDeviceId(studioPlayground.controller.state.runtimeInfo)
    : undefined;
  const selectedDeviceId = isReady
    ? resolveSelectedDeviceId(studioPlayground.controller.state.formValues)
    : undefined;
  const previewDeviceId = connectedDeviceId ?? selectedDeviceId;
  const runtimeInfo =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.runtimeInfo
      : null;
  const previewFormValues: Record<string, unknown> =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.formValues
      : {};
  const shouldFrameMobilePreview = shouldEnableMobilePreviewFrame(
    runtimeInfo,
    previewFormValues,
    isConnected,
    previewStatus,
  );
  const shouldPadComputerPreview = shouldUseComputerPreviewPadding(
    runtimeInfo,
    previewFormValues,
  );
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
      setPreviewStatusText(null);
    }
  }, [isConnected]);

  const pauseDiscoveryPolling = shouldPauseDiscoveryPollingDuringPreview({
    previewStatus,
    runtimeInfo,
    sessionConnected: isConnected,
    sessionMutating:
      studioPlayground.phase === 'ready'
        ? studioPlayground.controller.state.sessionMutating
        : false,
  });

  useEffect(() => {
    studioPlayground.setDiscoveryPollingPaused(pauseDiscoveryPolling);
    return () => {
      studioPlayground.setDiscoveryPollingPaused(false);
    };
  }, [pauseDiscoveryPolling, studioPlayground]);

  // When the scrcpy preview reports an error (most common cause: the physical
  // device was unplugged after the sidebar rendered), refresh the session
  // setup so the now-stale device drops out of the sidebar and overview
  // buckets. `refreshSessionSetup` re-runs `adb devices`, so anything still
  // plugged in stays put.
  const refreshSessionSetup =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.actions.refreshSessionSetup
      : null;
  const currentFormValuesRef = useRef<Record<string, unknown> | null>(null);
  currentFormValuesRef.current =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.formValues
      : null;
  const previewStatusRef = useRef<StudioPreviewConnectionState>(null);
  useEffect(() => {
    const previous = previewStatusRef.current;
    previewStatusRef.current = previewStatus;
    if (previewStatus !== 'error' || previous === 'error') {
      return;
    }
    if (!refreshSessionSetup) {
      return;
    }
    void refreshSessionSetup(currentFormValuesRef.current ?? undefined);
  }, [previewStatus, refreshSessionSetup]);

  if (activeView === 'overview') {
    const overviewSessionBuckets = isReady
      ? buildStudioSidebarDeviceBuckets({
          formValues: studioPlayground.controller.state.formValues,
          runtimeInfo: studioPlayground.controller.state.runtimeInfo,
          targets:
            studioPlayground.controller.state.sessionSetup?.targets || [],
        })
      : { android: [], ios: [], computer: [], harmony: [], web: [] };
    const overviewBuckets = mergeSidebarDeviceBucketsWithDiscovery(
      overviewSessionBuckets,
      studioPlayground.discoveredDevices,
    );
    const overviewSelectedDeviceId =
      isReady && studioPlayground.controller.state.sessionMutating
        ? selectedDeviceId
        : undefined;

    return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] border-r border-border-subtle bg-surface">
        <div className="app-drag absolute left-0 right-0 top-0 z-0 h-[52px]" />
        <OverviewToolbar
          onRefresh={async () => {
            if (!isReady || overviewRefreshing) {
              return;
            }
            setOverviewRefreshing(true);
            try {
              // Refresh BOTH sources: session-setup targets (server-side
              // list) and cross-platform discovery (ADB/HDC/displays).
              // Discovery is what surfaces an unplug while a session is
              // still technically "connected" on the server.
              await Promise.all([
                studioPlayground.controller.actions.refreshSessionSetup(
                  studioPlayground.controller.state.formValues,
                ),
                studioPlayground.refreshDiscoveredDevices(),
              ]);
            } finally {
              setOverviewRefreshing(false);
            }
          }}
          refreshing={overviewRefreshing}
        />
        <DeviceList
          buckets={overviewBuckets}
          connectingDeviceId={overviewSelectedDeviceId}
          onConnect={async (platform, device) => {
            if (!isReady) {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            const selectionValues = buildDeviceSelectionFormValues(
              platform,
              device,
            );
            state.form.setFieldsValue(selectionValues);
            onSelectDeviceView?.();
            if (connectedDeviceId === device.id) {
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
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] border-r border-border-subtle bg-surface">
      <div
        className={`app-drag flex h-[52px] items-center pr-4 ${
          headerOffsetClass || 'pl-[8px]'
        }`}
      >
        <div className="flex items-center">
          <div className="ml-[8px] flex h-6 w-6 items-center justify-center rounded-[3.6px] bg-surface">
            <img alt="" className="h-[21.6px]" src={assetUrls.main.device} />
          </div>
          <span className="ml-[8px] max-w-[134px] truncate text-[13px] leading-[22.1px] font-medium text-text-primary">
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
            className={`app-no-drag flex h-8 items-center rounded-lg border border-border-subtle px-3 ${
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
            className="app-drag flex h-8 items-center gap-[4.02px] rounded-lg border border-border-subtle bg-surface px-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
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
        <MobilePreviewFrame enabled={shouldFrameMobilePreview}>
          {studioPlayground.phase === 'booting' ? (
            <div className="flex h-full items-center justify-center px-6 text-[14px] text-text-tertiary">
              Playground starting...
            </div>
          ) : studioPlayground.phase === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="max-w-[420px] text-[14px] leading-[22px] text-text-secondary">
                {studioPlayground.error}
              </div>
              <button
                className="rounded-lg border border-border-subtle px-4 py-2 text-[13px] font-medium text-text-primary"
                onClick={() => {
                  void studioPlayground.restartPlayground();
                }}
                type="button"
              >
                Retry runtime
              </button>
            </div>
          ) : !studioPlayground.controller.state.serverOnline ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-[14px] leading-[22px] text-text-tertiary">
              Playground server is offline.
            </div>
          ) : studioPlayground.controller.state.sessionViewState.connected ? (
            <div
              className={`h-full w-full ${
                shouldPadComputerPreview ? 'px-4' : ''
              }`}
            >
              <Suspense
                fallback={
                  <ConnectingPreview
                    pcSrc={assetUrls.main.pc}
                    phoneSrc={assetUrls.main.phone}
                    statusLabel={
                      previewStatusText ||
                      'Preparing Android device connection…'
                    }
                  />
                }
              >
                <LazyPlaygroundPreview
                  connectingOverlay={
                    <ConnectingPreview
                      pcSrc={assetUrls.main.pc}
                      phoneSrc={assetUrls.main.phone}
                      statusLabel={
                        previewStatusText ||
                        'Preparing Android device connection…'
                      }
                    />
                  }
                  onScrcpyStatusChange={(status, statusText) => {
                    setPreviewStatus(status);
                    setPreviewStatusText(statusText);
                  }}
                  renderErrorOverlay={({ retry }) => (
                    <ConnectionFailedPreview
                      adbId={previewDeviceId}
                      iconSrc={assetUrls.main.connectionFailed}
                      onReconnect={retry}
                    />
                  )}
                  playgroundSDK={
                    studioPlayground.controller.state.playgroundSDK
                  }
                  screenshotViewerMode="screen-only"
                  scrcpyViewportStyle={
                    shouldFrameMobilePreview
                      ? {
                          background: 'transparent',
                          borderRadius: 0,
                        }
                      : undefined
                  }
                  runtimeInfo={studioPlayground.controller.state.runtimeInfo}
                  serverUrl={studioPlayground.serverUrl}
                  serverOnline={studioPlayground.controller.state.serverOnline}
                  isUserOperating={
                    studioPlayground.controller.state.isUserOperating
                  }
                />
              </Suspense>
            </div>
          ) : (
            <DisconnectedPreview iconSrc={assetUrls.main.connectionClosed} />
          )}
        </MobilePreviewFrame>
      </div>
    </div>
  );
}
