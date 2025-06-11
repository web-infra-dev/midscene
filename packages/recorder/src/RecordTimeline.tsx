import {
  AimOutlined,
  CompassOutlined,
  CopyOutlined,
  EditOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  MoreOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons';
import { compositeElementInfoImg } from '@midscene/shared/img';
import {
  Button,
  Card,
  Image,
  Popover,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import React from 'react';
import type { RecordedEvent } from './recorder';

const { Text, Title } = Typography;

// interface RecordedEvent {
//   type: 'click' | 'scroll' | 'input' | 'navigation' | 'setViewport' | 'keydown';
//   timestamp: number;
//   value?: string;
//   element?: HTMLElement;
//   targetTagName?: string;
//   targetId?: string;
//   targetClassName?: string;
//   url?: string;
//   title?: string;
//   screenshot?: string;
//   screenshotWithBox?: string;
//   screenshotBefore?: string;
//   screenshotAfter?: string;
//   //点击点
//   x?: number;
//   y?: number;
//   // 元素位置信息
//   viewportX?: number;
//   viewportY?: number;
//   width?: number;
//   height?: number;
//   // 页面尺寸信息
//   pageWidth: number;
//   pageHeight: number;
//   //元素描述
//   elementDescription?: string;
// }

interface RecordTimelineProps {
  events: RecordedEvent[];
  onEventClick?: (event: RecordedEvent, index: number) => void;
}

export const RecordTimeline = ({
  events,
  onEventClick,
}: RecordTimelineProps) => {
  console.log('[RecordTimeline] events: ', {
    events,
    length: events.length,
  });
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'click':
        return <AimOutlined style={{ color: '#1890ff' }} />;
      case 'input':
        return <EditOutlined style={{ color: '#52c41a' }} />;
      case 'scroll':
        return <VerticalAlignTopOutlined style={{ color: '#faad14' }} />;
      case 'navigation':
        return <CompassOutlined style={{ color: '#722ed1' }} />;
      case 'setViewport':
        return <CompassOutlined style={{ color: '#eb2f96' }} />;
      case 'keydown':
        return <KeyOutlined style={{ color: '#fa8c16' }} />;
      default:
        return <MoreOutlined />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'click':
        return '#1890ff';
      case 'input':
        return '#52c41a';
      case 'scroll':
        return '#faad14';
      case 'navigation':
        return '#722ed1';
      case 'setViewport':
        return '#eb2f96';
      case 'keydown':
        return '#fa8c16';
      default:
        return '#d9d9d9';
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getEventTitle = (event: RecordedEvent) => {
    switch (event.type) {
      case 'click':
        if (event.targetTagName === 'BUTTON') {
          return 'Click Button';
        }
        if (event.value) {
          return `Click Element "${event.value}"`;
        }
        return 'Click';
      case 'input':
        return 'Change';
      case 'scroll':
        return 'Scroll';
      case 'navigation':
        return event.title || 'Navigate';
      case 'setViewport':
        return 'Set viewport';
      case 'keydown':
        return 'Key down';
      default:
        return event.type;
    }
  };

  const getEventDescription = (event: RecordedEvent) => {
    switch (event.type) {
      case 'click':
        return (
          <Space direction="vertical" size="small">
            {event.targetTagName && (
              <Text type="secondary">Element "{event.targetTagName}"</Text>
            )}
            {event.elementRect?.x !== undefined &&
              event.elementRect?.y !== undefined && (
                <Text type="secondary">
                  Position: ({event.elementRect?.x}, {event.elementRect?.y})
                </Text>
              )}
            {event.elementDescription !== undefined && (
              <Text type="secondary">
                Description: {event.elementDescription}
              </Text>
            )}
          </Space>
        );
      case 'input':
        return (
          <Space direction="vertical" size="small">
            <Text type="secondary">
              Element "{event.targetTagName || 'Input'}"
            </Text>
            {event.elementDescription !== undefined && (
              <Text type="secondary">
                Description: {event.elementDescription}
              </Text>
            )}
            {event.value && <Text code>"{event.value}"</Text>}
          </Space>
        );
      case 'scroll':
        return (
          <Text type="secondary">
            Position: ({event.elementRect?.x || 0}, {event.elementRect?.y || 0})
          </Text>
        );
      case 'navigation':
        return (
          <Space direction="vertical" size="small">
            {event.url && <Text type="secondary">{event.url}</Text>}
          </Space>
        );
      case 'setViewport':
        return <Text type="secondary">Desktop 964x992 px</Text>;
      case 'keydown':
        return <Text type="secondary">Key: {event.value || 'Unknown'}</Text>;
      default:
        return null;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        message.success('JSON copied to clipboard');
      })
      .catch(() => {
        message.error('Copy failed');
      });
  };

  const timelineItems = events.map((event, index) => {
    const originalImage = event.screenshotBefore || '';
    const boxedImage = event.screenshotWithBox;
    const afterImage = event.screenshotAfter;
    const hasElementInfo =
      event.elementRect?.left !== undefined &&
      event.elementRect?.top !== undefined;

    const eventJsonString = JSON.stringify(event, null, 2);

    return {
      dot: getEventIcon(event.type),
      color: getEventColor(event.type),
      children: (
        <Card
          size="small"
          bordered={false}
          style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={() => onEventClick?.(event, index)}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Text strong>{getEventTitle(event)}</Text>
                <Tag color={getEventColor(event.type)}>{event.type}</Tag>
                {hasElementInfo && (
                  <Tag color="orange" style={{ fontSize: '10px' }}>
                    Element Located
                  </Tag>
                )}
              </Space>
              <Space>
                <Popover
                  content={
                    <div style={{ maxWidth: '500px', maxHeight: '400px' }}>
                      <div
                        style={{
                          marginBottom: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text strong>Event Details</Text>
                        <Button
                          type="primary"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(eventJsonString)}
                        >
                          Copy JSON
                        </Button>
                      </div>
                      <div style={{ overflow: 'auto', maxHeight: '350px' }}>
                        <pre
                          style={{
                            fontSize: '12px',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            backgroundColor: '#f5f5f5',
                            padding: '12px',
                            borderRadius: '4px',
                            border: '1px solid #d9d9d9',
                          }}
                        >
                          {eventJsonString}
                        </pre>
                      </div>
                    </div>
                  }
                  trigger="click"
                  placement="right"
                  overlayStyle={{ maxWidth: '550px' }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<InfoCircleOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    title="View Event Details"
                  />
                </Popover>
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Handle more actions
                  }}
                />
              </Space>
            </Space>
            {getEventDescription(event)}
            {(boxedImage || afterImage) && (
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                {/* Screenshot with highlighted element */}
                {boxedImage && (
                  <div style={{ flexShrink: 0 }}>
                    <div
                      style={{
                        marginBottom: '4px',
                        fontSize: '11px',
                        color: '#8c8c8c',
                        textAlign: 'center',
                      }}
                    >
                      Highlighted
                    </div>
                    <Popover
                      content={
                        <div style={{ maxWidth: '400px' }}>
                          <Space
                            direction="vertical"
                            size="small"
                            style={{ width: '100%' }}
                          >
                            <Text strong>Selected Element Details</Text>
                            <Image
                              src={boxedImage}
                              style={{
                                width: '100%',
                                maxHeight: '300px',
                                objectFit: 'contain',
                              }}
                              preview={true}
                            />
                            <div
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#f0f8ff',
                                borderRadius: '4px',
                                fontSize: '12px',
                              }}
                            >
                              <div>
                                <Text strong>Element Type:</Text>{' '}
                                {event.targetTagName || 'Unknown'}
                              </div>
                              <div>
                                <Text strong>Action:</Text> {event.type}
                              </div>
                              <div>
                                <Text strong>Position:</Text> (
                                {event.elementRect?.left},{' '}
                                {event.elementRect?.top})
                              </div>
                              <div>
                                <Text strong>Size:</Text>{' '}
                                {event.elementRect?.width} ×{' '}
                                {event.elementRect?.height}px
                              </div>
                              {event.pageInfo.width &&
                                event.pageInfo.height && (
                                  <div>
                                    <Text strong>Page Size:</Text>{' '}
                                    {event.pageInfo.width} ×{' '}
                                    {event.pageInfo.height}px
                                  </div>
                                )}
                              {event.value && (
                                <div>
                                  <Text strong>Content:</Text> "{event.value}"
                                </div>
                              )}
                            </div>
                          </Space>
                        </div>
                      }
                      title="Element Details"
                      trigger="hover"
                      placement="right"
                    >
                      <div
                        style={{
                          width: '80px',
                          height: '50px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          border: `2px solid ${getEventColor(event.type)}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out',
                          background: '#f8f9fa',
                        }}
                        onMouseEnter={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1.05)';
                          target.style.boxShadow = `0 4px 12px ${getEventColor(event.type)}60`;
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1)';
                          target.style.boxShadow = 'none';
                        }}
                      >
                        <Image
                          src={boxedImage}
                          width="100%"
                          height="100%"
                          style={{
                            objectFit: 'cover',
                            display: 'block',
                          }}
                          preview={false}
                        />
                        {/* 元素类型标签 */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: getEventColor(event.type),
                            color: 'white',
                            fontSize: '8px',
                            padding: '1px 3px',
                            borderRadius: '2px',
                            lineHeight: 1,
                          }}
                        >
                          {event.type.toUpperCase()}
                        </div>
                      </div>
                    </Popover>
                  </div>
                )}

                {/* After screenshot */}
                {afterImage && (
                  <div style={{ flexShrink: 0 }}>
                    <div
                      style={{
                        marginBottom: '4px',
                        fontSize: '11px',
                        color: '#8c8c8c',
                        textAlign: 'center',
                      }}
                    >
                      After
                    </div>
                    <Popover
                      content={
                        <div style={{ maxWidth: '400px' }}>
                          <Space
                            direction="vertical"
                            size="small"
                            style={{ width: '100%' }}
                          >
                            <Text strong>After Action Screenshot</Text>
                            <Image
                              src={afterImage}
                              style={{
                                width: '100%',
                                maxHeight: '300px',
                                objectFit: 'contain',
                              }}
                              preview={true}
                            />
                            <div
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#f0fff0',
                                borderRadius: '4px',
                                fontSize: '12px',
                              }}
                            >
                              <div>
                                <Text strong>Action:</Text> {event.type}
                              </div>
                              <div>
                                <Text strong>Timestamp:</Text>{' '}
                                {formatTime(event.timestamp)}
                              </div>
                              {event.value && (
                                <div>
                                  <Text strong>Value:</Text> "{event.value}"
                                </div>
                              )}
                            </div>
                          </Space>
                        </div>
                      }
                      title="After Action"
                      trigger="hover"
                      placement="right"
                    >
                      <div
                        style={{
                          width: '80px',
                          height: '50px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          border: '2px solid #52c41a',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out',
                          background: '#f6ffed',
                        }}
                        onMouseEnter={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1.05)';
                          target.style.boxShadow = '0 4px 12px #52c41a60';
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1)';
                          target.style.boxShadow = 'none';
                        }}
                      >
                        <Image
                          src={afterImage}
                          width="100%"
                          height="100%"
                          style={{
                            objectFit: 'cover',
                            display: 'block',
                          }}
                          preview={false}
                        />
                        {/* After action label */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: '#52c41a',
                            color: 'white',
                            fontSize: '8px',
                            padding: '1px 3px',
                            borderRadius: '2px',
                            lineHeight: 1,
                          }}
                        >
                          AFTER
                        </div>
                      </div>
                    </Popover>
                  </div>
                )}
              </div>
            )}
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {formatTime(event.timestamp)}
            </Text>
          </Space>
        </Card>
      ),
    };
  });

  return (
    <div style={{ padding: '16px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Recording Timeline
          </Title>
          <Space>
            <Text type="secondary">{events.length} events recorded</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              ({events.filter((e) => e.elementRect?.left !== undefined).length}{' '}
              events with located elements)
            </Text>
          </Space>
        </div>

        <Timeline
          mode="left"
          items={timelineItems}
          style={{ paddingTop: 16 }}
        />
      </Space>
    </div>
  );
};
