import {
  ArrowLeftOutlined,
  BugOutlined,
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
  Tag,
  Typography,
} from 'antd';
import type React from 'react';
import type { RecordingSession } from '../../../store';

import { ExportControls } from '../ExportControls';
import { diagnoseRecordingChain } from '../utils';

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
  // Handle diagnostic check
  const handleDiagnose = async () => {
    const result = await diagnoseRecordingChain(currentTab);

    // Show results in console and alert
    const issuesText =
      result.issues.length > 0
        ? `Issues found:\n${result.issues.join('\n')}`
        : 'No issues found!';

    const infoText =
      result.info.length > 0
        ? `\nChecks passed:\n${result.info.join('\n')}`
        : '';

    alert(
      `Recording Chain Diagnosis:\n\n${issuesText}${infoText}\n\nSee console for detailed logs.`,
    );
  };
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

      {/* Session Details */}
      <Card size="small" className="session-info-card">
        <div className="session-info">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div>
              <Text strong>Status: </Text>
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
            </div>
            <div>
              <Text strong>Events: </Text>
              <Text>{session.events.length}</Text>
            </div>
            <div>
              <Text strong>Created: </Text>
              <Text>{new Date(session.createdAt).toLocaleString()}</Text>
            </div>
            {session.duration && (
              <div>
                <Text strong>Duration: </Text>
                <Text>{(session.duration / 1000).toFixed(1)}s</Text>
              </div>
            )}
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

      {/* Recording Controls */}
      <div className="controls-section">
        <div className="current-tab-info">
          <Text strong>Current Tab:</Text>{' '}
          {currentTab?.title || 'No tab selected'}
          {!isExtensionMode && <Text type="secondary"> (Mock)</Text>}
        </div>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space className="record-controls">
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

            <Button
              icon={<BugOutlined />}
              onClick={handleDiagnose}
              title="Diagnose recording chain issues"
            >
              Diagnose
            </Button>
          </Space>

          {/* AI Playwright Export Controls */}
          <div>
            <Text strong style={{ marginBottom: '8px', display: 'block' }}>
              AI-Powered Test Generation:
            </Text>
            <ExportControls
              sessionName={session.name}
              events={events}
              sessionId={session.id}
              onStopRecording={onStopRecording}
            />
          </div>
        </Space>
      </div>

      <Divider />

      {/* Events Display */}
      <div className="events-section">
        <div className="events-header">
          <Title level={5}>Recorded Events ({events.length})</Title>
        </div>
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
