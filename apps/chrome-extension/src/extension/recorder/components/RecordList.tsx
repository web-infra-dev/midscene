import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
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

const { Title } = Typography;

interface RecordListProps {
  sessions: RecordingSession[];
  currentSessionId: string | null;
  onEditSession: (session: RecordingSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (session: RecordingSession) => void;
  onViewDetail: (session: RecordingSession) => void;
  isExtensionMode: boolean;
}

export const RecordList: React.FC<RecordListProps> = ({
  sessions,
  currentSessionId,
  onEditSession,
  onDeleteSession,
  onExportSession,
  onViewDetail,
  isExtensionMode,
}) => {
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
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
                      {/* <Space>
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
                      </Space> */}
                    </div>
                  }
                  description={
                    <div className="session-meta">
                      {session.description && (
                        <div className="mt-1 mb-1">{session.description}</div>
                      )}
                      <div className="mt-1 mb-1">
                        {session.url &&
                          ` URL: ${session.url.slice(0, 50)}${session.url.length > 50 ? '...' : ''}`}
                      </div>
                      <div className="session-details flex justify-between items-center mt-1 mb-1">
                        <span>
                          {new Date(session.createdAt).toLocaleString()}
                        </span>
                      </div>
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
