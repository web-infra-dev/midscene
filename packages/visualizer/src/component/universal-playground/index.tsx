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
import { PlaygroundResultView } from '../playground-result';
import './index.less';
import PlaygroundIcon from '../../icons/avatar.svg';
import { PromptInput } from '../prompt-input';

const { Text } = Typography;

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
  const { deepThink, screenshotIncluded, domIncluded, config } = useEnvConfig();

  // Use custom hooks for state management
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
    refreshContext,
    handleScrollToBottom,
  } = usePlaygroundState(playgroundSDK, storage, contextProvider);

  // Use execution hook
  const {
    handleRun: executeAction,
    handleStop,
    canStop,
  } = usePlaygroundExecution(
    playgroundSDK,
    storage,
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
    // Pass the complete config, not just the UI-specific fields
    const completeConfig = {
      ...config,
      deepThink,
      screenshotIncluded,
      domIncluded,
    };
    if (playgroundSDK.overrideConfig) {
      playgroundSDK.overrideConfig(completeConfig).catch((error) => {
        console.error('Failed to override SDK config:', error);
      });
    }
  }, [playgroundSDK, config, deepThink, screenshotIncluded, domIncluded]);

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
  const runButtonEnabled = !dryMode && !actionSpaceLoading;

  // Get the currently selected type
  const selectedType = Form.useWatch('type', form);

  // Apply configuration
  const finalShowContextPreview =
    showContextPreview && componentConfig.showContextPreview !== false;
  const enablePersistence = componentConfig.enablePersistence !== false;
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
          {infoList.length > 1 && enablePersistence && (
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
