import {
  type DeviceType,
  Logo,
  NavActions,
  type PlaygroundBranding,
  type UniversalPlaygroundConfig,
} from '@midscene/visualizer';
import { Layout } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { DisconnectedPreview } from './DisconnectedPreview';
import { PlaygroundPreview } from './PlaygroundPreview';
import { PlaygroundThemeProvider } from './PlaygroundThemeProvider';
import { PreviewInspectorLayout } from './PreviewInspectorLayout';
import type { PlaygroundControllerResult } from './controller/types';
import { usePlaygroundController } from './controller/usePlaygroundController';
import ServerOfflineBackground from './icons/server-offline-background.svg';
import ServerOfflineForeground from './icons/server-offline-foreground.svg';
import { PlaygroundConversationPanel } from './panels/PlaygroundConversationPanel';
import './PlaygroundApp.less';
import type { PreviewOverlayRenderContext } from './PreviewOverlayLayer';

export interface PlaygroundExtensionContext {
  isUserOperating: boolean;
  playgroundSDK: PlaygroundControllerResult['state']['playgroundSDK'];
  runtimeInfo: PlaygroundControllerResult['state']['runtimeInfo'];
  serverOnline: boolean;
  serverUrl: string;
  sessionConnected: boolean;
}

const { Content } = Layout;

export interface PlaygroundAppProps {
  serverUrl: string;
  appVersion: string;
  title?: string;
  defaultDeviceType?: DeviceType;
  branding?: Partial<PlaygroundBranding>;
  playgroundConfig?: Partial<UniversalPlaygroundConfig>;
  offlineTitle?: string;
  offlineStatusText?: string;
  pollIntervalMs?: number;
  manualPreviewInteractionEnabled?: boolean;
  inspectorOpen?: boolean;
  renderHeaderActions?: (context: PlaygroundExtensionContext) => ReactNode;
  renderInspector?: (context: PlaygroundExtensionContext) => ReactNode;
  renderPreviewOverlay?: (
    context: PlaygroundExtensionContext & PreviewOverlayRenderContext,
  ) => ReactNode;
}

export function PlaygroundApp({
  serverUrl,
  appVersion,
  title = 'Playground',
  defaultDeviceType = 'web',
  branding,
  playgroundConfig,
  offlineTitle = 'Midscene Playground',
  offlineStatusText = 'Server offline...',
  pollIntervalMs = 5000,
  manualPreviewInteractionEnabled = true,
  inspectorOpen,
  renderHeaderActions,
  renderInspector,
  renderPreviewOverlay,
}: PlaygroundAppProps) {
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const inspectorVisible = inspectorOpen ?? Boolean(renderInspector);
  const controller = usePlaygroundController({
    serverUrl,
    defaultDeviceType,
    countdownSeconds: playgroundConfig?.executionUx?.countdownSeconds,
    pollIntervalMs,
  });
  const extensionContext = useMemo<PlaygroundExtensionContext>(
    () => ({
      isUserOperating: controller.state.isUserOperating,
      playgroundSDK: controller.state.playgroundSDK,
      runtimeInfo: controller.state.runtimeInfo,
      serverOnline: controller.state.serverOnline,
      serverUrl,
      sessionConnected: controller.state.sessionViewState.connected,
    }),
    [
      controller.state.isUserOperating,
      controller.state.playgroundSDK,
      controller.state.runtimeInfo,
      controller.state.serverOnline,
      controller.state.sessionViewState.connected,
      serverUrl,
    ],
  );
  const preview = controller.state.sessionViewState.connected ? (
    <PlaygroundPreview
      playgroundSDK={controller.state.playgroundSDK}
      runtimeInfo={controller.state.runtimeInfo}
      serverUrl={serverUrl}
      serverOnline={controller.state.serverOnline}
      isUserOperating={controller.state.isUserOperating}
      manualInteractionEnabled={manualPreviewInteractionEnabled}
      renderOverlay={
        renderPreviewOverlay
          ? (context) =>
              renderPreviewOverlay({ ...extensionContext, ...context })
          : undefined
      }
    />
  ) : (
    <DisconnectedPreview />
  );

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowScreen(window.innerWidth <= 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!controller.state.serverOnline) {
    return (
      <PlaygroundThemeProvider>
        <div className="server-offline-container">
          <div className="server-offline-message">
            <Logo />
            <div className="server-offline-content">
              <div className="server-offline-icon">
                <ServerOfflineBackground className="icon-background" />
                <ServerOfflineForeground className="icon-foreground" />
              </div>
              <h1>{offlineTitle}</h1>
              <p className="connection-status">{offlineStatusText}</p>
            </div>
          </div>
        </div>
      </PlaygroundThemeProvider>
    );
  }

  return (
    <PlaygroundThemeProvider>
      <Layout className="app-container playground-container">
        <Content className="app-content">
          <PanelGroup
            autoSaveId="playground-layout"
            direction={isNarrowScreen ? 'vertical' : 'horizontal'}
          >
            <Panel
              defaultSize={isNarrowScreen ? 67 : 32}
              maxSize={isNarrowScreen ? 85 : 60}
              minSize={isNarrowScreen ? 67 : 25}
              className="app-panel left-panel"
            >
              <div className="panel-content left-panel-content">
                <div className="playground-panel-header">
                  <div className="header-row">
                    <Logo />
                    {renderHeaderActions ? (
                      <div className="playground-header-actions">
                        {renderHeaderActions(extensionContext)}
                        <NavActions
                          showTooltipWhenEmpty={false}
                          showModelName={false}
                          playgroundSDK={controller.state.playgroundSDK}
                        />
                      </div>
                    ) : (
                      <NavActions
                        showTooltipWhenEmpty={false}
                        showModelName={false}
                        playgroundSDK={controller.state.playgroundSDK}
                      />
                    )}
                  </div>
                </div>

                <div className="playground-panel-playground">
                  <PlaygroundConversationPanel
                    controller={controller}
                    appVersion={appVersion}
                    branding={branding}
                    playgroundConfig={playgroundConfig}
                    title={title}
                  />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="panel-resize-handle" />

            <Panel
              defaultSize={isNarrowScreen ? 33 : 68}
              minSize={isNarrowScreen ? 15 : 40}
              className="app-panel right-panel"
            >
              <div className="panel-content right-panel-content">
                {renderInspector &&
                controller.state.sessionViewState.connected ? (
                  <PreviewInspectorLayout
                    inspector={
                      inspectorVisible
                        ? renderInspector(extensionContext)
                        : null
                    }
                    inspectorOpen={inspectorVisible}
                    preview={preview}
                  />
                ) : (
                  preview
                )}
              </div>
            </Panel>
          </PanelGroup>
        </Content>
      </Layout>
    </PlaygroundThemeProvider>
  );
}
