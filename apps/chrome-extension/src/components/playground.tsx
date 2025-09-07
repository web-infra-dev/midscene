import Icon, {
  ClearOutlined,
  LoadingOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import type { DeviceAction, UIContext } from '@midscene/core';
import { PlaygroundSDK, noReplayAPIs } from '@midscene/playground';
import {
  ContextPreview,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  useEnvConfig,
} from '@midscene/visualizer';
import { Button, Form, List, Tooltip, Typography, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EnvConfigReminder } from '.';
import PlaygroundIcon from '../icons/playground.svg?react';
import { getExtensionVersion } from '../utils/chrome';
import {
  clearStoredMessages,
  getMsgsFromStorage,
  storeMsgsToStorage,
  storeResult,
} from '../utils/playgroundDB';
import './playground.less';
import { ChromeExtensionProxyPage } from '@midscene/web/chrome-extension';

declare const __SDK_VERSION__: string;

// Constants
const DEFAULT_AGENT_ERROR = 'Agent is required for local execution mode';

const { Text } = Typography;

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

export interface InfoListItem {
  id: string;
  type: 'user' | 'system' | 'result' | 'progress' | 'separator';
  content: string;
  timestamp: Date;
  result?: PlaygroundResult | null;
  loading?: boolean;
  replayScriptsInfo?: ReplayScriptsInfo | null;
  replayCounter?: number;
  loadingProgressText?: string;
  verticalMode?: boolean;
}

// Blank result template
const blankResult = {
  result: undefined,
  dump: null,
  reportHTML: null,
  error: null,
};

const WELCOME_MSG: InfoListItem = {
  id: 'welcome',
  type: 'system',
  content: `
      Welcome to Midscene.js Playground!
      
      This is a panel for experimenting and testing Midscene.js features. You can use natural language instructions to operate the web page, such as clicking buttons, filling in forms, querying information, etc.
      
      Please enter your instructions in the input box below to start experiencing.
    `,
  timestamp: new Date(),
  loading: false,
  result: undefined,
  replayScriptsInfo: null,
  replayCounter: 0,
  loadingProgressText: '',
  verticalMode: false,
};

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

// Browser Extension Playground Component
export function BrowserExtensionPlayground({
  getAgent,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  // State management
  const extensionVersion = getExtensionVersion();
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [verticalMode, setVerticalMode] = useState(false);
  const [replayCounter, setReplayCounter] = useState(0);
  const [infoList, setInfoList] = useState<InfoListItem[]>([]);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [actionSpace, setActionSpace] = useState<DeviceAction<any>[]>([]);
  const infoListRef = useRef<HTMLDivElement>(null);

  // Form and environment configuration
  const [form] = Form.useForm();
  const {
    config,
    deepThink,
    screenshotIncluded,
    domIncluded,
    syncFromStorage,
  } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );

  // Initialize SDK for Local Execution type (stable instance to avoid re-creating per render)
  const sdkRef = useRef<PlaygroundSDK | null>(null);
  const currentAgent = useRef<any>(null);

  // Initialize SDK with agent when needed - optimized to cache based on agent
  const initializeSDK = useCallback(
    (agent?: any) => {
      const targetAgent = agent || getAgent();
      if (!targetAgent) {
        throw new Error(DEFAULT_AGENT_ERROR);
      }

      // Only recreate if agent has changed or SDK doesn't exist
      if (!sdkRef.current || currentAgent.current !== targetAgent) {
        sdkRef.current = new PlaygroundSDK({
          type: 'local-execution',
          agent: targetAgent,
        });
        currentAgent.current = targetAgent;
      }
      return sdkRef.current;
    },
    [getAgent],
  );

  // References
  const runResultRef = useRef<HTMLHeadingElement>(null);
  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});

  // Sync config from storage on component mount
  useEffect(() => {
    syncFromStorage();
  }, []); // Empty dependency array - only run once on mount

  // Responsive layout settings
  useEffect(() => {
    const sizeThreshold = 750;
    setVerticalMode(window.innerWidth < sizeThreshold);

    const handleResize = () => {
      setVerticalMode(window.innerWidth < sizeThreshold);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    getMsgsFromStorage(WELCOME_MSG).then((msgs) => {
      setInfoList([WELCOME_MSG, ...msgs]);
    });
  }, []);

  // Initialize context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    getAgent(forceSameTabNavigation)
      ?.getUIContext()
      .then((context: UIContext) => {
        setUiContextPreview(context);
      })
      .catch((e: any) => {
        message.error('Failed to get UI context');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, getAgent, forceSameTabNavigation]);

  // Initialize actionSpace for dynamic parameter validation
  useEffect(() => {
    const loadActionSpace = async () => {
      try {
        const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
        // Use a temporary agent for actionSpace loading - this doesn't need to match execution agent
        const sdk = initializeSDK();
        const space = await sdk.getActionSpace(page);

        setActionSpace(space || []);
      } catch (error) {
        setActionSpace([]);
      }
    };

    loadActionSpace();
  }, [forceSameTabNavigation, config]);

  // store light messages to localStorage (big result data is stored separately)
  useEffect(() => {
    storeMsgsToStorage(infoList);
  }, [infoList]);

  const resetResult = () => {
    setLoading(false);
  };

  // clear info list
  const clearInfoList = () => {
    setInfoList([WELCOME_MSG]);
    clearStoredMessages(); // clear stored messages and results
  };

  // scroll to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
      if (infoListRef.current) {
        infoListRef.current.scrollTop = infoListRef.current.scrollHeight;
      }
    }, 100);
  };

  // check if scrolled to bottom
  const checkIfScrolledToBottom = () => {
    if (infoListRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = infoListRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px tolerance
      setShowScrollToBottomButton(!isAtBottom);
    }
  };

  // manually scroll to bottom when button clicked
  const handleScrollToBottom = () => {
    if (infoListRef.current) {
      infoListRef.current.scrollTo({
        top: infoListRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollToBottomButton(false);
    }
  };

  // when info list updated, scroll to bottom
  useEffect(() => {
    if (infoList.length > 0) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [infoList]);

  // add scroll event listener to check scroll position
  useEffect(() => {
    const container = infoListRef.current;
    if (container) {
      container.addEventListener('scroll', checkIfScrolledToBottom);
      // check initial state
      checkIfScrolledToBottom();

      return () => {
        container.removeEventListener('scroll', checkIfScrolledToBottom);
      };
    }
  }, []);

  // check scroll position when info list changes
  useEffect(() => {
    checkIfScrolledToBottom();
  }, [infoList]);

  // Handle form submission
  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();

    // Dynamic validation using actionSpace
    const action = actionSpace?.find(
      (a: DeviceAction<any>) =>
        a.interfaceAlias === value.type || a.name === value.type,
    );

    // Check if this action needs structured params (has paramSchema)
    const needsStructuredParams = !!action?.paramSchema;

    if (needsStructuredParams) {
      // Get the agent that will be used for execution
      const agent = getAgent(forceSameTabNavigation);
      const sdk = initializeSDK(agent);
      const validation = sdk.validateStructuredParams(value, action);
      if (!validation.valid) {
        message.error(validation.errorMessage || 'Validation failed');
        return;
      }
    } else if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    const startTime = Date.now();

    const activeAgent = getAgent(forceSameTabNavigation);

    // Create display content for user input - dynamically from actionSpace
    const sdk = initializeSDK(activeAgent);
    const displayContent = sdk.createDisplayContent(
      value,
      needsStructuredParams,
      action,
    );

    // add user input to info list
    const userItem: InfoListItem = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: displayContent,
      timestamp: new Date(),
    };
    setInfoList((prev) => [...prev, userItem]);
    setLoading(true);

    const result: PlaygroundResult = { ...blankResult };
    const thisRunningId = Date.now();
    const actionType = value.type;

    // add system processing info to list
    const systemItem: InfoListItem = {
      id: `system-${thisRunningId}`,
      type: 'system',
      content: '', // `start to execute ${actionType}`,
      timestamp: new Date(),
      loading: true,
      loadingProgressText: '',
    };
    setInfoList((prev) => [...prev, systemItem]);

    try {
      if (!activeAgent) {
        throw new Error('No agent found');
      }
      currentAgentRef.current = activeAgent;

      currentRunningIdRef.current = thisRunningId;
      interruptedFlagRef.current[thisRunningId] = false;
      activeAgent.resetDump();
      activeAgent.onTaskStartTip = (tip: string) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        // add new progress message to info list
        const progressItem: InfoListItem = {
          id: `progress-${thisRunningId}-${Date.now()}`,
          type: 'progress',
          content: tip,
          timestamp: new Date(),
        };
        setInfoList((prev) => [...prev, progressItem]);
      };

      // Execute the action using the SDK with the same agent
      const sdk = initializeSDK(activeAgent);
      result.result = await sdk.executeAction(actionType, value, {
        deepThink,
        screenshotIncluded,
        domIncluded,
      });
    } catch (e: any) {
      const sdk = initializeSDK(activeAgent);
      result.error = sdk.formatErrorMessage(e);
      console.error(e);
    }

    if (interruptedFlagRef.current[thisRunningId]) {
      console.log('interrupted, result is', result);
      return;
    }

    try {
      // Extension mode specific processing
      result.dump = activeAgent?.dumpDataString()
        ? JSON.parse(activeAgent.dumpDataString())
        : null;

      result.reportHTML = activeAgent?.reportHTMLString() || null;
    } catch (e) {
      console.error(e);
    }

    currentAgentRef.current = null;
    setLoading(false);

    let replayInfo: ReplayScriptsInfo | null = null;
    let counter = replayCounter;

    // Only generate replay info for interaction APIs, not for data extraction or validation APIs

    if (result?.dump && !noReplayAPIs.includes(actionType)) {
      const info = allScriptsFromDump(result.dump);
      setReplayCounter((c) => c + 1);
      replayInfo = info;
      counter = replayCounter + 1;
    }

    // update system message to completed, then add result to list
    setInfoList((prev) =>
      prev.map((item) =>
        item.id === `system-${thisRunningId}`
          ? {
              ...item,
              content: '', // 'execution completed',
              loading: false,
              loadingProgressText: '',
            }
          : item,
      ),
    );

    // add result to list
    const resultItem: InfoListItem = {
      id: `result-${thisRunningId}`,
      type: 'result',
      content: 'Execution result',
      timestamp: new Date(),
      result: result,
      loading: false,
      replayScriptsInfo: replayInfo,
      replayCounter: counter,
      loadingProgressText: '',
      verticalMode: verticalMode,
    };

    setInfoList((prev) => [...prev, resultItem]);

    storeResult(resultItem.id, resultItem);

    // Add separator item to mark the end of this session
    const separatorItem: InfoListItem = {
      id: `separator-${thisRunningId}`,
      type: 'separator',
      content: 'New Session',
      timestamp: new Date(),
    };
    setInfoList((prev) => [...prev, separatorItem]);

    // Reset hasNewMessage for future runs

    console.log('Chrome Extension playground execution completed:', {
      timeTaken: `${Date.now() - startTime}ms`,
      actionType,
      hasResult: !!result.result,
      hasDump: !!result.dump,
      hasError: !!result.error,
    });
  }, [
    form,
    getAgent,
    forceSameTabNavigation,
    replayCounter,
    verticalMode,
    actionSpace,
    deepThink,
  ]);

  // Handle stop running - extension specific functionality
  const handleStop = async () => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId) {
      await currentAgentRef.current?.destroy();
      interruptedFlagRef.current[thisRunningId] = true;
      resetResult();

      // update info list, mark the system message that is being executed as stopped
      setInfoList((prev) =>
        prev.map((item) =>
          item.id === `system-${thisRunningId}` && item.loading
            ? {
                ...item,
                content: 'Operation stopped',
                loading: false,
                loadingProgressText: '',
              }
            : item,
        ),
      );

      // Add separator item to mark the end of this stopped session
      const separatorItem: InfoListItem = {
        id: `separator-${thisRunningId}`,
        type: 'separator',
        content: 'New Session',
        timestamp: new Date(),
      };
      setInfoList((prev) => [...prev, separatorItem]);

      // Reset hasNewMessage for future runs

      console.log('destroy agent done');
    }
  };

  // Validate if it can run
  const runButtonEnabled = !!getAgent && Object.keys(config || {}).length >= 1;

  // Check if it can be stopped - extension specific
  const stoppable = !dryMode && loading;

  // Get the currently selected type
  const selectedType = Form.useWatch('type', form);

  return (
    <div className="playground-container vertical-mode">
      <Form form={form} onFinish={handleRun} className="command-form">
        {/* top context preview */}
        <div className="context-preview-section">
          <ContextPreview
            uiContextPreview={uiContextPreview}
            setUiContextPreview={setUiContextPreview}
            showContextPreview={showContextPreview}
          />
        </div>

        {/* middle dialog list area */}
        <div className="middle-dialog-area">
          {infoList.length > 0 && (
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
          <div ref={infoListRef} className="info-list-container">
            <List
              itemLayout="vertical"
              dataSource={infoList}
              renderItem={(item) => (
                <List.Item key={item.id} className="list-item">
                  {/* user message */}
                  {item.type === 'user' ? (
                    <div className="user-message-container">
                      <div className="user-message-bubble">{item.content}</div>
                    </div>
                  ) : item.type === 'progress' ? (
                    // progress message - parse action and description text
                    <div>
                      {(() => {
                        const parts = item.content.split(' - ');
                        const action = parts[0]?.trim();
                        const description = parts.slice(1).join(' - ').trim();

                        // check if it is the latest progress message and the current message is being executed
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
                    // separator message
                    <div className="new-conversation-separator">
                      <div className="separator-line" />
                      <div className="separator-text-container">
                        <Text type="secondary" className="separator-text">
                          {item.content}
                        </Text>
                      </div>
                    </div>
                  ) : (
                    // Playground system message
                    <div className="system-message-container">
                      {/* avatar and name */}
                      <div className="system-message-header">
                        <Icon
                          component={PlaygroundIcon}
                          style={{ fontSize: 20 }}
                        />
                        <span className="system-message-title">Playground</span>
                      </div>
                      {/* info content */}
                      {(item.content || item.result) && (
                        <div className="system-message-content">
                          {/* result message use original component, otherwise render text directly */}
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
                              serviceMode={'In-Browser-Extension'}
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
          {/* scroll to bottom button */}
          {showScrollToBottomButton && (
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

        {/* bottom input box */}
        <div className="bottom-input-section">
          {/* environment setup reminder */}
          <EnvConfigReminder />
          <PromptInput
            runButtonEnabled={runButtonEnabled}
            form={form}
            serviceMode={'In-Browser-Extension'}
            selectedType={selectedType}
            dryMode={dryMode}
            stoppable={stoppable}
            loading={loading}
            onRun={handleRun}
            onStop={handleStop}
            actionSpace={actionSpace}
          />
        </div>

        {/* version info section */}
        <div className="version-info-section">
          <span className="version-text">
            Midscene.js version: {extensionVersion}(SDK v{__SDK_VERSION__})
          </span>
        </div>

        <div ref={runResultRef} className="hidden-result-ref" />
      </Form>
    </div>
  );
}

export default BrowserExtensionPlayground;
