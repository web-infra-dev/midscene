import { getDebug } from '@midscene/shared/logger';
import {
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from 'react';
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
import { MaskedIcon } from '../MaskedIcon';
import { type ConnectionStatus, ConnectionStatusDot } from '../PlaygroundShell';
import type { ShellActiveView } from '../ShellLayout/types';
import { DeviceList } from './DeviceList';
import { MobilePreviewFrame } from './MobilePreviewFrame';
import {
  resolveStudioPreviewPlatform,
  shouldEnableMobilePreviewFrame,
  shouldUseDesktopPreviewPadding,
} from './preview-layout';

const debugWebNavigation = getDebug('studio:web-navigation', { console: true });

const LazyPlaygroundPreview = lazy(() => import('./LazyPlaygroundPreview'));

export interface MainContentProps {
  activeView: ShellActiveView;
  headerOffsetClass?: string;
  onSelectDeviceView?: () => void;
  onSelectOverview?: () => void;
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

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      viewBox="0 0 16 16"
      width="15"
    >
      <path
        d="M9.8 3.2 5 8l4.8 4.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      viewBox="0 0 16 16"
      width="15"
    >
      <path
        d="M6.2 3.2 11 8l-4.8 4.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="13"
      viewBox="0 0 16 16"
      width="13"
    >
      <rect
        height="8.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        width="8.5"
        x="3.75"
        y="3.75"
      />
    </svg>
  );
}

function resolvePlatformLogo(platform?: string): string {
  switch (platform) {
    case 'computer':
    case 'web':
      return assetUrls.main.platformPc;
    case 'android':
    case 'ios':
    case 'harmony':
      return assetUrls.main.platformPhone;
    default:
      return assetUrls.main.platformPhone;
  }
}

function getPreviewConnectingLabel(platform?: string): string {
  switch (platform) {
    case 'web':
      return 'Opening Web page…';
    case 'computer':
      return 'Preparing computer connection…';
    case 'ios':
      return 'Preparing iOS device connection…';
    case 'harmony':
      return 'Preparing HarmonyOS device connection…';
    case 'android':
      return 'Preparing Android device connection…';
    default:
      return 'Preparing device connection…';
  }
}

function getDisconnectedPreviewTitle(platform?: string): string {
  switch (platform) {
    case 'web':
      return 'Open Web Page';
    case 'computer':
      return 'Connect Computer';
    case 'ios':
      return 'Connect iOS Device';
    case 'harmony':
      return 'Connect HarmonyOS Device';
    case 'android':
      return 'Connect Android Device';
    default:
      return 'Connect Device';
  }
}

function WebNavigationButton({
  'aria-label': ariaLabel,
  disabled,
  onClick,
  children,
}: {
  'aria-label': string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="app-no-drag flex h-[28px] w-[28px] cursor-pointer appearance-none items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-text-secondary shadow-none transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={ariaLabel}
      type="button"
    >
      {children}
    </button>
  );
}

function OverviewToolbar({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}) {
  // Vertically centered in the 52px drag header strip so the button lines
  // up with the sidebar collapse toggle on the opposite side. The
  // surrounding header is `-webkit-app-region: drag`, so the button must
  // explicitly opt back out via `app-no-drag` or the OS swallows hover
  // and click events.
  return (
    <div className="app-no-drag absolute right-[16px] top-[10px] z-10 flex items-center gap-[8px]">
      <button
        aria-label="Refresh devices"
        className="app-no-drag flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-text-secondary transition-colors hover:bg-surface-hover-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
  onSelectOverview,
}: MainContentProps) {
  const studioPlayground = useStudioPlayground();
  const [previewStatus, setPreviewStatus] =
    useState<StudioPreviewConnectionState>(null);
  // Connected device's intrinsic screen size, reported by PreviewRenderer
  // once `/interface-info` lands. We feed its aspect ratio into the
  // mobile preview frame so the rounded border tightly hugs the canvas
  // instead of letterboxing with a hardcoded 9:19.5 assumption.
  const [previewDeviceSize, setPreviewDeviceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const previewAspectRatio =
    previewDeviceSize &&
    previewDeviceSize.width > 0 &&
    previewDeviceSize.height > 0
      ? previewDeviceSize.width / previewDeviceSize.height
      : undefined;
  const [previewStatusText, setPreviewStatusText] = useState<string | null>(
    null,
  );
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [webNavigationBusyAction, setWebNavigationBusyAction] = useState<
    'GoBack' | 'GoForward' | 'Stop' | 'Reload' | null
  >(null);
  const [webIsLoading, setWebIsLoading] = useState(false);
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
  const shouldPadDesktopPreview = shouldUseDesktopPreviewPadding(
    runtimeInfo,
    previewFormValues,
  );
  const previewPlatform = resolveStudioPreviewPlatform(
    runtimeInfo,
    previewFormValues,
  );
  const showWebNavigation = isConnected && previewPlatform === 'web';
  const previewConnectingLabel = getPreviewConnectingLabel(previewPlatform);
  const disconnectedPreviewTitle = getDisconnectedPreviewTitle(previewPlatform);
  const isOpeningSession =
    isReady &&
    !isConnected &&
    studioPlayground.controller.state.sessionMutating;
  const disconnectDisabled =
    !isReady || !studioPlayground.controller.state.sessionViewState.connected;
  const previewConnectionFailed =
    previewStatus === 'error' || previewStatus === 'disconnected';
  const connectionStatus: ConnectionStatus = previewConnectionFailed
    ? 'failed'
    : isConnected
      ? 'connected'
      : 'disconnected';

  useEffect(() => {
    if (!isConnected) {
      setPreviewStatus(null);
      setPreviewStatusText(null);
      setPreviewDeviceSize(null);
      setWebNavigationBusyAction(null);
      setWebIsLoading(false);
    }
  }, [isConnected]);

  // Web navigation toolbar polls /interface-info for `isLoading` so the
  // reload/stop button reflects the current page state. Depend on the few
  // primitives we actually read instead of the whole `studioPlayground`
  // controller object — that object's identity changes on every render and
  // would tear down/rebuild the interval each frame.
  const webNavigationServerOnline =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.serverOnline
      : false;
  const webNavigationSDK =
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.playgroundSDK
      : null;

  useEffect(() => {
    if (!showWebNavigation || !webNavigationServerOnline || !webNavigationSDK) {
      setWebIsLoading(false);
      return;
    }

    let cancelled = false;
    const refreshWebLoadingState = async () => {
      try {
        const info = await webNavigationSDK.getInterfaceInfo();
        if (cancelled) return;
        setWebIsLoading(Boolean(info?.navigationState?.isLoading));
      } catch (error) {
        if (!cancelled) {
          debugWebNavigation('failed to refresh web loading state: %s', error);
          setWebIsLoading(false);
        }
      }
    };

    void refreshWebLoadingState();
    const timer = window.setInterval(refreshWebLoadingState, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showWebNavigation, webNavigationServerOnline, webNavigationSDK]);

  const runWebNavigationAction = async (
    actionType: 'GoBack' | 'GoForward' | 'Stop' | 'Reload',
  ) => {
    if (
      studioPlayground.phase !== 'ready' ||
      webNavigationBusyAction !== null ||
      previewPlatform !== 'web'
    ) {
      return;
    }
    setWebNavigationBusyAction(actionType);
    try {
      if (actionType !== 'Stop') {
        setWebIsLoading(true);
      }
      const result =
        await studioPlayground.controller.state.playgroundSDK.interact({
          actionType,
        });
      if (!result.ok) {
        debugWebNavigation(
          'failed to run web navigation action "%s": %s',
          actionType,
          result.error || 'Unknown error',
        );
      } else {
        setWebIsLoading(false);
      }
    } finally {
      setWebNavigationBusyAction(null);
    }
  };

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
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] bg-surface">
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
          errors={studioPlayground.discoveryErrors}
          onConnect={async (platform, device) => {
            if (!isReady) {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            const selectionValues = buildDeviceSelectionFormValues(
              platform,
              device,
            );
            onSelectDeviceView?.();
            if (
              connectedDeviceId === device.id ||
              (device.selected && device.status === 'active')
            ) {
              return;
            }
            state.form.setFieldsValue(selectionValues);
            if (state.sessionViewState.connected) {
              await actions.destroySession();
            }
            const sessionValues = {
              ...state.form.getFieldsValue(true),
              ...selectionValues,
            };
            await actions.createSession(sessionValues);
          }}
          onDisconnect={async () => {
            if (!isReady) {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            if (state.sessionViewState.connected) {
              await actions.destroySession();
            }
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
          <img
            alt=""
            className="ml-[8px] h-6 w-6 shrink-0"
            src={resolvePlatformLogo(previewPlatform)}
          />

          <span className="ml-[8px] max-w-[134px] truncate text-[13px] leading-[22.1px] font-medium text-text-primary">
            {deviceLabel}
          </span>
          <span className="ml-[8px] inline-flex shrink-0 items-center">
            <ConnectionStatusDot status={connectionStatus} />
          </span>
          {showWebNavigation ? (
            <div
              aria-label="Web navigation"
              className="app-no-drag ml-[10px] flex h-[32px] items-center gap-[2px] rounded-[8px] bg-transparent px-[2px]"
            >
              <WebNavigationButton
                aria-label="Go back"
                disabled={webNavigationBusyAction !== null}
                onClick={() => {
                  void runWebNavigationAction('GoBack');
                }}
              >
                <BackIcon />
              </WebNavigationButton>
              <WebNavigationButton
                aria-label="Go forward"
                disabled={webNavigationBusyAction !== null}
                onClick={() => {
                  void runWebNavigationAction('GoForward');
                }}
              >
                <ForwardIcon />
              </WebNavigationButton>
              {webIsLoading ? (
                <WebNavigationButton
                  aria-label="Stop loading"
                  disabled={webNavigationBusyAction !== null}
                  onClick={() => {
                    void runWebNavigationAction('Stop');
                  }}
                >
                  <StopIcon />
                </WebNavigationButton>
              ) : (
                <WebNavigationButton
                  aria-label="Reload page"
                  disabled={webNavigationBusyAction !== null}
                  onClick={() => {
                    void runWebNavigationAction('Reload');
                  }}
                >
                  <RefreshIcon
                    spinning={webNavigationBusyAction === 'Reload'}
                  />
                </WebNavigationButton>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 justify-end gap-[8.04px]">
          <button
            className={`app-no-drag flex h-8 items-center rounded-lg border border-border-subtle px-3 transition-colors ${
              isConnected
                ? 'bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                : 'bg-transparent'
            } ${
              disconnectDisabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-surface-hover'
            }`}
            disabled={disconnectDisabled}
            onClick={() => {
              if (studioPlayground.phase !== 'ready') {
                return;
              }

              void studioPlayground.controller.actions.destroySession();
              // After tearing down the session, jump back to the
              // Overview page so the user lands on a meaningful screen
              // instead of an empty device pane.
              onSelectOverview?.();
            }}
            type="button"
          >
            <MaskedIcon
              className="mr-[5px] h-3.5 w-3.5 text-text-primary"
              src={assetUrls.main.disconnect}
            />
            <span className="whitespace-nowrap px-[3px] text-[13px] leading-[20px] font-medium text-text-primary">
              Disconnect
            </span>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface">
        <MobilePreviewFrame
          aspectRatio={previewAspectRatio}
          enabled={shouldFrameMobilePreview}
        >
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
                className="cursor-pointer rounded-lg border border-border-subtle px-4 py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover"
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
              className={`box-border h-full w-full ${
                shouldPadDesktopPreview ? 'px-6' : ''
              }`}
            >
              <Suspense
                fallback={
                  <ConnectingPreview
                    pcSrc={assetUrls.main.pc}
                    phoneSrc={assetUrls.main.phone}
                    statusLabel={previewStatusText || previewConnectingLabel}
                  />
                }
              >
                <LazyPlaygroundPreview
                  connectingOverlay={
                    <ConnectingPreview
                      pcSrc={assetUrls.main.pc}
                      phoneSrc={assetUrls.main.phone}
                      statusLabel={previewStatusText || previewConnectingLabel}
                    />
                  }
                  onDeviceSizeChange={setPreviewDeviceSize}
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
          ) : isOpeningSession ? (
            <ConnectingPreview
              pcSrc={assetUrls.main.pc}
              phoneSrc={assetUrls.main.phone}
              statusLabel={previewConnectingLabel}
            />
          ) : (
            <DisconnectedPreview
              iconSrc={assetUrls.main.connectionClosed}
              title={disconnectedPreviewTitle}
            />
          )}
        </MobilePreviewFrame>
      </div>
    </div>
  );
}
