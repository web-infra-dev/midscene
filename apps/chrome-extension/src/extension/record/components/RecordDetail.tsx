import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/record';
import { RecordTimeline } from '@midscene/record';
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Space,
  Typography,
} from 'antd';
import type React from 'react';
import type { RecordingSession } from '../../../store';

import { ExportControls } from '../ExportControls';

const { Title, Text } = Typography;

interface RecordDetailProps {
  session: RecordingSession;
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
  session,
  events,
  isRecording,
  currentTab,
  onBack,
  onStartRecording,
  onStopRecording,
  onClearEvents,
  isExtensionMode,
}) => {
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

      {/* Header with back button and session info */}
      <div
        className="detail-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          className="back-button"
        >
          Back to Sessions
        </Button>
        <div className="session-title" style={{ textAlign: 'center', flex: 1 }}>
          <Title level={4}>{session.name}</Title>
        </div>
        <div style={{ width: '120px' }} /> {/* Spacer to balance the layout */}
      </div>

      {/* Recording Status Indicator */}
      <div className={`recording-status ${isRecording ? 'recording' : 'idle'}`}>
        {isRecording ? (
          <span>🔴 Recording in progress</span>
        ) : (
          <span>✅ Ready to record</span>
        )}
      </div>


      {/* Recording Controls */}
      <div className="controls-section">
        <div className="current-tab-info">
          <Text strong>Current Tab:</Text>{' '}
          {currentTab?.title || 'No tab selected'}
          {!isExtensionMode && <Text type="secondary"> (Mock)</Text>}
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
                Start Recording
              </Button>
            ) : (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={onStopRecording}
                disabled={!isExtensionMode}
              >
                Stop Recording
              </Button>
            )}

            <Button
              icon={<DeleteOutlined />}
              onClick={onClearEvents}
              disabled={events.length === 0 || isRecording}
            >
              Clear Events
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
