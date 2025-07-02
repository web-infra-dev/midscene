import Icon, {
  ClearOutlined,
  LoadingOutlined,
  ExclamationCircleFilled,
  ArrowDownOutlined,
} from '@ant-design/icons';
import type { UIContext } from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import {
  ContextPreview,
  EnvConfig,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  useEnvConfig,
} from '@midscene/visualizer';
import { allScriptsFromDump } from '@midscene/visualizer';
import { Button, Form, List, Typography, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import PlaygroundIcon from '../icons/playground.svg?react';
import {
  clearStoredMessages,
  getExtensionVersion,
  getMsgsFromStorage,
  storeMsgsToStorage,
  storeResult,
} from '../utils';
import './playground.less';

const { Text } = Typography;

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

interface InfoListItem {
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

const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED = 'NOT_IMPLEMENTED_AS_DESIGNED';

const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  if (!errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
    return errorMessage;
  }
  return 'Unknown error';
};

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
  const [infoList, setInfoList] = useState<InfoListItem[]>([
    WELCOME_MSG,
    ...getMsgsFromStorage(WELCOME_MSG),
  ]);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const infoListRef = useRef<HTMLDivElement>(null);

  // Form and environment configuration
  const [form] = Form.useForm();
  const { config, deepThink } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );

  // References
  const runResultRef = useRef<HTMLHeadingElement>(null);
  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});

  // Environment configuration check
  const configAlreadySet = Object.keys(config || {}).length >= 1;

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

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

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
      infoListRef.current.scrollTop = infoListRef.current.scrollHeight;
      setShowScrollToBottomButton(false);
    }
  };

  // when info list updated, scroll to bottom
  useEffect(() => {
    if (infoList.length > 0) {
      scrollToBottom();
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
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    const startTime = Date.now();

    // add user input to info list
    const userItem: InfoListItem = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: value.prompt,
      timestamp: new Date(),
    };
    setInfoList((prev) => [...prev, userItem]);
    setLoading(true);

    const result: PlaygroundResult = { ...blankResult };
    const activeAgent = getAgent(forceSameTabNavigation);
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

      // Extension mode always uses in-browser actions
      if (actionType === 'aiAction') {
        result.result = await activeAgent?.aiAction(value.prompt);
      } else if (actionType === 'aiQuery') {
        result.result = await activeAgent?.aiQuery(value.prompt);
      } else if (actionType === 'aiAssert') {
        const { pass, thought } =
          (await activeAgent?.aiAssert(value.prompt, undefined, {
            keepRawResponse: true,
          })) || {};
        result.result = {
          pass,
          thought,
        };
      } else if (actionType === 'aiTap') {
        result.result = await activeAgent?.aiTap(value.prompt, {
          deepThink,
        });
      }
    } catch (e: any) {
      result.error = formatErrorMessage(e);
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

    try {
      console.log('destroy agent.page', activeAgent?.page);
      await activeAgent?.page?.destroy();
      console.log('destroy agent.page done', activeAgent?.page);
    } catch (e) {
      console.error(e);
    }

    currentAgentRef.current = null;
    setLoading(false);

    let replayInfo: ReplayScriptsInfo | null = null;
    let counter = replayCounter;

    if (result?.dump && !['aiQuery', 'aiAssert'].includes(actionType)) {
      const info = allScriptsFromDump(result.dump);
      setReplayCounter((c) => c + 1);
      replayInfo = info;
      counter = replayCounter + 1;
    } else {
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

    // if has real result data, store to separate key
    if (result && Object.keys(result).length > 0 && !(result as any)?.fake) {
      // For non-action operations, only store the result.result field to save space
      const dataToStore =
        actionType === 'aiAction'
          ? result
          : {
              result: result.result,
              error: result.error,
              dump: null,
              reportHTML: null,
            };
      storeResult(resultItem.id, dataToStore);
    }

    setInfoList((prev) => [...prev, resultItem]);

    // Add separator item to mark the end of this session
    const separatorItem: InfoListItem = {
      id: `separator-${thisRunningId}`,
      type: 'separator',
      content: 'New Session',
      timestamp: new Date(),
    };
    setInfoList((prev) => [...prev, separatorItem]);

    // Reset hasNewMessage for future runs

    console.log(`time taken: ${Date.now() - startTime}ms`);
  }, [form, getAgent, forceSameTabNavigation, replayCounter, verticalMode]);

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
  const runButtonEnabled = !!getAgent && configAlreadySet;

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
                              <div className="error-message">
                                <div className="divider" />
                                Error: {item.result.error}
                              </div>
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
                        <Icon component={PlaygroundIcon} />
                        <span className="system-message-title">Playground</span>
                      </div>
                      {/* info content */}
                      <div className="system-message-content">
                        {/* result message use original component, otherwise render text directly */}
                        {item.type === 'result' ? (
                          <PlaygroundResultView
                            result={item.result || null}
                            loading={item.loading || false}
                            serviceMode={'In-Browser-Extension'}
                            replayScriptsInfo={item.replayScriptsInfo || null}
                            replayCounter={item.replayCounter || 0}
                            loadingProgressText={item.loadingProgressText || ''}
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
          {!configAlreadySet && (
            <div className="config-reminder">
              <ExclamationCircleFilled className="reminder-icon" />
              <span className="reminder-text">
                Please set up your environment variables before using.
              </span>
              <EnvConfig mode="text" showTooltipWhenEmpty={false} />
            </div>
          )}
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
          />
        </div>

        {/* version info section */}
        <div className="version-info-section">
          <span className="version-text">
            Midscene.js version: {extensionVersion}
          </span>
        </div>

        <div ref={runResultRef} className="hidden-result-ref" />
      </Form>
    </div>
  );
}
