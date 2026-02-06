import {
  ApiOutlined,
  ArrowDownOutlined,
  ClearOutlined,
  DownOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { Button, Input, List, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import type { BridgeStatus } from '../../utils/bridgeConnector';
import { workerMessageTypes } from '../../utils/workerMessageTypes';
import { iconForStatus } from '../misc';

import './index.less';

interface BridgeMessageItem {
  id: string;
  type: 'system' | 'status';
  content: string;
  timestamp: Date;
  time: string;
}

// Message record from worker
interface BridgeMessageRecord {
  id: string;
  content: string;
  timestamp: number;
  msgType: 'log' | 'status';
}

const BRIDGE_SERVER_URL_KEY = 'midscene-bridge-server-url';
const DEFAULT_SERVER_URL = 'ws://localhost:3766';

export default function Bridge() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('closed');
  const [messageList, setMessageList] = useState<BridgeMessageItem[]>([]);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [alwaysAllow, setAlwaysAllow] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string>(() => {
    // Only restore from localStorage if user has customized it
    return localStorage.getItem(BRIDGE_SERVER_URL_KEY) || '';
  });
  const [isServerConfigExpanded, setIsServerConfigExpanded] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  // useRef to track the ID of the connection status message
  const connectionStatusMessageId = useRef<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  const appendBridgeMessage = (content: string) => {
    // if there is a connection status message, append all messages to the existing message
    if (connectionStatusMessageId.current) {
      setMessageList((prev) =>
        prev.map((msg) =>
          msg.id === connectionStatusMessageId.current
            ? {
                ...msg,
                content: `${msg.content}\n${dayjs().format('HH:mm:ss.SSS')} - ${content}`,
                timestamp: new Date(),
                time: dayjs().format('HH:mm:ss.SSS'),
              }
            : msg,
        ),
      );
    } else {
      // create a new message (only when there is no active connection)
      const newMessage: BridgeMessageItem = {
        id: `message-${Date.now()}`,
        type: 'status', // connection session messages are unified as status type
        content: `${dayjs().format('HH:mm:ss.SSS')} - ${content}`,
        timestamp: new Date(),
        time: dayjs().format('HH:mm:ss.SSS'),
      };

      // set the connection status message ID, all subsequent messages will be appended to this message
      connectionStatusMessageId.current = newMessage.id;
      setMessageList((prev) => [...prev, newMessage]);
    }
  };

  // Convert history records to UI message format
  const restoreMessagesFromHistory = (records: BridgeMessageRecord[]) => {
    if (records.length === 0) return;

    // Group messages into sessions (messages within 5 seconds are considered same session)
    const SESSION_GAP = 5000;
    const sessions: BridgeMessageRecord[][] = [];
    let currentSession: BridgeMessageRecord[] = [];

    for (const record of records) {
      if (
        currentSession.length === 0 ||
        record.timestamp - currentSession[currentSession.length - 1].timestamp <
          SESSION_GAP
      ) {
        currentSession.push(record);
      } else {
        sessions.push(currentSession);
        currentSession = [record];
      }
    }
    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }

    // Convert sessions to UI messages
    const uiMessages: BridgeMessageItem[] = sessions.map((session) => {
      const firstRecord = session[0];
      const content = session
        .map(
          (r) => `${dayjs(r.timestamp).format('HH:mm:ss.SSS')} - ${r.content}`,
        )
        .join('\n');

      return {
        id: firstRecord.id,
        type: 'status' as const,
        content,
        timestamp: new Date(firstRecord.timestamp),
        time: dayjs(firstRecord.timestamp).format('HH:mm:ss.SSS'),
      };
    });

    setMessageList(uiMessages);
    // Set the last session's id as connectionStatusMessageId for appending new messages
    if (sessions.length > 0) {
      connectionStatusMessageId.current = uiMessages[uiMessages.length - 1].id;
    }
  };

  // Connect to Service Worker via port for receiving status updates
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'bridge-ui' });
    portRef.current = port;

    port.onMessage.addListener((message) => {
      if (message.type === workerMessageTypes.BRIDGE_STATUS_CHANGED) {
        console.log('Bridge status changed:', message.status);
        setBridgeStatus(message.status);
        if (message.status !== 'connected') {
          appendBridgeMessage(`Bridge status changed to ${message.status}`);
        }
      } else if (message.type === workerMessageTypes.BRIDGE_MESSAGE) {
        appendBridgeMessage(message.message);
        if (message.msgType === 'status') {
          console.log(
            'status tip changed event',
            message.msgType,
            message.message,
          );
        }
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('Disconnected from Service Worker');
      portRef.current = null;
    });

    // Load permission config and message history from Service Worker
    chrome.runtime.sendMessage(
      { type: workerMessageTypes.BRIDGE_GET_PERMISSION },
      (response) => {
        if (response) {
          setAlwaysAllow(response.alwaysAllow || false);
          setBridgeStatus(response.status || 'closed');
        }
      },
    );

    // Restore message history
    chrome.runtime.sendMessage(
      { type: workerMessageTypes.BRIDGE_GET_MESSAGES },
      (response) => {
        if (response?.messages && response.messages.length > 0) {
          restoreMessagesFromHistory(response.messages);
        }
      },
    );

    return () => {
      port.disconnect();
    };
  }, []);

  const handleResetPermission = () => {
    chrome.runtime.sendMessage(
      { type: workerMessageTypes.BRIDGE_RESET_PERMISSION },
      (response) => {
        if (response?.success) {
          setAlwaysAllow(false);
        }
      },
    );
  };

  const handleServerUrlChange = (value: string) => {
    setServerUrl(value);

    // Only store to localStorage if user has customized the value
    // If empty or default, remove from localStorage to use default
    if (value && value !== DEFAULT_SERVER_URL) {
      localStorage.setItem(BRIDGE_SERVER_URL_KEY, value);
    } else {
      localStorage.removeItem(BRIDGE_SERVER_URL_KEY);
    }
  };

  // clear the message list
  const clearMessageList = () => {
    setMessageList([]);
    connectionStatusMessageId.current = null;
    // Also clear history in worker
    chrome.runtime.sendMessage({
      type: workerMessageTypes.BRIDGE_CLEAR_MESSAGES,
    });
  };

  // check if scrolled to bottom
  const checkIfScrolledToBottom = () => {
    if (messageListRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messageListRef.current;

      // if content height is less than or equal to container height, no need to scroll, hide button
      if (scrollHeight <= clientHeight) {
        setShowScrollToBottomButton(false);
        return;
      }

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px tolerance
      setShowScrollToBottomButton(!isAtBottom);
    }
  };

  // scroll to bottom when message list updated
  useEffect(() => {
    if (messageList.length > 0) {
      if (messageListRef.current) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }
      // check status after scroll
      checkIfScrolledToBottom();
    }
  }, [messageList]);

  // listen to scroll event
  useEffect(() => {
    const container = messageListRef.current;
    if (container) {
      container.addEventListener('scroll', checkIfScrolledToBottom);
      // initial check
      checkIfScrolledToBottom();
      return () => {
        container.removeEventListener('scroll', checkIfScrolledToBottom);
      };
    }
  }, []);

  // manually scroll to bottom
  const handleScrollToBottom = () => {
    if (messageListRef.current) {
      messageListRef.current.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollToBottomButton(false);
    }
  };

  let statusIcon;
  let statusTip: string;
  if (
    bridgeStatus === 'listening' ||
    bridgeStatus === 'disconnected' ||
    bridgeStatus === 'closed'
  ) {
    statusIcon = (
      <Spin
        className="status-loading-icon"
        indicator={<LoadingOutlined spin />}
        size="small"
      />
    );
    statusTip = 'Listening for connection';
  } else if (bridgeStatus === 'connected') {
    statusIcon = iconForStatus('connected');
    statusTip = 'Connected';
  } else {
    statusIcon = iconForStatus('failed');
    statusTip = `Unknown Status - ${bridgeStatus}`;
  }

  return (
    <div className="bridge-mode-container">
      <div className="playground-form-container">
        <div className="form-part" />
        {messageList.length > 0 && (
          <div className="clear-button-container">
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={clearMessageList}
              type="text"
              className="clear-button"
            />
          </div>
        )}
        {/* middle dialog area */}
        <div className="middle-dialog-area">
          <div ref={messageListRef} className="info-list-container">
            <div className="mode-header">
              <div className="mode-icon">
                <ApiOutlined style={{ fontSize: '12px' }} />
              </div>
              <h2 className="mode-title">Bridge Mode</h2>
            </div>
            <p className="bridge-mode-description">
              In Bridge Mode, you can control this browser by the Midscene SDK
              running in the local terminal. This is useful for interacting both
              through scripts and manually, or to reuse cookies.{' '}
              <a
                href="https://www.midscenejs.com/bridge-mode-by-chrome-extension"
                target="_blank"
                rel="noreferrer"
              >
                More about bridge mode
              </a>
            </p>
            {/* Server Configuration */}
            <div className="server-config-section">
              <div
                className="server-config-header"
                onClick={() =>
                  setIsServerConfigExpanded(!isServerConfigExpanded)
                }
              >
                <DownOutlined
                  className={`server-config-arrow ${isServerConfigExpanded ? 'expanded' : ''}`}
                />
                <span className="server-config-title">
                  Use remote server (optional)
                </span>
              </div>
              {isServerConfigExpanded && (
                <div className="server-config-content">
                  <Input
                    value={serverUrl}
                    onChange={(e) => handleServerUrlChange(e.target.value)}
                    placeholder="ws://localhost:3766"
                    disabled={bridgeStatus !== 'closed'}
                    className="server-config-input"
                  />
                  <small className="server-config-hint">
                    {serverUrl && serverUrl !== DEFAULT_SERVER_URL ? (
                      <>Remote mode: Connect to {serverUrl}</>
                    ) : (
                      <>Local mode (default): ws://localhost:3766</>
                    )}
                  </small>
                </div>
              )}
            </div>
            {messageList.length > 0 && (
              <List
                itemLayout="vertical"
                dataSource={messageList}
                renderItem={(item) => (
                  <List.Item key={item.id} className="list-item">
                    <div className="system-message-container">
                      <div className="mode-header">
                        <div className="mode-icon">
                          <ApiOutlined style={{ fontSize: '12px' }} />
                        </div>
                        <span className="mode-title">Bridge Mode</span>
                      </div>
                      <div className="system-message-content">
                        <div className="message-body">
                          <div className="system-message-text">
                            {item.content}
                          </div>
                        </div>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </div>
          {/* scroll to bottom button */}
          {messageList.length > 0 && showScrollToBottomButton && (
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
      </div>

      {/* bottom status bar */}
      <div className="bottom-button-container">
        {alwaysAllow && (
          <div className="permission-info-container">
            <span className="permission-info-text">Auto-allow is enabled</span>
            <Button
              type="link"
              size="small"
              onClick={handleResetPermission}
              className="reset-permission-btn"
            >
              Reset
            </Button>
          </div>
        )}
        <div className="bottom-status-bar">
          <div className="bottom-status-text">
            <span className="bottom-status-icon">{statusIcon}</span>
            <span className="bottom-status-tip">{statusTip}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
