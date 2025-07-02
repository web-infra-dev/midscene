import {
  CaretRightOutlined,
  ClearOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import Icon from '@ant-design/icons';
import { ExtensionBridgePageBrowserSide } from '@midscene/web/bridge-mode-browser';
import { Button, List, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import BridgeIcon from '../icons/bridge.svg?react';
import PlayIcon from '../icons/play.svg?react';
import {
  clearStoredBridgeMessages,
  getBridgeMsgsFromStorage,
  storeBridgeMsgsToStorage,
} from '../utils';
import { iconForStatus } from './misc';

import './bridge.less';

const { Text } = Typography;

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
  const [taskStatus, setTaskStatus] = useState<string>('');

  const [messageList, setMessageList] = useState<BridgeMessageItem[]>(() => {
    // 从localStorage加载存储的消息
    return getBridgeMsgsFromStorage();
  });
  const messageListRef = useRef<HTMLDivElement>(null);

  // 用于追踪连接状态消息的ID - 改用useRef确保同步更新
  const connectionStatusMessageId = useRef<string | null>(null);

  // 初始化时恢复connectionStatusMessageId
  useEffect(() => {
    if (messageList.length > 0) {
      // 找到最后一条status类型的消息作为当前连接状态消息
      const lastStatusMessage = messageList
        .slice()
        .reverse()
        .find((msg) => msg.type === 'status');

      // 只有当存在未完成的连接会话时才恢复ID
      // 检查最后一条消息是否表明连接已结束
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

  // 保存消息到localStorage
  useEffect(() => {
    storeBridgeMsgsToStorage(messageList);
  }, [messageList]);

  const appendBridgeMessage = (
    content: string,
    type: 'system' | 'status' = 'system',
  ) => {
    // 如果已有连接状态消息，无论是什么类型的消息都追加到现有消息中
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
      // 创建新消息（只有在没有活跃连接时）
      const newMessage: BridgeMessageItem = {
        id: `message-${Date.now()}`,
        type: 'status', // 连接会话消息统一设为status类型
        content: `${dayjs().format('HH:mm:ss.SSS')} - ${content}`,
        timestamp: new Date(),
        time: dayjs().format('HH:mm:ss.SSS'),
      };

      // 设置连接状态消息ID，后续所有消息都会追加到这条消息
      connectionStatusMessageId.current = newMessage.id;
      setMessageList((prev) => [...prev, newMessage]);
    }
  };

  const activeBridgeConnectorRef = useRef<BridgeConnector | null>(
    new BridgeConnector(
      (message, type) => {
        // 所有bridge消息都作为状态消息处理，追加到当前连接会话
        appendBridgeMessage(message, 'status');
        if (type === 'status') {
          console.log('status tip changed event', type, message);
          setTaskStatus(message);
        }
      },
      (status) => {
        console.log('status changed event', status);
        setTaskStatus('');
        setBridgeStatus(status);

        // 所有状态变化也追加到当前连接会话
        if (status !== 'connected') {
          appendBridgeMessage(`Bridge status changed to ${status}`, 'status');
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
    // 只有在开始新连接时才重置状态消息ID，这样会创建新的消息
    if (bridgeStatus === 'closed') {
      connectionStatusMessageId.current = null;
    }
    activeBridgeConnectorRef.current?.keepListening();
  };

  // 清空消息列表
  const clearMessageList = () => {
    setMessageList([]);
    connectionStatusMessageId.current = null;
    clearStoredBridgeMessages();
  };

  // scroll to bottom when message list updated
  useEffect(() => {
    if (messageList.length > 0) {
      setTimeout(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop =
            messageListRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messageList]);

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
      <p className="bridge-mode-description">
        In Bridge Mode, you can control this browser by the Midscene SDK running
        in the local terminal. This is useful for interacting both through
        scripts and manually, or to reuse cookies.{' '}
        <a
          href="https://www.midscenejs.com/bridge-mode-by-chrome-extension"
          target="_blank"
          rel="noreferrer"
        >
          More about bridge mode
        </a>
      </p>

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
            {messageList.length > 0 && (
              <List
                itemLayout="vertical"
                dataSource={messageList}
                renderItem={(item) => (
                  <List.Item key={item.id} className="list-item">
                    <div className="system-message-container">
                      <div className="mode-header">
                        <div className="mode-icon">
                          <Icon component={BridgeIcon} />
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
        </div>
      </div>

      {/* 底部按钮 */}
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
