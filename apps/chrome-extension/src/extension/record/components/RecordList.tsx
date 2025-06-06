import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import type React from 'react';
import type { RecordingSession } from '../../../store';
import type { ViewMode } from '../types';
import { generateDefaultSessionName } from '../utils';

const { Title } = Typography;

interface RecordListProps {
  sessions: RecordingSession[];
  currentSessionId: string | null;
  onEditSession: (session: RecordingSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (session: RecordingSession) => void;
  onExportSession: (session: RecordingSession) => void;
  onViewDetail: (session: RecordingSession) => void;
  isExtensionMode: boolean;
  createNewSession: (sessionName?: string) => RecordingSession;
  setSelectedSession: (session: RecordingSession) => void;
  setViewMode: (mode: ViewMode) => void;
  currentTab?: chrome.tabs.Tab | null;
  startRecording: () => void;
}

export const RecordList: React.FC<RecordListProps> = ({
  sessions,
  currentSessionId,
  onEditSession,
  onDeleteSession,
  onSelectSession,
  onExportSession,
  onViewDetail,
  isExtensionMode,
  createNewSession,
  setSelectedSession,
  setViewMode,
  currentTab,
  startRecording,
}) => {
  const handleCreateNewSession = () => {
    const sessionName = generateDefaultSessionName();
    const newSession = createNewSession(sessionName);
    message.success(`Session "${sessionName}" created successfully`);

    // Switch to detail view for the new session
    setSelectedSession(newSession);
    setViewMode('detail');

    // Automatically start recording if in extension mode
    if (isExtensionMode && currentTab?.id) {
      setTimeout(() => {
        startRecording();
      }, 100);
    }
  };

  return (
    <div className="record-list-view">
      {!isExtensionMode && (
        <Alert
          message="Limited Functionality"
          description="Recording features require Chrome extension environment. Only session management and event viewing are available."
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Recording Sessions
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateNewSession}
        >
          New Session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="session-empty">
          <Empty
            description="No recording sessions yet"
            style={{ margin: '40px 0' }}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateNewSession}
            >
              Create First Session
            </Button>
          </Empty>
        </div>
      ) : (
        <List
          className="session-list"
          grid={{ gutter: 16, column: 1 }}
          dataSource={[...sessions].sort((a, b) => b.updatedAt - a.updatedAt)}
          renderItem={(session) => (
            <List.Item>
              <Card
                size="small"
                className={
                  session.id === currentSessionId ? 'selected-session' : ''
                }
                style={{
                  cursor: 'pointer',
                  border:
                    session.id === currentSessionId
                      ? '2px solid #1890ff'
                      : '1px solid #d9d9d9',
                }}
                onClick={() => onViewDetail(session)}
                actions={[
                  <Button
                    key="select"
                    type="text"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSession(session);
                    }}
                    style={{
                      color:
                        session.id === currentSessionId ? '#1890ff' : undefined,
                    }}
                  >
                    {session.id === currentSessionId ? 'Selected' : 'Select'}
                  </Button>,
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSession(session);
                    }}
                  />,
                  <Button
                    key="download"
                    type="text"
                    icon={<DownloadOutlined />}
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportSession(session);
                    }}
                    disabled={session.events.length === 0}
                  />,
                  <Popconfirm
                    key="delete"
                    title="Delete session"
                    description="Are you sure you want to delete this session?"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <Card.Meta
                  title={
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{session.name}</span>
                      <Space>
                        <Tag
                          color={
                            session.status === 'recording'
                              ? 'red'
                              : session.status === 'completed'
                                ? 'green'
                                : 'default'
                          }
                        >
                          {session.status}
                        </Tag>
                        {session.id === currentSessionId && (
                          <Tag color="blue">Current</Tag>
                        )}
                      </Space>
                    </div>
                  }
                  description={
                    <div className="session-meta">
                      <div className="session-details">
                        Events: {session.events.length} | Created:{' '}
                        {new Date(session.createdAt).toLocaleString()} |
                        {session.duration &&
                          ` Duration: ${(session.duration / 1000).toFixed(1)}s |`}
                        {session.url &&
                          ` URL: ${session.url.slice(0, 50)}${session.url.length > 50 ? '...' : ''}`}
                      </div>
                      {session.description && (
                        <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
                          {session.description}
                        </div>
                      )}
                    </div>
                  }
                />
              </Card>
            </List.Item>
          )}
        />
      )}
    </div>
  );
};
