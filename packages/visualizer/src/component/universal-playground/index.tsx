import Icon, {
  ClearOutlined,
  LoadingOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { Button, Form, List, Tooltip, Typography, message } from 'antd';
import { useCallback, useEffect } from 'react';
import { usePlaygroundExecution } from '../../hooks/usePlaygroundExecution';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { useEnvConfig } from '../../store/store';
import type { FormValue, UniversalPlaygroundProps } from '../../types';
import { ContextPreview } from '../context-preview';
import { EnvConfigReminder } from '../env-config-reminder';
import { PlaygroundResultView } from '../playground-result';
import './index.less';
import PlaygroundIcon from '../../icons/avatar.svg';
import { PromptInput } from '../prompt-input';
import { LocalStorageProvider } from './providers/storage-provider';

const { Text } = Typography;

// Function to get stable ID for SDK (adapter-driven)
function getSDKId(sdk: any): string {
  // Primary: Use adapter ID if available (works for both remote and local)
  if (sdk.id && typeof sdk.id === 'string') {
    return `agent-${sdk.id}`;
  }
  // Fallback: Use default when ID is not available
  return 'playground-default';
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;
  return (
    <Tooltip
      title={
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error}
        </span>
      }
      overlayStyle={{ maxWidth: '100vw' }}
    >
      Error: {error.split('\n')[0]}
    </Tooltip>
  );
}

export function UniversalPlayground({
  playgroundSDK,
  storage,
  contextProvider,
  config: componentConfig = {},
  branding = {},
  className = '',
  dryMode = false,
  showContextPreview = true,
}: UniversalPlaygroundProps) {
  const [form] = Form.useForm();
  const { config } = useEnvConfig();

  // Use custom hooks for state management
  // Determine the storage provider based on configuration
  const effectiveStorage = (() => {
    // If external storage is provided, use it
    if (storage) {
      return storage;
    }

    // Otherwise, create LocalStorageProvider with unique namespace
    // Priority: explicit storageNamespace > auto-generated SDK ID
    const namespace =
      componentConfig.storageNamespace || getSDKId(playgroundSDK);
    return new LocalStorageProvider(namespace);
  })();

  const {
    loading,
    setLoading,
    infoList,
    setInfoList,
    actionSpace,
    actionSpaceLoading,
    uiContextPreview,
    setUiContextPreview,
    showScrollToBottomButton,
    verticalMode,
    replayCounter,
    setReplayCounter,
    infoListRef,
    currentRunningIdRef,
    interruptedFlagRef,
    clearInfoList,
    handleScrollToBottom,
  } = usePlaygroundState(playgroundSDK, effectiveStorage, contextProvider);

  // Use execution hook
  const {
    handleRun: executeAction,
    handleStop,
    canStop,
  } = usePlaygroundExecution(
    playgroundSDK,
    effectiveStorage,
    actionSpace,
    loading,
    setLoading,
    infoList,
    setInfoList,
    replayCounter,
    setReplayCounter,
    verticalMode,
    currentRunningIdRef,
    interruptedFlagRef,
  );

  // Override SDK config when environment config changes
  useEffect(() => {
    // Only pass global config, not execution options like deepThink, screenshotIncluded, domIncluded
    // These execution options will be passed through ExecutionOptions during execution
    if (playgroundSDK?.overrideConfig && config) {
      playgroundSDK.overrideConfig(config).catch((error) => {
        console.error('Failed to override SDK config:', error);
      });
    }
  }, [playgroundSDK, config]);

  // Handle form submission with error handling
  const handleFormRun = useCallback(async () => {
    try {
      const value = form.getFieldsValue() as FormValue;
      await executeAction(value);
    } catch (error: any) {
      message.error(error?.message || 'Execution failed');
    }
  }, [form, executeAction]);

  // Check if run button should be enabled
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const runButtonEnabled =
    componentConfig.serverMode ||
    (!dryMode && !actionSpaceLoading && configAlreadySet);

  // Get the currently selected type
  const selectedType = Form.useWatch('type', form);

  // Apply configuration
  const finalShowContextPreview =
    showContextPreview && componentConfig.showContextPreview !== false;
  const layout = componentConfig.layout || 'vertical';
  const showVersionInfo = componentConfig.showVersionInfo !== false;

  return (
    <div className={`playground-container ${layout}-mode ${className}`.trim()}>
      <Form form={form} onFinish={handleFormRun} className="command-form">
        {/* Context Preview Section */}
        {finalShowContextPreview && (
          <div className="context-preview-section">
            <ContextPreview
              uiContextPreview={uiContextPreview}
              setUiContextPreview={setUiContextPreview}
              showContextPreview={finalShowContextPreview}
            />
          </div>
        )}

        {/* Main Dialog Area */}
        <div className="middle-dialog-area">
          {/* Clear Button */}
          {infoList.length > 1 && (
            <div className="clear-button-container">
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={clearInfoList}
                type="text"
                className="clear-button"
              />
            </div>
          )}

          {/* Info List */}
          <div ref={infoListRef} className="info-list-container">
            <List
              itemLayout="vertical"
              dataSource={infoList}
              renderItem={(item) => (
                <List.Item key={item.id} className="list-item">
                  {/* User Message */}
                  {item.type === 'user' ? (
                    <div className="user-message-container">
                      <div className="user-message-bubble">{item.content}</div>
                    </div>
                  ) : item.type === 'progress' ? (
                    /* Progress Message */
                    <div>
                      {(() => {
                        const parts = item.content.split(' - ');
                        const action = parts[0]?.trim();
                        const description = parts.slice(1).join(' - ').trim();

                        const currentIndex = infoList.findIndex(
                          (listItem) => listItem.id === item.id,
                        );
                        const laterProgressExists = infoList
                          .slice(currentIndex + 1)
                          .some((listItem) => listItem.type === 'progress');
                        const isLatestProgress = !laterProgressExists;
                        const shouldShowLoading = loading && isLatestProgress;

                        return (
                          <>
                            {action && (
                              <span className="progress-action-item">
                                {action}
                                <span
                                  className={`progress-status-icon ${
                                    shouldShowLoading
                                      ? 'loading'
                                      : item.result?.error
                                        ? 'error'
                                        : 'completed'
                                  }`}
                                >
                                  {shouldShowLoading ? (
                                    <LoadingOutlined spin />
                                  ) : item.result?.error ? (
                                    '✗'
                                  ) : (
                                    '✓'
                                  )}
                                </span>
                              </span>
                            )}
                            {description && (
                              <div>
                                <span className="progress-description">
                                  {description}
                                </span>
                              </div>
                            )}
                            {item.result?.error && (
                              <ErrorMessage error={item.result.error} />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : item.type === 'separator' ? (
                    /* Separator Message */
                    <div className="new-conversation-separator">
                      <div className="separator-line" />
                      <div className="separator-text-container">
                        <Text type="secondary" className="separator-text">
                          {item.content}
                        </Text>
                      </div>
                    </div>
                  ) : (
                    /* System Message */
                    <div className="system-message-container">
                      <div className="system-message-header">
                        <Icon
                          component={branding.icon || PlaygroundIcon}
                          style={{ fontSize: 20 }}
                        />
                        <span className="system-message-title">
                          {branding.title || 'Playground'}
                        </span>
                      </div>
                      {(item.content || item.result) && (
                        <div className="system-message-content">
                          {item.type === 'result' && item.result?.error && (
                            <div className="error-message">
                              <div className="divider" />
                              <ErrorMessage error={item.result.error} />
                            </div>
                          )}
                          {item.type === 'result' ? (
                            <PlaygroundResultView
                              result={item.result || null}
                              loading={item.loading || false}
                              serverValid={true}
                              serviceMode={'Server'}
                              replayScriptsInfo={item.replayScriptsInfo || null}
                              replayCounter={item.replayCounter || 0}
                              loadingProgressText={
                                item.loadingProgressText || ''
                              }
                              verticalMode={item.verticalMode || false}
                              fitMode="width"
                            />
                          ) : (
                            <>
                              <div className="system-message-text">
                                {item.content}
                              </div>
                              {item.loading && item.loadingProgressText && (
                                <div className="loading-progress-text">
                                  <span>{item.loadingProgressText}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </List.Item>
              )}
            />
          </div>

          {/* Scroll to Bottom Button */}
          {showScrollToBottomButton &&
            componentConfig.enableScrollToBottom !== false && (
              <Button
                className="scroll-to-bottom-button"
                type="primary"
                shape="circle"
                icon={<ArrowDownOutlined />}
                onClick={handleScrollToBottom}
                size="large"
              />
            )}
        </div>

        {/* Bottom Input Section */}
        <div className="bottom-input-section">
          {componentConfig.showEnvConfigReminder ? <EnvConfigReminder /> : null}
          <PromptInput
            runButtonEnabled={runButtonEnabled}
            form={form}
            serviceMode={'Server'}
            selectedType={selectedType}
            dryMode={dryMode}
            stoppable={canStop}
            loading={loading}
            onRun={handleFormRun}
            onStop={handleStop}
            actionSpace={actionSpace}
          />
        </div>

        {/* Version Info Section */}
        {showVersionInfo && branding.version && (
          <div className="version-info-section">
            <span className="version-text">
              Midscene.js version: {branding.version}
            </span>
          </div>
        )}
      </Form>
    </div>
  );
}

export default UniversalPlayground;
