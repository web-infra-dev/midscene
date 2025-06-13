import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { RecordTimeline } from '@midscene/recorder';
import { Alert, Button, Card, Divider, Empty, Space, Tooltip, Typography } from 'antd';
import type React from 'react';
import {
  type RecordingSession,
  useRecordingSessionStore,
} from '../../../store';

import { ExportControls } from '../ExportControls';

const { Title, Text } = Typography;

interface RecordDetailProps {
  sessionId: string;
  events: ChromeRecordedEvent[];
  isRecording: boolean;
  currentTab: chrome.tabs.Tab | null;
  onBack: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearEvents: () => void;
  isExtensionMode: boolean;
}

export const RecordDetail: React.FC<RecordDetailProps> = ({
  sessionId,
  events,
  isRecording,
  currentTab,
  onBack,
  onStartRecording,
  onStopRecording,
  onClearEvents,
  isExtensionMode,
}) => {
  // Get the session directly from the store to ensure we always have the latest data
  const { sessions } = useRecordingSessionStore();
  const session = sessions.find((s) => s.id === sessionId);

  // If session is not found, show error
  if (!session) {
    return (
      <div className="record-detail-view">
        <Alert
          message="Session Not Found"
          description="The requested session could not be found."
          type="error"
          showIcon
          style={{ marginBottom: '16px' }}
        />
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          className="back-button"
        >
          Back to Sessions
        </Button>
      </div>
    );
  }
  return (
    <div className="record-detail-view">
      {!isExtensionMode && (
        <Alert
          message="Recording Disabled"
          description="Recording functionality is not available outside Chrome extension environment."
          type="warning"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* Header with back button */}
      <div className="detail-header">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          className="back-button"
        >
          Back to Sessions
        </Button>
      </div>

      {/* Session title */}
      <div className="session-title-section">
        <Tooltip title={session.name} placement="topLeft">
          <Title level={4} className="session-title-text">
            {session.name}
          </Title>
        </Tooltip>
      </div>

      {/* Recording Controls */}
      <div className="controls-section">
        <div className="current-tab-info">
          <Text strong>Current Tab:</Text>{' '}
          {currentTab?.title || 'No tab selected'}
          {!isExtensionMode && <Text type="secondary"> (Mock)</Text>}
        </div>

        {/* Recording Status Indicator */}
        <div
          className={`recording-status ${isRecording ? 'recording' : 'idle'}`}
        >
          {isRecording ? (
            <span>🔴 Recording in progress</span>
          ) : (
            <span>✅ Ready to record</span>
          )}
        </div>

        {/* Session Details */}
        <Card size="small" className="session-info-card">
          <div className="session-info">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <Text strong>Created: </Text>
                <Text>{new Date(session.createdAt).toLocaleString()}</Text>
              </div>
              {session.url && (
                <div>
                  <Text strong>URL: </Text>
                  <Text>{session.url}</Text>
                </div>
              )}
              {session.description && (
                <div>
                  <Text strong>Description: </Text>
                  <Text>{session.description}</Text>
                </div>
              )}
            </Space>
          </div>
        </Card>

        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space className="record-controls" wrap>
            {!isRecording ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={onStartRecording}
                disabled={!currentTab || !isExtensionMode}
              >
                Start
              </Button>
            ) : (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={onStopRecording}
                disabled={!isExtensionMode}
              >
                Stop
              </Button>
            )}

            <Button
              icon={<DeleteOutlined />}
              onClick={onClearEvents}
              disabled={events.length === 0 || isRecording}
            >
              Clear
            </Button>

            {/* AI Playwright Export Controls */}
            <ExportControls
              sessionName={session.name}
              events={events}
              sessionId={session.id}
              onStopRecording={onStopRecording}
            />
          </Space>
        </Space>
      </div>

      <Divider />

      {/* Events Display */}
      <div className="events-section">
        <div
          className={`events-container ${events.length === 0 ? 'empty' : ''}`}
        >
          {events.length === 0 ? (
            <Empty description="No events recorded yet" />
          ) : (
            <RecordTimeline events={events} />
          )}
        </div>
      </div>
    </div>
  );
};
