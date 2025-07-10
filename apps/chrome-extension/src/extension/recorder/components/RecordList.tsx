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
import './recordList.css';

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
        <div className="absolute inset-0 flex items-center justify-center z-50">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <List
          className="session-list"
          grid={{ gutter: 16, column: 1 }}
          dataSource={[...sessions].sort((a, b) => b.updatedAt - a.updatedAt)}
          renderItem={(session) => (
            <List.Item className="session-item">
              <div
                className={`w-full bg-[#F4F6F9] rounded-lg cursor-pointer transition-all duration-200 overflow-hidden hover:shadow-md ${session.id === currentSessionId
                  ? 'border-2 border-[#F4F6F9] bg-blue-50'
                  : ''
                  }`}
                onClick={() => onViewDetail(session)}
              >
                {/* Main content area */}
                <div className="bg-white border border-[#F2F4F7] rounded-[8px] p-3 flex flex-col gap-2">
                  <div className="font-medium text-sm leading-[1.21] text-black w-full">
                    {session.name}
                  </div>
                  {session.description && (
                    <div className="font-normal text-xs leading-[1.67] text-[#595959] max-h-10 overflow-hidden line-clamp-2">
                      {session.description}
                    </div>
                  )}
                  <div className="font-normal text-xs leading-[1.67] text-[#595959]">
                    {session.url &&
                      `URL: ${session.url.slice(0, 50)}${session.url.length > 50 ? '...' : ''}`}
                  </div>
                  <div className="font-normal text-xs leading-[1.67] text-[#595959]">
                    {new Date(session.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* Action bar */}
                <div className="h-10 bg-[#F2F4F7] rounded-b-lg flex items-center justify-between px-3">
                  <div className="flex items-center justify-center flex-1">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      size="small"
                      className="!w-4 !h-4 !p-0 !border-0 !bg-transparent !text-[#595959] hover:!text-blue-500 hover:!bg-transparent focus:!bg-transparent !shadow-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSession(session);
                      }}
                    />
                  </div>
                  <div className="w-px h-5 bg-[rgba(0, 0, 0, 0.04)]" />
                  <div className="flex items-center justify-center flex-1">
                    <Button
                      type="text"
                      icon={<DownloadOutlined />}
                      size="small"
                      className="!w-4 !h-4 !p-0 !border-0 !bg-transparent !text-[#595959] hover:!text-blue-500 hover:!bg-transparent focus:!bg-transparent !shadow-none disabled:!text-gray-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportSession(session);
                      }}
                      disabled={session.events.length === 0}
                    />
                  </div>
                  <div className="w-px h-5 bg-[rgba(0, 0, 0, 0.04)]" />
                  <div className="flex items-center justify-center flex-1">
                    <Popconfirm
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
                        className="!w-4 !h-4 !p-0 !border-0 !bg-transparent !text-[#595959] hover:!text-red-500 hover:!bg-transparent focus:!bg-transparent !shadow-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
};
