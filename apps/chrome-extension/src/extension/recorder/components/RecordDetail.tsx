import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  StopOutlined,
  CloseOutlined,
  RestOutlined,
  ClearOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { RecordTimeline } from '@midscene/recorder';
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Space,
  Tooltip,
  Typography,
  Spin,
} from 'antd';
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
  onStartRecording: (id?: string) => void;
  onStopRecording: () => void;
  onClearEvents: () => void;
  isExtensionMode: boolean;
  onClose: () => void;
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
  onClose,
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
    <div className="record-detail-view flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="flex items-center px-4 py-2">
        {/* 录制状态 */}
        <div className="flex items-center mr-2">
          {isRecording ? (
            <div
              className="flex items-center gap-[4px] h-[20px] px-[7px] py-[4px] rounded-[23px]"
              style={{
                background: 'rgba(255, 17, 17, 0.08)',
                // 透明红色背景
              }}
            >
              <span
                className="inline-block"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#FF1111',
                }}
              />
              <span
                className="text-[10px] font-medium"
                style={{
                  color: '#FF1111',
                  fontFamily: 'Inter, -apple-system, sans-serif',
                  lineHeight: '2em',
                  fontWeight: 700,
                }}
              >
                REC
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-[4px] h-[20px] px-[7px] py-[4px] rounded-[23px] bg-[#EFFFE0]">
              <span className="w-[6px] h-[6px] rounded-full bg-[#00C700] inline-block" />
              <span className="text-[#12A902] text-[10px] font-medium leading-[2em]" style={{ fontFamily: 'PingFang SC, -apple-system, sans-serif', fontWeight: 700 }}>
                Ready
              </span>
            </div>
          )}
        </div>
        {/* 标题 */}
        <span className="text-[12px] font-medium text-[rgba(0,0,0,0.9)] leading-[1.67em] truncate flex-1" style={{ fontFamily: 'PingFang SC, -apple-system, sans-serif' }}>
          {session.name}
        </span>
        {/* 操作按钮 */}
        <div className="flex items-center gap-2 ml-2">
          <Button
            icon={<ClearOutlined />}
            onClick={onClearEvents}
            disabled={events.length === 0 || isRecording}
            size="small"
            type="text"
            title="Clear all events"
            className="text-[#333333]"
          />
          <Button
            icon={<CloseOutlined />}
            onClick={onClose}
            size="small"
            type="text"
            title="Close"
            className="text-[#333333]"
          />
        </div>
      </div>

      {/* 事件列表 */}
      <div className="flex-1 overflow-auto p-4">
        {events.length === 0 ? (
          <Empty description="No events recorded yet" />
        ) : (
          <RecordTimeline events={events} />
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="px-4 py-6 pb-8 flex justify-center">
        {!isRecording ? (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => onStartRecording(sessionId)}
            disabled={isRecording}
            size="large"
            className="w-full max-w-xs h-12 text-[14px] font-medium rounded-lg"
            style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
          >
            Start
          </Button>
        ) : (
          <div className="relative" style={{ maxWidth: '304px', width: '100%' }}>
            {/* 渐变边框背景 */}
            <div
              className="absolute inset-0 rounded-xl p-[1px] rec-breath-border"
              style={{
                background: 'linear-gradient(45deg, #538CFF, #0066FF, #7B02C5, #FF7D3C, #FFA53C)',
                boxShadow: '0px 0px 0px 3px rgba(217, 233, 255, 1)'
              }}
            >
              <div className="w-full h-full bg-white rounded-xl"></div>
              <style>{`
                @keyframes rec-breath {
                  0%   { filter: brightness(1) opacity(1); }
                  50%  { filter: brightness(1.08) opacity(0.88); }
                  100% { filter: brightness(1) opacity(1); }
                }
                .rec-breath-border {
                  animation: rec-breath 2s infinite ease-in-out;
                }
              `}</style>
            </div>

            {/* 内容容器 */}
            <div className="relative flex items-center px-4 py-3">
              {/* Recording 状态 */}
              <div className="flex items-center gap-2.5 flex-1">
                <Spin
                  size="small"
                  indicator={<LoadingOutlined spin style={{ fontSize: 15 }} />}
                  style={{
                    color: '#2B83FF',
                    fontSize: '16px'
                  }}
                />
                <span
                  className="text-[14px] font-medium text-[rgba(0,0,0,0.85)]"
                  style={{
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    lineHeight: '1.21'
                  }}
                >
                  Recording
                </span>
              </div>

              {/* 分割线 */}
              <div
                className="border-l mx-4"
                style={{
                  width: '0px',
                  height: '15px',
                  borderLeftColor: 'rgba(0,0,0,0.08)',
                  borderLeftWidth: '1px'
                }}
              ></div>

              {/* Stop 按钮 */}
              <button
                onClick={onStopRecording}
                disabled={!isRecording}
                className="flex items-center gap-1 hover:opacity-80 transition-opacity bg-transparent border-none p-0"
                style={{ background: 'none' }}
              >
                <div
                  className="bg-[#151414] w-3 h-3"
                  style={{
                    borderRadius: '2px'
                  }}
                ></div>
                <span
                  className="text-sm font-medium text-[rgba(0,0,0,0.85)]"
                  style={{
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    lineHeight: '1.21'
                  }}
                >
                  Stop
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
