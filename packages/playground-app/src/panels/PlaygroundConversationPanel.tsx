import {
  type PlaygroundBranding,
  UniversalPlayground,
  type UniversalPlaygroundConfig,
} from '@midscene/visualizer';
import { Alert, Button, Modal } from 'antd';
import type { ReactNode } from 'react';
import { SessionSetupPanel } from '../SessionSetupPanel';
import {
  buildConversationBranding,
  buildConversationConfig,
} from '../controller/selectors';
import type { PlaygroundControllerResult } from '../controller/types';
import './PlaygroundConversationPanel.less';

export interface PlaygroundConversationPanelProps {
  controller: PlaygroundControllerResult;
  appVersion: string;
  title?: string;
  branding?: Partial<PlaygroundBranding>;
  playgroundConfig?: Partial<UniversalPlaygroundConfig>;
  header?: ReactNode;
  className?: string;
  /**
   * Extra class applied to the inner `UniversalPlayground` root.
   * Use this when the host needs an opt-in visual skin without widening
   * the shared `UniversalPlaygroundConfig` surface.
   */
  playgroundClassName?: string;
  /**
   * Custom content shown while the session is not yet connected.
   * When supplied, replaces the built-in `SessionSetupPanel`, letting hosts
   * drive device selection elsewhere.
   */
  notConnectedFallback?: ReactNode;
}

export function PlaygroundConversationPanel({
  controller,
  appVersion,
  title = 'Playground',
  branding,
  playgroundConfig,
  header,
  className,
  playgroundClassName,
  notConnectedFallback,
}: PlaygroundConversationPanelProps) {
  const { state, actions } = controller;
  const mergedConfig = buildConversationConfig(state, playgroundConfig);
  const mergedBranding = buildConversationBranding(
    state.runtimeInfo,
    title,
    appVersion,
    state.deviceType,
    branding,
  );

  return (
    <div
      className={['playground-conversation-panel', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Modal
        open={state.countdown !== null}
        footer={
          <Button onClick={actions.finishCountdown} type="default">
            Skip countdown
          </Button>
        }
        closable
        maskClosable
        onCancel={actions.finishCountdown}
        centered
        width={400}
        style={{ top: '30%' }}
        styles={{
          mask: { backgroundColor: 'rgba(0, 0, 0, 0.75)' },
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}
        >
          <div
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: state.countdown === 'GO!' ? '#52c41a' : '#1890ff',
              marginBottom: '24px',
              lineHeight: 1,
            }}
          >
            {state.countdown}
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 500,
              marginBottom: '12px',
            }}
          >
            Automation Starting Soon
          </div>
          <div
            style={{
              fontSize: '14px',
              color: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            The selected session requested a countdown before execution.
            <br />
            Please wait until the run starts.
          </div>
        </div>
      </Modal>
      {header}
      <div className="playground-conversation-body">
        {!state.serverOnline ? (
          <div className="playground-conversation-offline">
            <Alert
              type="warning"
              showIcon
              message="Playground server offline"
              description="Reconnect the runtime to continue using the Android playground."
            />
          </div>
        ) : state.sessionViewState.connected ? (
          <UniversalPlayground
            playgroundSDK={state.playgroundSDK}
            config={mergedConfig}
            branding={mergedBranding}
            className={['playground-container', playgroundClassName]
              .filter(Boolean)
              .join(' ')}
          />
        ) : notConnectedFallback !== undefined ? (
          <>{notConnectedFallback}</>
        ) : (
          <SessionSetupPanel
            form={state.form}
            sessionSetup={state.sessionSetup}
            sessionSetupError={state.sessionSetupError}
            sessionViewState={state.sessionViewState}
            sessionLoading={state.sessionLoading}
            sessionMutating={state.sessionMutating}
            onCreateSession={async () => {
              await actions.createSession();
            }}
          />
        )}
      </div>
    </div>
  );
}
