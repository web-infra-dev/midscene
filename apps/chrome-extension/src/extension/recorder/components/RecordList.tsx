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
  onExportSession: (session: RecordingSession) => void;
  onViewDetail: (session: RecordingSession) => void;
  isExtensionMode: boolean;
  createNewSession: (sessionName?: string) => RecordingSession;
  setSelectedSession: (session: RecordingSession) => void;
  setViewMode: (mode: ViewMode) => void;
  currentTab?: chrome.tabs.Tab | null;
  startRecording: (sessionId: string) => void;
}

export const RecordList: React.FC<RecordListProps> = ({
  sessions,
  currentSessionId,
  onEditSession,
  onDeleteSession,
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

    // 只切换到 detail 视图，不直接 setSelectedSession，selectedSession 由 currentSessionId 驱动
    setViewMode('detail');

    // 自动开始录制
    if (isExtensionMode && currentTab?.id) {
      setTimeout(() => {
        startRecording(newSession.id);
      }, 100);
    }
  };

  return (
    <div className="record-list-view relative">
      {!isExtensionMode && (
        <Alert
          message="Limited Functionality"
          description="Recording features require Chrome extension environment. Only session management and event viewing are available."
          type="info"
          showIcon
          className="mb-4"
        />
      )}

      {sessions.length === 0 ? (
        <div className="session-empty flex flex-col items-center justify-center h-[200px] text-gray-500">
          <div className="w-16 h-16 border-2 border-gray-300 rounded-lg flex items-center justify-center mb-4">
            <div className="w-8 h-0.5 bg-gray-300 rounded-sm" />
          </div>
          <Empty
            description="No data"
            className="flex flex-col items-center justify-center"
          />
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
                className={`cursor-pointer ${session.id === currentSessionId
                  ? 'selected-session border-2 border-blue-500'
                  : 'border border-gray-300'
                  }`}
                onClick={() => onViewDetail(session)}
                actions={[
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
                    <div className="flex justify-between items-center">
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
                        <div className="mt-1 italic">{session.description}</div>
                      )}
                    </div>
                  }
                />
              </Card>
            </List.Item>
          )}
        />
      )}

      {/* Floating Add Button */}
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<PlusOutlined />}
        onClick={handleCreateNewSession}
        className="!fixed bottom-5 right-5 w-14 h-14 shadow-lg 
     shadow-blue-500/40 z-[1000]"
      />
    </div>
  );
};
