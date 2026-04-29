import Icon, {
  ClearOutlined,
  LoadingOutlined,
  ArrowDownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form, List, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaygroundExecution } from '../../hooks/usePlaygroundExecution';
import { usePlaygroundState } from '../../hooks/usePlaygroundState';
import { useEnvConfig } from '../../store/store';
import type { FormValue, UniversalPlaygroundProps } from '../../types';
import { ContextPreview } from '../context-preview';
import { EnvConfigReminder } from '../env-config-reminder';
import { PlaygroundResultView } from '../playground-result';
import './index.less';
import PlaygroundIcon from '../../icons/avatar.svg';
import { defaultMainButtons } from '../../utils/constants';
import { resolveProgressActionIcon } from '../../utils/progress-action-icon';
import { PromptInput } from '../prompt-input';
import ShinyText from '../shiny-text';
import {
  createStorageProvider,
  detectBestStorageType,
} from './providers/storage-provider';

const { Text } = Typography;

// Function to get stable ID for SDK (adapter-driven)
function getSDKId(sdk: any): string {
  // Handle null/undefined SDK
  if (!sdk) {
    return 'playground-default';
  }
  // Primary: Use adapter ID if available (works for both remote and local)
  if (sdk.id && typeof sdk.id === 'string') {
    return `agent-${sdk.id}`;
  }
  // Fallback: Use default when ID is not available
  return 'playground-default';
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;
  // Ensure only one "Error: " prefix and style it red
  const cleanError = error.replace(/^(Error:\s*)+/, 'Error: ');
  return (
    <Alert
      message={<span style={{ color: '#ff4d4f' }}>{cleanError}</span>}
      type="error"
      showIcon
    />
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
  const [sdkReady, setSdkReady] = useState(false);

  // Initialize form with default type on mount
  useEffect(() => {
    form.setFieldsValue({
      type: defaultMainButtons[0],
    });
  }, [form]);

  // Initialize SDK ID on mount for remote execution
  useEffect(() => {
    const initializeSDK = async () => {
      if (playgroundSDK && typeof playgroundSDK.checkStatus === 'function') {
        try {
          await playgroundSDK.checkStatus();
          setSdkReady(true);
        } catch (error) {
          console.warn(
            'Failed to initialize SDK, using default namespace:',
            error,
          );
          setSdkReady(true); // Still proceed with default
        }
      } else {
        setSdkReady(true); // For local execution, no need to wait
      }
    };

    initializeSDK();
  }, [playgroundSDK]);

  // Use custom hooks for state management
  // Determine the storage provider based on configuration
  const effectiveStorage = useMemo(() => {
    // If external storage is provided, use it
    if (storage) {
      return storage;
    }

    // Wait for SDK to be ready before creating storage
    if (!sdkReady) {
      return null;
    }

    // Otherwise, create the best available storage provider with unique namespace
    // Priority: explicit storageNamespace > auto-generated SDK ID
    const namespace =
      componentConfig.storageNamespace || getSDKId(playgroundSDK);

    // Detect and use the best available storage type
    const bestStorageType = detectBestStorageType();
    console.log(`Using ${bestStorageType} storage for namespace: ${namespace}`);

    return createStorageProvider(bestStorageType, namespace);
  }, [storage, sdkReady, componentConfig.storageNamespace, playgroundSDK]);

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
  } = usePlaygroundState(
    playgroundSDK,
    effectiveStorage,
    contextProvider,
    branding.targetName,
  );

  // Use execution hook
  const {
    handleRun: executeAction,
    handleStop,
    canStop,
  } = usePlaygroundExecution({
    playgroundSDK,
    storage: effectiveStorage,
    actionSpace,
    loading,
    setLoading,
    setInfoList,
    replayCounter,
    setReplayCounter,
    verticalMode,
    currentRunningIdRef,
    interruptedFlagRef,
    deviceType: componentConfig.deviceType,
  });

  // Override SDK config when environment config changes
  useEffect(() => {
    // Only pass global config, not execution options like deepLocate, screenshotIncluded, domIncluded
    // These execution options will be passed through ExecutionOptions during execution
    if (playgroundSDK?.overrideConfig && config) {
      playgroundSDK.overrideConfig(config).catch((error) => {
        console.error('Failed to override SDK config:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`Failed to apply AI configuration: ${errorMsg}`);
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

  // Get the currently selected type.
  // `Form.useWatch` returns `undefined` on the first render before the form
  // initialises its values, so we fall back to `getFieldValue` to avoid a
  // one-frame window where downstream consumers (e.g. PromptInput minimal
  // chrome) observe an empty type and run type-sync effects unnecessarily.
  const watchedType = Form.useWatch('type', form);
  const selectedType = watchedType || form.getFieldValue('type');

  // Determine service mode based on SDK adapter type
  const serviceMode = useMemo(() => {
    if (!playgroundSDK || typeof playgroundSDK.getServiceMode !== 'function') {
      return 'Server'; // Default fallback
    }
    return playgroundSDK.getServiceMode();
  }, [playgroundSDK]);

  // Apply configuration
  const finalShowContextPreview =
    showContextPreview && componentConfig.showContextPreview !== false;
  const layout = componentConfig.layout || 'vertical';
  const showVersionInfo = componentConfig.showVersionInfo !== false;
  const deviceType = componentConfig.deviceType;
  const executionFlowConfig = componentConfig.executionFlow ?? {};
  const collapsibleProgressGroup = executionFlowConfig.collapsible === true;
  const progressGroupLabel = executionFlowConfig.label ?? 'Execution Flow';

  // Collapse state for progress groups, keyed by the id of the first progress
  // item of each run. A run is a maximal sequence of consecutive `progress`
  // items without any non-progress item interrupting it.
  const [collapsedProgressGroups, setCollapsedProgressGroups] = useState<
    Set<string>
  >(() => new Set());

  const toggleProgressGroup = useCallback((groupId: string) => {
    setCollapsedProgressGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  /*
   * Walk `infoList` once and compute two things:
   *   1. which item ids are the FIRST progress item of a run (they carry the
   *      collapsible header);
   *   2. the visible list after hiding items that belong to a collapsed run.
   * Both are derived memos so the render loop below can stay declarative.
   */
  const { firstInProgressGroup, visibleInfoList } = useMemo(() => {
    const firstIds = new Set<string>();
    const visible: typeof infoList = [];
    let currentGroupFirstId: string | null = null;
    for (const item of infoList) {
      if (item.type === 'progress') {
        if (currentGroupFirstId === null) {
          currentGroupFirstId = item.id;
          firstIds.add(item.id);
          visible.push(item);
          continue;
        }
        if (
          !collapsibleProgressGroup ||
          !collapsedProgressGroups.has(currentGroupFirstId)
        ) {
          visible.push(item);
        }
      } else {
        currentGroupFirstId = null;
        visible.push(item);
      }
    }
    return { firstInProgressGroup: firstIds, visibleInfoList: visible };
  }, [collapsedProgressGroups, collapsibleProgressGroup, infoList]);

  // Precompute the id of the latest progress item once so each renderItem
  // can do a single string compare instead of re-scanning `infoList` with
  // `findIndex` + `slice` on every render. On long agent runs that scan was
  // the dominant cost — O(n) per progress item × N items = O(n²) per state
  // update, visibly stuttering the UI at 15+ steps.
  const latestProgressId = useMemo(() => {
    for (let i = infoList.length - 1; i >= 0; i--) {
      if (infoList[i].type === 'progress') return infoList[i].id;
    }
    return null;
  }, [infoList]);

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
          {componentConfig.showClearButton !== false && infoList.length > 1 && (
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
              dataSource={visibleInfoList}
              renderItem={(item) => (
                <List.Item key={item.id} className="list-item">
                  {collapsibleProgressGroup &&
                  firstInProgressGroup.has(item.id) ? (
                    <button
                      type="button"
                      className={`progress-group-toggle ${
                        collapsedProgressGroups.has(item.id)
                          ? 'is-collapsed'
                          : 'is-expanded'
                      }`}
                      aria-expanded={!collapsedProgressGroups.has(item.id)}
                      onClick={() => toggleProgressGroup(item.id)}
                    >
                      <span className="progress-group-toggle-label">
                        {progressGroupLabel}
                      </span>
                      <UpOutlined className="progress-group-toggle-chevron" />
                    </button>
                  ) : null}
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

                        const isLatestProgress = item.id === latestProgressId;
                        const shouldShowLoading = loading && isLatestProgress;

                        const state: 'loading' | 'error' | 'completed' =
                          shouldShowLoading
                            ? 'loading'
                            : item.result?.error
                              ? 'error'
                              : 'completed';
                        const domainIcon =
                          state === 'completed'
                            ? resolveProgressActionIcon(
                                item.actionKind,
                                executionFlowConfig.resolveActionIcon,
                              )
                            : null;
                        return (
                          <>
                            {action && (
                              <span className="progress-action-item">
                                {action}
                                <span
                                  className={`progress-status-icon ${state}`}
                                >
                                  {state === 'loading' ? (
                                    <LoadingOutlined spin />
                                  ) : state === 'error' ? (
                                    '✗'
                                  ) : domainIcon !== null ? (
                                    domainIcon
                                  ) : (
                                    '✓'
                                  )}
                                </span>
                              </span>
                            )}
                            {description && (
                              <div>
                                <ShinyText
                                  text={description}
                                  className="progress-description"
                                  disabled={!shouldShowLoading}
                                />
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
                      {componentConfig.showSystemMessageHeader !== false && (
                        <div className="system-message-header">
                          <Icon
                            component={branding.icon || PlaygroundIcon}
                            style={{ fontSize: 20 }}
                          />
                          <span className="system-message-title">
                            {branding.title || 'Playground'}
                          </span>
                        </div>
                      )}
                      {(item.content || item.result) && (
                        <div className="system-message-content">
                          {item.type === 'result' ? (
                            <PlaygroundResultView
                              result={item.result || null}
                              loading={item.loading || false}
                              serverValid={true}
                              serviceMode={serviceMode}
                              replayScriptsInfo={item.replayScriptsInfo || null}
                              replayCounter={item.replayCounter || 0}
                              loadingProgressText={
                                item.loadingProgressText || ''
                              }
                              verticalMode={item.verticalMode || false}
                              fitMode="width"
                              actionType={item.actionType}
                              onDownloadReport={
                                componentConfig.onDownloadReport
                              }
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
            serviceMode={serviceMode}
            selectedType={selectedType}
            dryMode={dryMode}
            stoppable={canStop}
            loading={loading}
            onRun={handleFormRun}
            onStop={handleStop}
            actionSpace={actionSpace}
            chrome={componentConfig.promptInputChrome}
            deviceType={deviceType}
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
