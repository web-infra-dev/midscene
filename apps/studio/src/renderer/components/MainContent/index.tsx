import { PlaygroundPreview } from '@midscene/playground-app';
import { getDebug } from '@midscene/shared/logger';
import type { StudioPlatformId } from '@shared/electron-contract';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
import { isStudioRecorderEntryEnabled } from '../../recorder/feature-flag';
import type { StudioRecorderPanelMode } from '../../recorder/types';
import { useOptionalStudioRecorder } from '../../recorder/useStudioRecorder';
import ConnectingPreview from '../ConnectingPreview';
import ConnectionFailedPreview from '../ConnectionFailedPreview';
import DisconnectedPreview from '../DisconnectedPreview';
import type { ConnectionStatus } from '../PlaygroundShell';
import {
  ApiPlaygroundModeIcon,
  RecorderModeIcon,
} from '../PlaygroundShell/mode-icons';
import type { ShellActiveView } from '../ShellLayout/types';
import { DeviceList } from './DeviceList';
import { MobilePreviewFrame } from './MobilePreviewFrame';
import {
  resolveStudioPreviewPlatform,
  shouldEnableMobilePreviewFrame,
  shouldUseDesktopPreviewPadding,
} from './preview-layout';

const debugWebNavigation = getDebug('studio:web-navigation', { console: true });

export interface MainContentProps {
  activeView: ShellActiveView;
  /** Shell-level "user just clicked this platform" hint. Bridges the gap
   * between a click in Sidebar (or Overview cards) and antd Form.useWatch
   * actually propagating the new platformId — without it, ConnectingPreview
   * renders the Android phone icon for one frame on PC/Web. */
  pendingCreatePlatform?: StudioPlatformId;
  /** Lets MainContent push the same hint back to the shell when it owns
   * the click path (Overview Open Page / iOS form / Computer card). */
  onPendingCreatePlatformChange?: (
    platform: StudioPlatformId | undefined,
  ) => void;
  onSelectDeviceView?: () => void;
  onSelectOverview?: () => void;
  /**
   * False when the required model connection env cannot be resolved; the
   * Overview surfaces a banner pointing to the env modal in that case.
   */
  modelConfigComplete?: boolean;
  /** Raw env text — previewed inline in the Model Config card. */
  modelEnvText?: string;
  /** Opens the model env config modal anchored in the shell. */
  onOpenEnvModal?: () => void;
  rightPanelMode?: StudioRecorderPanelMode;
  onRightPanelModeChange?: (mode: StudioRecorderPanelMode) => void;
  /** Left inset reserved by the collapsed shell titlebar controls. */
  titlebarInsetLeft?: number;
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
      return assetUrls.main.platformPc;
    case 'web':
      return assetUrls.main.platformWeb;
    case 'ios':
      return assetUrls.main.platformIos;
    case 'harmony':
      return assetUrls.main.platformHarmony;
    case 'android':
      return assetUrls.main.platformAndroid;
    default:
      return assetUrls.main.platformAndroid;
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

function PreviewToolbarIcon({
  label,
  onClick,
  selected,
  children,
}: {
  label: string;
  onClick?: () => void;
  selected?: boolean;
  children: ReactNode;
}) {
  const backgroundClassName = selected
    ? 'bg-surface-hover dark:bg-white/[0.12]'
    : 'bg-transparent hover:bg-surface-hover';

  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className={`inline-flex h-[28px] w-[28px] shrink-0 cursor-pointer appearance-none items-center justify-center rounded-[7px] border-0 p-0 text-text-secondary [&>img]:h-[16px] [&>img]:w-[16px] [&>svg]:h-[16px] [&>svg]:w-[16px] ${backgroundClassName}`}
      data-selected={selected ? 'true' : undefined}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
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
    <>
      <button
        aria-label="Refresh devices"
        className="app-no-drag absolute right-[16px] top-[10px] z-10 flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[8px] border border-border-subtle bg-transparent text-text-secondary transition-colors hover:bg-surface-hover-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        <RefreshIcon spinning={refreshing} />
      </button>
    </>
  );
}

export default function MainContent({
  activeView,
  pendingCreatePlatform,
  onPendingCreatePlatformChange,
  onSelectDeviceView,
  onSelectOverview,
  modelConfigComplete = true,
  modelEnvText,
  onOpenEnvModal,
  onRightPanelModeChange,
  rightPanelMode = 'playground',
  titlebarInsetLeft = 0,
}: MainContentProps) {
  const studioPlayground = useStudioPlayground();
  const recorder = useOptionalStudioRecorder();
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
  const setPendingCreatePlatform = onPendingCreatePlatformChange;
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
  const resolvedPreviewPlatform = resolveStudioPreviewPlatform(
    runtimeInfo,
    previewFormValues,
  );
  const isSessionMutating =
    isReady && studioPlayground.controller.state.sessionMutating;
  // Prefer the platform whichever path has already settled. When we
  // just kicked off a session from Overview, antd's form-watch update
  // hasn't propagated yet — keep the click-time pending platform ahead
  // of stale form/runtime state so the connecting overlay locks onto the
  // correct icon immediately.
  const previewPlatform =
    pendingCreatePlatform && (!isConnected || isSessionMutating)
      ? pendingCreatePlatform
      : (resolvedPreviewPlatform ?? pendingCreatePlatform);
  const showWebNavigation = isConnected && previewPlatform === 'web';
  const previewConnectingLabel = getPreviewConnectingLabel(previewPlatform);
  const disconnectedPreviewTitle = getDisconnectedPreviewTitle(previewPlatform);
  const isOpeningSession = isReady && !isConnected && isSessionMutating;
  const disconnectDisabled =
    !isReady || !studioPlayground.controller.state.sessionViewState.connected;
  const previewConnectionFailed =
    previewStatus === 'error' || previewStatus === 'disconnected';
  const connectionStatus: ConnectionStatus = previewConnectionFailed
    ? 'failed'
    : isConnected
      ? 'connected'
      : 'disconnected';

  const previewHeaderSubInfo: { key: string; text: string }[] = [];
  if (isConnected && previewDeviceId) {
    const idLabel =
      previewPlatform === 'android' || previewPlatform === 'harmony'
        ? `ADB Device: ${previewDeviceId}`
        : previewPlatform === 'computer'
          ? `Display: ${previewDeviceId}`
          : previewPlatform === 'ios'
            ? `WDA: ${previewDeviceId}`
            : previewDeviceId;
    previewHeaderSubInfo.push({ key: 'device-id', text: idLabel });
  }
  if (previewDeviceSize) {
    previewHeaderSubInfo.push({
      key: 'viewport',
      text: `Viewport: ${previewDeviceSize.width} x ${previewDeviceSize.height}`,
    });
  }
  const pillStatusLabel: Record<ConnectionStatus, string> = {
    connected: 'Live',
    disconnected: 'Idle',
    failed: 'Failed',
  };
  // Pill chrome — adopts the imported "Live" tag visual (rounded background,
  // status dot + label) and doubles as the disconnect control. Hover reveals
  // a black tooltip ported from the FloatingLayer mock.
  const pillPalette: Record<
    ConnectionStatus,
    { bg: string; fg: string; dot: string }
  > = {
    connected: { bg: '#DEEBEC', fg: '#42B56C', dot: '#42B56C' },
    disconnected: { bg: '#ECECEC', fg: '#818283', dot: '#B6B6B6' },
    failed: { bg: '#FDE7E7', fg: '#C0392B', dot: '#E53935' },
  };
  const pillColors = pillPalette[connectionStatus];
  const selectedPreviewToolbarKey =
    rightPanelMode === 'recorder' ? 'recorder' : 'api-playground';
  const previewToolbarIcons = isStudioRecorderEntryEnabled()
    ? [
        {
          icon: <RecorderModeIcon />,
          key: 'recorder',
          label: 'Recorder',
          mode: 'recorder' as const,
        },
        {
          icon: <ApiPlaygroundModeIcon />,
          key: 'api-playground',
          label: 'API Playground',
          mode: 'playground' as const,
        },
      ]
    : [];
  const stopRecordingBeforeSessionDestroy = async () => {
    if (recorder?.state.isRecording) {
      await recorder.stopRecording();
    }
  };

  useEffect(() => {
    if (!isConnected) {
      setPreviewStatus(null);
      setPreviewStatusText(null);
      setPreviewDeviceSize(null);
      setWebNavigationBusyAction(null);
      setWebIsLoading(false);
    }
  }, [isConnected]);

  // Drop the pending-platform override once antd's form watch (or
  // runtimeInfo) catches up — from then on `resolvedPreviewPlatform`
  // is the source of truth.
  useEffect(() => {
    if (
      resolvedPreviewPlatform &&
      pendingCreatePlatform &&
      resolvedPreviewPlatform === pendingCreatePlatform
    ) {
      setPendingCreatePlatform?.(undefined);
    }
  }, [
    resolvedPreviewPlatform,
    pendingCreatePlatform,
    setPendingCreatePlatform,
  ]);

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
    const sdk = webNavigationSDK;
    if (
      studioPlayground.phase !== 'ready' ||
      !sdk ||
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
      const result = await sdk.interact({
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
        <div className="app-drag absolute left-0 right-0 top-0 z-0 h-[48px]" />
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
          modelConfigComplete={modelConfigComplete}
          modelEnvText={modelEnvText}
          onOpenEnvModal={onOpenEnvModal}
          sessionMutating={
            isReady ? studioPlayground.controller.state.sessionMutating : false
          }
          onCreateWebSession={async ({
            headed,
            url,
            viewportHeight,
            viewportWidth,
          }) => {
            if (!isReady) return;
            const { actions, state } = studioPlayground.controller;
            const selectionValues = {
              platformId: 'web' as const,
              'web.url': url,
              'web.viewportWidth': viewportWidth,
              'web.viewportHeight': viewportHeight,
              'web.headed': headed,
            };
            setPendingCreatePlatform?.('web');
            state.form.setFieldsValue(selectionValues);
            onSelectDeviceView?.();
            if (state.sessionViewState.connected) {
              await stopRecordingBeforeSessionDestroy();
              await actions.destroySession();
            }
            await actions.createSession({
              ...state.form.getFieldsValue(true),
              ...selectionValues,
            });
            // The page is settled into waitForNetworkIdle by the time
            // createSession resolves, but the MJPEG <img> doesn't mount
            // until React commits the new "connected" state and the
            // browser opens the /mjpeg HTTP request. If we fire Reload
            // immediately, page.reload() generates frames *before* any
            // subscriber is attached — by the time the <img> connects,
            // the page is idle again and CDP screencast emits nothing
            // new, so the user sees a blank canvas. Wait long enough for
            // the React commit + browser MJPEG handshake to complete
            // (~1.5s in practice) before triggering the reload that
            // actually pushes a frame to the now-attached subscriber.
            window.setTimeout(() => {
              if (studioPlayground.phase !== 'ready') return;
              const sdk = studioPlayground.controller.state.playgroundSDK;
              void sdk
                .interact({ actionType: 'Reload' })
                .catch((error: unknown) => {
                  debugWebNavigation(
                    'post-create web reload failed: %s',
                    error,
                  );
                });
            }, 1500);
          }}
          onCreateIOSSession={async ({ host, port }) => {
            if (!isReady) return;
            const { actions, state } = studioPlayground.controller;
            const selectionValues = {
              platformId: 'ios' as const,
              'ios.host': host,
              'ios.port': port,
            };
            setPendingCreatePlatform?.('ios');
            state.form.setFieldsValue(selectionValues);
            onSelectDeviceView?.();
            if (state.sessionViewState.connected) {
              await stopRecordingBeforeSessionDestroy();
              await actions.destroySession();
            }
            await actions.createSession({
              ...state.form.getFieldsValue(true),
              ...selectionValues,
            });
          }}
          onConnect={async (platform, device) => {
            if (!isReady) {
              return;
            }
            const { actions, state } = studioPlayground.controller;
            const selectionValues = buildDeviceSelectionFormValues(
              platform,
              device,
            );
            setPendingCreatePlatform?.(platform);
            onSelectDeviceView?.();
            if (
              connectedDeviceId === device.id ||
              (device.selected && device.status === 'active')
            ) {
              return;
            }
            state.form.setFieldsValue(selectionValues);
            if (state.sessionViewState.connected) {
              await stopRecordingBeforeSessionDestroy();
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
              await stopRecordingBeforeSessionDestroy();
              await actions.destroySession();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[12px] bg-surface ${
        rightPanelMode === 'recorder' ? '' : 'border-r border-border-subtle'
      }`}
    >
      {/*
       * Device-preview top bar: icon + device name with ADB / Viewport meta
       * on the left, and a pill-shaped status/disconnect control on the
       * right that reveals a "Disconnect" tooltip on hover.
       */}
      <div
        className="app-drag relative flex h-[52px] items-center justify-between bg-surface pl-[8px] pr-4"
        style={
          titlebarInsetLeft > 0 ? { paddingLeft: titlebarInsetLeft } : undefined
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-[8px]">
          <div className="ml-[8px] flex h-[32px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border-subtle bg-surface-muted">
            <img
              alt=""
              aria-hidden="true"
              className="h-[26px] w-[26px] object-contain"
              src={resolvePlatformLogo(previewPlatform)}
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span
              className="max-w-[220px] truncate text-[14px] leading-[22px] font-medium text-text-primary"
              title={deviceLabel}
            >
              {deviceLabel}
            </span>
            {previewHeaderSubInfo.length > 0 ? (
              <span
                className="flex items-center gap-[8px] text-[10px] leading-[12px] font-normal"
                style={{ color: 'rgba(13, 13, 13, 0.5)' }}
              >
                {previewHeaderSubInfo.map((item, index) => (
                  <span
                    key={item.key}
                    className="flex items-center gap-[8px] min-w-0"
                  >
                    {index > 0 ? (
                      <span
                        aria-hidden="true"
                        className="h-[12px] w-px shrink-0"
                        style={{ backgroundColor: 'rgba(0, 0, 0, 0.08)' }}
                      />
                    ) : null}
                    <span className="max-w-[220px] truncate" title={item.text}>
                      {item.text}
                    </span>
                  </span>
                ))}
              </span>
            ) : null}
          </div>
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

        <div className="app-no-drag flex h-[28px] shrink-0 items-center gap-[8px]">
          <div className="app-no-drag group/disconnect-pill relative flex shrink-0 items-center">
            <button
              aria-label="Disconnect"
              className="inline-flex h-[20px] items-center gap-[4px] rounded-[10px] border-0 px-[7px] text-[11px] font-medium leading-none transition-[filter,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-60 hover:[&:not(:disabled)]:brightness-95"
              disabled={disconnectDisabled}
              onClick={() => {
                if (studioPlayground.phase !== 'ready') {
                  return;
                }

                void (async () => {
                  await stopRecordingBeforeSessionDestroy();
                  await studioPlayground.controller.actions.destroySession();
                })();
                // After tearing down the session, jump back to the
                // Overview page so the user lands on a meaningful screen
                // instead of an empty device pane.
                onSelectOverview?.();
              }}
              style={{
                background: pillColors.bg,
                color: pillColors.fg,
                cursor: disconnectDisabled ? undefined : 'pointer',
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="h-[6px] w-[6px] rounded-full"
                style={{
                  background: pillColors.dot,
                  outline: `1.4px solid ${pillColors.dot}40`,
                }}
              />
              <span className="whitespace-nowrap">
                {pillStatusLabel[connectionStatus]}
              </span>
            </button>
            {!disconnectDisabled ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-full z-20 flex flex-col items-end pt-[4px] opacity-0 transition-opacity duration-150 group-hover/disconnect-pill:opacity-100"
              >
                <span
                  className="mr-[14px] -mb-[1px] h-[6.7px] w-[10px]"
                  style={{
                    backgroundColor: '#090909',
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                  }}
                />
                <span
                  className="whitespace-nowrap rounded-[4px] px-[12px] py-[8px] text-[12px] leading-[20px] font-medium text-white"
                  style={{ backgroundColor: '#000000' }}
                >
                  Disconnect
                </span>
              </div>
            ) : null}
          </div>
          {previewToolbarIcons.map((item) => (
            <PreviewToolbarIcon
              key={item.key}
              label={item.label}
              onClick={() => onRightPanelModeChange?.(item.mode)}
              selected={item.key === selectedPreviewToolbarKey}
            >
              {item.icon}
            </PreviewToolbarIcon>
          ))}
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
              <PlaygroundPreview
                connectingOverlay={
                  <ConnectingPreview
                    iconSrc={resolvePlatformLogo(previewPlatform)}
                    iconVariant={
                      previewPlatform === 'ios' ||
                      previewPlatform === 'android' ||
                      previewPlatform === 'harmony'
                        ? 'phone'
                        : 'desktop'
                    }
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
                playgroundSDK={studioPlayground.controller.state.playgroundSDK}
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
            </div>
          ) : isOpeningSession ? (
            <ConnectingPreview
              iconSrc={resolvePlatformLogo(previewPlatform)}
              iconVariant={
                previewPlatform === 'ios' ||
                previewPlatform === 'android' ||
                previewPlatform === 'harmony'
                  ? 'phone'
                  : 'desktop'
              }
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
