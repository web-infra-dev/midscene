import {
  ArrowLeftOutlined,
  ClearOutlined,
  CloseOutlined,
  CodeOutlined,
  ControlOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { RecordTimeline } from '@midscene/recorder';
import { Alert, Button, Empty, Spin } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useRecordStore, useRecordingSessionStore } from '../../../store';

import { ProgressModal } from './ProgressModal';

interface RecordDetailProps {
  sessionId: string;
  isRecording: boolean;
  currentTab: chrome.tabs.Tab | null;
  // events: ChromeRecordedEvent[];
  onBack: () => void;
  onStartRecording: (id: string) => void;
  onStopRecording: () => void;
  onClearEvents: () => void;
  isExtensionMode: boolean;
  onClose: () => void;
}

export const RecordDetail: React.FC<RecordDetailProps> = ({
  sessionId,
  isRecording,
  // events = [],
  onBack,
  onStartRecording,
  onStopRecording,
  onClearEvents,
  onClose,
}) => {
  // useState must be called at the top level of the component, not after conditional statements
  const [tab, setTab] = useState<'timeline' | 'code'>('timeline');
  const [isFromStopRecording, setIsFromStopRecording] = useState(false);
  const { events } = useRecordStore();

  // Get the session directly from the store to ensure we always have the latest data
  const { sessions } = useRecordingSessionStore();
  const session = sessions.find((s) => s.id === sessionId);

  // 新增：sessionId 变化时重置 tab
  useEffect(() => {
    setTab('timeline');
    setIsFromStopRecording(false);
  }, [sessionId]);

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

  // Wrap onStopRecording, switch to code tab after stopping recording
  const handleStopRecording = () => {
    onStopRecording();
    setIsFromStopRecording(true);
    setTab('code');
  };

  // Reset isFromStopRecording state when manually switching to code tab
  const handleTabChange = (newTab: 'timeline' | 'code') => {
    if (newTab === 'timeline') {
      setIsFromStopRecording(false);
    }
    setTab(newTab);
  };

  return (
    <div className="record-detail-view flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center">
        {/* Recording status */}
        <div className="flex items-center mr-2">
          {isRecording ? (
            <div
              className="flex items-center gap-[4px] h-[20px] px-[7px] py-[4px] rounded-[23px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                background: 'rgba(255, 17, 17, 0.08)',
                // Transparent red background
              }}
              onClick={handleStopRecording}
              title="Click to stop recording"
            >
              <span
                className="inline-block rec-dot-pulse"
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
              <style>{`
                @keyframes rec-dot-pulse {
                  0% { 
                    transform: scale(1);
                    opacity: 1;
                  }
                  50% { 
                    transform: scale(1.3);
                    opacity: 0.7;
                  }
                  100% { 
                    transform: scale(1);
                    opacity: 1;
                  }
                }
                .rec-dot-pulse {
                  animation: rec-dot-pulse 1.5s infinite ease-in-out;
                }
              `}</style>
            </div>
          ) : (
            <div className="flex items-center gap-[4px] h-[20px] px-[7px] py-[4px] rounded-[23px] bg-[#EFFFE0]">
              <span className="w-[6px] h-[6px] rounded-full bg-[#00C700] inline-block" />
              <span
                className="text-[#12A902] text-[10px] font-medium leading-[2em]"
                style={{
                  fontFamily: 'PingFang SC, -apple-system, sans-serif',
                  fontWeight: 700,
                }}
              >
                Ready
              </span>
            </div>
          )}
        </div>
        {/* Title */}
        <span
          className="text-[12px] font-medium text-[rgba(0,0,0,0.9)] leading-[1.67em] truncate flex-1"
          style={{ fontFamily: 'PingFang SC, -apple-system, sans-serif' }}
        >
          {session.name}
        </span>
        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-2">
          <Button
            icon={<ClearOutlined />}
            onClick={() => {
              setTab('timeline');
              setIsFromStopRecording(false);
              onClearEvents();
            }}
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

      {/* Figma-style Tabs */}
      <div
        className="px-2 py-0  my-[20px]"
        style={{
          background: '#F2F4F7',
          borderRadius: '8px',
          height: '41px',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <div className="flex gap-2 w-full items-stretch !text-[12px]">
          <button
            type="button"
            className={
              'flex items-center justify-center gap-1.5 flex-1 transition-colors !font-medium !leading-[1.83em] !bg-transparent !rounded-lg !py-2 !px-0 !border-none !cursor-pointer text-[rgba(0,0,0,0.85)]'
            }
            style={{
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}
            onClick={() => handleTabChange('timeline')}
          >
            {/* Timeline icon */}
            <div className="w-4 h-4 flex items-center justify-center !rounded-none">
              <ControlOutlined />
            </div>
            Record Timeline
          </button>

          {/* Divider */}
          <div className="flex items-center">
            <RightOutlined className="text-xs w-3 h-3 " />
          </div>

          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 flex-1 transition-colors !font-medium !leading-[1.83em] !bg-transparent !rounded-lg !py-2 !px-0 !border-none !cursor-pointer ${
              tab === 'code'
                ? 'text-[rgba(0,0,0,0.85)]'
                : 'text-[rgba(0,0,0,0.25)]'
            } ${events.length === 0 ? '!text-gray-300 !cursor-not-allowed' : ''}`}
            style={{
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}
            onClick={() => events.length > 0 && handleTabChange('code')}
            disabled={events.length === 0}
            title={events.length === 0 ? 'Record some events first' : undefined}
          >
            {/* Code icon */}
            <div className="w-4 h-4 flex items-center justify-center !rounded-none">
              <CodeOutlined className="!bg-transparent" />
            </div>
            Generate code
          </button>
        </div>
      </div>

      {/* Tab content area */}
      <div className="flex-1 overflow-auto">
        {tab === 'timeline' ? (
          events.length === 0 ? (
            <Empty description="No events recorded yet" />
          ) : (
            <div className="p-[16px 0]">
              <RecordTimeline events={events} />
            </div>
          )
        ) : (
          <ProgressModal
            eventsCount={events.length}
            sessionName={session.name}
            events={events}
            sessionId={session.id}
            onStopRecording={handleStopRecording}
            isFromStopRecording={isFromStopRecording}
          />
        )}
      </div>

      {/* Fixed bottom action bar - only shown in timeline tab */}
      {tab === 'timeline' && (
        <div className="px-4 py-6 flex justify-center">
          {!isRecording ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => onStartRecording(sessionId)}
              disabled={isRecording}
              className="!fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000] !h-[40px] !py-[12px] !px-[12px] !rounded-[48px]"
              style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
            >
              Start Recording
            </Button>
          ) : (
            <div
              className="relative"
              style={{ maxWidth: '304px', width: '100%' }}
            >
              {/* Gradient border background */}
              <div
                className="absolute inset-0 rounded-xl p-[1px] rec-breath-border"
                style={{
                  background:
                    'linear-gradient(45deg, #538CFF, #0066FF, #7B02C5, #FF7D3C, #FFA53C)',
                  boxShadow: '0px 0px 0px 3px rgba(217, 233, 255, 1)',
                }}
              >
                <div className="w-full h-full bg-white rounded-xl" />
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

              {/* Content container */}
              <div className="relative flex items-center px-4 py-3">
                {/* Recording status */}
                <div className="flex items-center gap-2.5 flex-1">
                  <Spin
                    size="small"
                    indicator={
                      <LoadingOutlined spin style={{ fontSize: 15 }} />
                    }
                    style={{
                      color: '#2B83FF',
                      fontSize: '16px',
                    }}
                  />
                  <span
                    className="text-[14px] font-medium text-[rgba(0,0,0,0.85)]"
                    style={{
                      fontFamily: 'Inter, -apple-system, sans-serif',
                      lineHeight: '1.21',
                    }}
                  >
                    Recording
                  </span>
                </div>

                {/* Divider */}
                <div
                  className="border-l mx-4"
                  style={{
                    width: '0px',
                    height: '15px',
                    borderLeftColor: 'rgba(0,0,0,0.08)',
                    borderLeftWidth: '1px',
                  }}
                />

                <button
                  type="button"
                  onClick={handleStopRecording}
                  disabled={!isRecording}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer"
                  style={{ background: 'none' }}
                >
                  <div
                    className="bg-[#151414] w-3 h-3"
                    style={{
                      borderRadius: '2px',
                    }}
                  />
                  <span
                    className="text-sm font-medium text-[rgba(0,0,0,0.85)]"
                    style={{
                      fontFamily: 'Inter, -apple-system, sans-serif',
                      lineHeight: '1.21',
                    }}
                  >
                    Stop
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
