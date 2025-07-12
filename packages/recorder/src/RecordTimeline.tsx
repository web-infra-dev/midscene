import {
  AimOutlined,
  CompassOutlined,
  CopyOutlined,
  EditOutlined,
  KeyOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Image,
  Popover,
  Space,
  Timeline,
  Typography,
  message,
} from 'antd';
import React, { useState, useEffect } from 'react';
import { ShinyText } from './components/shiny-text';
import type { RecordedEvent } from './recorder';
import './RecordTimeline.css';

const { Text } = Typography;

interface RecordTimelineProps {
  events: RecordedEvent[];
  onEventClick?: (event: RecordedEvent, index: number) => void;
}

export const RecordTimeline = ({
  events,
  onEventClick,
}: RecordTimelineProps) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  useEffect(() => {
    // 方案二：用 className 和 querySelector 获取内部 div
    if (events.length > 0) {
      const timeline = document.querySelector(
        '.ant-timeline',
      ) as HTMLDivElement;
      if (timeline) {
        timeline.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      }
    }
  }, [events.length]);

  const toggleEventExpansion = (index: number) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEvents(newExpanded);
  };

  const truncateJsonStrings = (obj: any, maxLength = 30): any => {
    if (typeof obj === 'string') {
      return obj.length > maxLength ? `${obj.substring(0, maxLength)}...` : obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => truncateJsonStrings(item, maxLength));
    }
    if (obj && typeof obj === 'object') {
      const truncated: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          truncated[key] = truncateJsonStrings(obj[key], maxLength);
        }
      }
      return truncated;
    }
    return obj;
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
        return <AimOutlined style={{ color: '#d9d9d9' }} />;
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
        return 'Input';
      case 'scroll':
        return 'Scroll';
      case 'navigation':
        return 'Navigate';
      case 'setViewport':
        return 'Set viewport';
      case 'keydown':
        return 'Key down';
      default:
        return event.type;
    }
  };

  const getEventDescription = (event: RecordedEvent) => {
    const eventTitle = getEventTitle(event);

    switch (event.type) {
      case 'click':
        if (
          event.descriptionLoading === true &&
          event.elementRect?.x !== undefined &&
          event.elementRect?.y !== undefined
        ) {
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Text>{eventTitle} - </Text>
              <ShinyText
                text={`(${event.elementRect!.x}, ${event.elementRect!.y})`}
                disabled={false}
                speed={3}
                className="step-title-shiny"
              />
            </span>
          );
        }

        if (event.descriptionLoading === false && event.elementDescription) {
          return (
            <Text className="">
              {eventTitle} - {event.elementDescription}
            </Text>
          );
        }

        return <Text>{eventTitle}</Text>;

      case 'input':
        if (event.descriptionLoading === false && event.elementDescription) {
          return (
            <Text>
              {eventTitle} - {event.elementDescription}
            </Text>
          );
        }

        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Text>{eventTitle} - </Text>
            <ShinyText
              text={event.value ? `"${event.value}"` : ''}
              disabled={false}
              speed={3}
              className="step-title-shiny"
            />
          </span>
        );

      case 'scroll':
        if (event.elementDescription) {
          return (
            <Text>
              {eventTitle} - {event.value?.split(' ')[0] || ''}
            </Text>
          );
        }
        return (
          <Text>
            {eventTitle} - Position: ({event.elementRect?.x || 0},{' '}
            {event.elementRect?.y || 0})
          </Text>
        );

      case 'navigation': {
        const truncatedUrl =
          event.url && event.url.length > 50
            ? `${event.url.substring(0, 50)}...`
            : event.url;
        return (
          <Text>
            {eventTitle} - {truncatedUrl}
          </Text>
        );
      }

      case 'setViewport':
        return <Text>{eventTitle} - Desktop 964x992 px</Text>;

      case 'keydown':
        return (
          <Text>
            {eventTitle} - Key: {event.value || 'Unknown'}
          </Text>
        );

      default:
        return <Text>{eventTitle}</Text>;
    }
  };

  const timelineItems = events.map((event, index) => {
    const boxedImage = event.screenshotWithBox;
    const afterImage = event.screenshotAfter;
    const isExpanded = expandedEvents.has(index);

    return {
      dot: getEventIcon(event.type),
      color: getEventColor(event.type),
      children: (
        <div>
          <Card
            size="small"
            bordered={false}
            style={{ marginBottom: isExpanded ? 8 : 8, cursor: 'pointer' }}
            onClick={() => {
              toggleEventExpansion(index);
              onEventClick?.(event, index);
            }}
            styles={{
              body: {
                padding: '8px 12px',
                backgroundColor: '#F2F4F7',
                borderRadius: '8px',
              },
            }}
          >
            <Space
              style={{
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: 'rgba(0, 0, 0, 0.85)',
              }}
            >
              <Space style={{ flex: 1, minWidth: 0 }}>
                {getEventDescription(event)}
              </Space>
              <Space>
                {(boxedImage || afterImage) && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {boxedImage && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          boxShadow: '1px 1px 1px 1px #00000014',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out',
                          zIndex: 2,
                        }}
                        onMouseEnter={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1.2)';
                          target.style.boxShadow = `0 2px 8px ${getEventColor(event.type)}60`;
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1)';
                          target.style.boxShadow = '1px 1px 1px 1px #00000014';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
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
                          preview={{
                            mask: false,
                          }}
                        />
                      </div>
                    )}
                    {afterImage && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          boxShadow: '1px 1px 1px 1px #00000014',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out',
                          marginLeft: boxedImage ? '-8px' : '0',
                          zIndex: 1,
                        }}
                        onMouseEnter={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1.2)';
                          target.style.boxShadow = '0 2px 8px #52c41a60';
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.transform = 'scale(1)';
                          target.style.boxShadow = '1px 1px 1px 1px #00000014';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
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
                          preview={{
                            mask: false,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Space>
            </Space>

            {isExpanded && (
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <Card
                  size="small"
                  style={{ backgroundColor: '#f5f5f5' }}
                  bodyStyle={{ padding: '0px' }}
                >
                  <div style={{ position: 'relative' }}>
                    <pre
                      style={{
                        fontSize: '12px',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        backgroundColor: '#ffffff',
                        padding: '12px',
                        // paddingRight: '50px',
                        borderRadius: '8px',
                        // border: '1px solid #d9d9d9',
                        maxHeight: '250px',
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(truncateJsonStrings(event), null, 2)}
                    </pre>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(JSON.stringify(event, null, 2));
                      }}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid #d9d9d9',
                      }}
                      title="Copy JSON"
                    />
                  </div>
                </Card>
              </div>
            )}
          </Card>
        </div>
      ),
    };
  });

  return (
    <div style={{ padding: '3px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Timeline
          mode="left"
          className="timeline-scrollable"
          items={timelineItems}
          style={{ paddingTop: 16 }}
        />
      </Space>
    </div>
  );
};
