import {
  ApiOutlined,
  ArrowDownOutlined,
  ClearOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { ExtensionBridgePageBrowserSide } from '@midscene/web/bridge-mode-browser';
import { Button, List, Spin } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import PlayIcon from '../icons/play.svg?react';
import {
  clearStoredBridgeMessages,
  getBridgeMsgsFromStorage,
  storeBridgeMsgsToStorage,
} from '../utils';
import { iconForStatus } from './misc';

import './bridge.less';

interface BridgeMessageItem {
  id: string;
  type: 'system' | 'status';
  content: string;
  timestamp: Date;
  time: string;
}

const connectRetryInterval = 300;

type BridgeStatus =
  | 'listening'
  | 'connected'
  | 'disconnected' /* disconnected unintentionally */
  | 'closed';

class BridgeConnector {
  status: BridgeStatus = 'closed';

  activeBridgePage: ExtensionBridgePageBrowserSide | null = null;

  constructor(
    private onMessage: (message: string, type: 'log' | 'status') => void,
    private onBridgeStatusChange: (status: BridgeStatus) => void,
  ) {
    this.status = 'closed';
  }

  setStatus(status: BridgeStatus) {
    this.status = status;
    this.onBridgeStatusChange(status);
  }

  keepListening() {
    if (this.status === 'listening' || this.status === 'connected') {
      return;
    }

    this.setStatus('listening');

    (async () => {
      while (true) {
        if (this.status === 'connected') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (this.status === 'closed') {
          break;
        }

        if (this.status !== 'listening' && this.status !== 'disconnected') {
          throw new Error(`unexpected status: ${this.status}`);
        }

        let activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
        try {
          activeBridgePage = new ExtensionBridgePageBrowserSide(() => {
            if (this.status !== 'closed') {
              this.setStatus('disconnected');
              this.activeBridgePage = null;
            }
          }, this.onMessage);
          await activeBridgePage.connect();
          this.activeBridgePage = activeBridgePage;

          this.setStatus('connected');
        } catch (e) {
          this.activeBridgePage?.destroy();
          this.activeBridgePage = null;
          console.warn('failed to setup connection', e);
          await new Promise((resolve) =>
            setTimeout(resolve, connectRetryInterval),
          );
        }
      }
    })();
  }

  async stopConnection() {
    if (this.status === 'closed') {
      console.warn('Cannot stop connection if not connected');
      return;
    }

    if (this.activeBridgePage) {
      await this.activeBridgePage.destroy();
      this.activeBridgePage = null;
    }

    this.setStatus('closed');
  }
}

export default function Bridge() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('closed');
  const [messageList, setMessageList] = useState<BridgeMessageItem[]>(() => {
    // load messages from localStorage
    return getBridgeMsgsFromStorage();
  });
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  // useRef to track the ID of the connection status message
  const connectionStatusMessageId = useRef<string | null>(null);

  // restore connectionStatusMessageId when initializing
  useEffect(() => {
    if (messageList.length > 0) {
      // find the last status message as the current connection status message
      const lastStatusMessage = messageList
        .slice()
        .reverse()
        .find((msg) => msg.type === 'status');

      // only restore ID when there is an unfinished connection session
      // check if the last message indicates the connection has ended
      if (lastStatusMessage) {
        const lastContent = lastStatusMessage.content.toLowerCase();
        const isConnectionEnded =
          lastContent.includes('closed') ||
          lastContent.includes('stopped') ||
          lastContent.includes('disconnect');

        if (!isConnectionEnded) {
          connectionStatusMessageId.current = lastStatusMessage.id;
        }
      }
    }
  }, []);

  // save messages to localStorage
  useEffect(() => {
    storeBridgeMsgsToStorage(messageList);
  }, [messageList]);

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

  const activeBridgeConnectorRef = useRef<BridgeConnector | null>(
    new BridgeConnector(
      (message, type) => {
        // all bridge messages are treated as status messages, appended to the current connection session
        appendBridgeMessage(message);
        if (type === 'status') {
          console.log('status tip changed event', type, message);
        }
      },
      (status) => {
        console.log('status changed event', status);
        setBridgeStatus(status);

        // all
        if (status !== 'connected') {
          appendBridgeMessage(`Bridge status changed to ${status}`);
        }
      },
    ),
  );

  useEffect(() => {
    return () => {
      activeBridgeConnectorRef.current?.stopConnection();
    };
  }, []);

  const stopConnection = () => {
    activeBridgeConnectorRef.current?.stopConnection();
  };

  const startConnection = async () => {
    // only reset the connection status message ID when starting a new connection
    if (bridgeStatus === 'closed') {
      connectionStatusMessageId.current = null;
    }
    activeBridgeConnectorRef.current?.keepListening();
  };

  // clear the message list
  const clearMessageList = () => {
    setMessageList([]);
    connectionStatusMessageId.current = null;
    clearStoredBridgeMessages();
  };

  // scroll to bottom when component first mounts (if there are messages from localStorage)
  useEffect(() => {
    if (messageList.length > 0 && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, []); // only run once on mount

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
  let statusBtn;
  if (bridgeStatus === 'closed') {
    statusIcon = iconForStatus('closed');
    statusTip = 'Closed';
    statusBtn = (
      <Button
        type="primary"
        onClick={() => {
          startConnection();
        }}
      >
        Allow connection
      </Button>
    );
  } else if (bridgeStatus === 'listening' || bridgeStatus === 'disconnected') {
    statusIcon = (
      <Spin
        className="status-loading-icon"
        indicator={<LoadingOutlined spin />}
        size="small"
      />
    );
    statusTip =
      bridgeStatus === 'listening'
        ? 'Listening for connection...'
        : 'Disconnected, listening for a new connection...';
    statusBtn = (
      <Button className="stop-button" onClick={stopConnection}>
        Stop
      </Button>
    );
  } else if (bridgeStatus === 'connected') {
    statusIcon = iconForStatus('connected');
    statusTip = 'Connected';

    statusBtn = (
      <Button
        className="stop-button"
        onClick={() => {
          stopConnection();
        }}
      >
        Stop
      </Button>
    );
  } else {
    statusIcon = iconForStatus('failed');
    statusTip = `Unknown Status - ${bridgeStatus}`;
    statusBtn = null;
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

      {/* bottom buttons */}
      <div className="bottom-button-container">
        {bridgeStatus === 'closed' ? (
          <Button
            type="primary"
            className="bottom-action-button"
            icon={<PlayIcon />}
            onClick={() => {
              startConnection();
            }}
          >
            Allow Connection
          </Button>
        ) : (
          <div className="bottom-status-bar">
            <div className="bottom-status-text">
              <span className="bottom-status-icon">{statusIcon}</span>
              <span className="bottom-status-tip">{statusTip}</span>
            </div>
            <div className="bottom-status-divider" />
            <div className="bottom-status-btn">{statusBtn}</div>
          </div>
        )}
      </div>
    </div>
  );
}
