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
      const timeline = document.querySelector('.ant-timeline') as HTMLDivElement;
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
        if (obj.hasOwnProperty(key)) {
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
              <Text type="secondary">{eventTitle} - </Text>
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
            <Text type="secondary">
              {eventTitle} - {event.elementDescription}
            </Text>
          );
        }

        return <Text type="secondary">{eventTitle}</Text>;

      case 'input':
        if (
          event.descriptionLoading === true &&
          event.elementRect?.x !== undefined &&
          event.elementRect?.y !== undefined
        ) {
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Text type="secondary">
                {eventTitle} - {event.value ? ` "${event.value}"` : ''} in{' '}
              </Text>
              <ShinyText
                text={`(${event.elementRect.x}, ${event.elementRect.y})`}
                disabled={false}
                speed={3}
                className="step-title-shiny"
              />
            </span>
          );
        }

        if (event.descriptionLoading === false && event.elementDescription) {
          return (
            <Text type="secondary">
              {eventTitle} - {event.elementDescription}
            </Text>
          );
        }

        return (
          <Text type="secondary">
            {eventTitle}
            {event.value ? ` - "${event.value}"` : ''}
          </Text>
        );

      case 'scroll':
        if (event.elementDescription) {
          return (
            <Text type="secondary">
              {eventTitle} - {(event.value?.split(' ')[0] || '')}
            </Text>
          );
        }
        return (
          <Text type="secondary">
            {eventTitle} - Position: ({event.elementRect?.x || 0},{' '}
            {event.elementRect?.y || 0})
          </Text>
        );

      case 'navigation':
        const truncatedUrl =
          event.url && event.url.length > 50
            ? `${event.url.substring(0, 50)}...`
            : event.url;
        return (
          <Text type="secondary">
            {eventTitle} - {truncatedUrl}
          </Text>
        );

      case 'setViewport':
        return <Text type="secondary">{eventTitle} - Desktop 964x992 px</Text>;

      case 'keydown':
        return (
          <Text type="secondary">
            {eventTitle} - Key: {event.value || 'Unknown'}
          </Text>
        );

      default:
        return <Text type="secondary">{eventTitle}</Text>;
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
            bodyStyle={{ padding: '8px 12px' }}
          >
            <Space
              style={{
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Space style={{ flex: 1, minWidth: 0 }}>
                {getEventDescription(event)}
              </Space>
              <Space>
                {(boxedImage || afterImage) && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {boxedImage && (
                      <Popover
                        content={
                          <div style={{ maxWidth: '400px' }}>
                            <Text strong>Highlighted Element</Text>
                            <Image
                              src={boxedImage}
                              style={{
                                width: '100%',
                                maxHeight: '300px',
                                objectFit: 'contain',
                              }}
                              preview={true}
                            />
                          </div>
                        }
                        trigger="hover"
                        placement="left"
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '20px',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            border: `1px solid ${getEventColor(event.type)}`,
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
                        </div>
                      </Popover>
                    )}
                    {afterImage && (
                      <Popover
                        content={
                          <div style={{ maxWidth: '400px' }}>
                            <Text strong>After Action</Text>
                            <Image
                              src={afterImage}
                              style={{
                                width: '100%',
                                maxHeight: '300px',
                                objectFit: 'contain',
                              }}
                              preview={true}
                            />
                          </div>
                        }
                        trigger="hover"
                        placement="left"
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '20px',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            border: '1px solid #52c41a',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease-in-out',
                            marginLeft: boxedImage ? '-14px' : '0',
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
                        </div>
                      </Popover>
                    )}
                  </div>
                )}
              </Space>
            </Space>
          </Card>
          {isExpanded && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <Card
                size="small"
                style={{ backgroundColor: '#f5f5f5' }}
                bodyStyle={{ padding: '12px' }}
              >
                <div style={{ position: 'relative' }}>
                  <pre
                    style={{
                      fontSize: '12px',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      backgroundColor: '#ffffff',
                      padding: '12px',
                      paddingRight: '50px',
                      borderRadius: '4px',
                      border: '1px solid #d9d9d9',
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
