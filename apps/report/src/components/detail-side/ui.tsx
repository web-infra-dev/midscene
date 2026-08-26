import {
  DownOutlined,
  FileImageOutlined,
  RadiusSettingOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { LocateResultElement } from '@midscene/core';
import { Tag, Tooltip } from 'antd';
import React from 'react';
import { isElementField } from '../store';

export interface DetailCardProps {
  liteMode?: boolean;
  highlightWithColor?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  characteristic?: string;
  content: React.ReactNode;
}

export const Card = (props: DetailCardProps): JSX.Element => {
  const { highlightWithColor, title, subtitle, content, characteristic } =
    props;
  const titleTag = characteristic ? (
    <div className="item-extra">
      <div className="title-tag">
        <Tooltip
          placement="bottomRight"
          title={characteristic}
          mouseEnterDelay={0}
        >
          <span>
            <RadiusSettingOutlined />
          </span>
        </Tooltip>
      </div>
    </div>
  ) : null;
  const titleRightPaddingClass = characteristic ? 'title-right-padding' : '';
  const modeClass = props.liteMode ? 'item-lite' : '';
  const highlightStyle: React.CSSProperties = highlightWithColor
    ? { backgroundColor: highlightWithColor }
    : {};

  return (
    <div
      className={`item ${modeClass} ${highlightWithColor ? 'item-highlight' : ''}`}
      style={highlightStyle}
    >
      <div
        className={`title ${titleRightPaddingClass}`}
        style={{ display: title ? 'block' : 'none' }}
      >
        {title}
        {titleTag}
      </div>
      <div
        className={`subtitle ${titleRightPaddingClass}`}
        style={{ display: subtitle ? 'block' : 'none' }}
      >
        {subtitle}
      </div>
      <div
        className="description"
        style={{ display: content ? 'block' : 'none' }}
      >
        {content}
      </div>
    </div>
  );
};

export const CollapsibleCard = (props: {
  title: string;
  content: React.ReactNode;
  defaultCollapsed?: boolean;
}): JSX.Element => {
  const { title, content, defaultCollapsed = true } = props;
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const contentId = React.useId();

  return (
    <div className="item item-lite item-collapsible">
      <button
        type="button"
        className="title title-collapsible"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed((current) => !current)}
      >
        {title}
        <span className="collapse-icon" aria-hidden="true">
          {collapsed ? <RightOutlined /> : <DownOutlined />}
        </span>
      </button>
      <div id={contentId} className="description" hidden={collapsed}>
        <pre className="description-content">{content}</pre>
      </div>
    </div>
  );
};

export const renderElementDetailBox = (
  value: LocateResultElement,
): JSX.Element => {
  const hasCenter = value.center && Array.isArray(value.center);
  const hasRect = value.rect;

  if (hasCenter && hasRect) {
    const { center, rect } = value;
    const { left, top, width, height } = rect;

    return (
      <div className="element-detail-box">
        <div className="element-detail-line">
          {value.description} (center=[{center[0]}, {center[1]}])
        </div>
        <div className="element-detail-line element-detail-coords">
          left={Math.round(left)}, top={Math.round(top)}, width=
          {Math.round(width)}, height={Math.round(height)}
        </div>
      </div>
    );
  }

  return (
    <span>
      <Tag bordered={false} color="orange" className="element-button">
        Element
      </Tag>
    </span>
  );
};

const renderMetaContent = (content: React.ReactNode): React.ReactNode => {
  if (typeof content !== 'string') {
    return content;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && 'locate' in parsed) {
      const locate = Reflect.get(parsed, 'locate');
      if (isElementField(locate)) {
        return (
          <div>
            <div style={{ marginBottom: '8px' }}>locate:</div>
            {renderElementDetailBox(locate)}
          </div>
        );
      }
    }

    if (isElementField(parsed)) {
      return renderElementDetailBox(parsed);
    }
  } catch {
    // Plain strings are valid report content.
  }

  return content;
};

export interface DetailImage {
  name: string;
  url: string;
}

const readProperty = (value: unknown, key: PropertyKey): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

const readImages = (value: unknown): DetailImage[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const images = value.filter(
    (item): item is DetailImage =>
      typeof item === 'object' &&
      item !== null &&
      typeof Reflect.get(item, 'name') === 'string' &&
      typeof Reflect.get(item, 'url') === 'string',
  );
  return images.length === value.length ? images : undefined;
};

export const extractTaskImages = (
  param: unknown,
): DetailImage[] | undefined => {
  const userInstruction = readProperty(param, 'userInstruction');
  const prompt = readProperty(param, 'prompt');
  const locate = readProperty(param, 'locate');
  const locatePrompt = readProperty(locate, 'prompt');

  return (
    readImages(readProperty(userInstruction, 'images')) ??
    readImages(readProperty(prompt, 'images')) ??
    readImages(readProperty(locatePrompt, 'images'))
  );
};

export const MetaKV = (props: {
  data: Array<{
    key: string;
    content: React.ReactNode;
    images?: DetailImage[];
  }>;
}): JSX.Element => (
  <div className="meta-kv">
    {props.data.map((item, index) => (
      <div className="meta" key={`${item.key}-${index}`}>
        <div className="meta-key">{item.key}</div>
        <div className="meta-value">{renderMetaContent(item.content)}</div>
        {item.images && item.images.length > 0 && (
          <div className="meta-images">
            {item.images.map((image, imageIndex) => (
              <div
                key={`${image.name}-${imageIndex}`}
                className="meta-image-item"
              >
                <FileImageOutlined style={{ marginRight: '6px' }} />
                <a href={image.url} target="_blank" rel="noopener noreferrer">
                  {image.name}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    ))}
  </div>
);
