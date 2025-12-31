/* eslint-disable max-lines */
'use client';
import './index.less';

import { FileImageOutlined, RadiusSettingOutlined } from '@ant-design/icons';
import type {
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskPlanning,
  ExecutionTaskPlanningApply,
  LocateResultElement,
} from '@midscene/core';
import { extractInsightParam, paramStr, typeStr } from '@midscene/core/agent';
import {
  highlightColorForType,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Tag, Tooltip } from 'antd';
import { fullTimeStrWithMilliseconds } from '../../../../../packages/visualizer/src/utils';
import { isElementField, useExecutionDump } from '../store';

const noop = () => {};
const Card = (props: {
  liteMode?: boolean;
  highlightWithColor?: string;
  title?: string;
  subtitle?: string;
  characteristic?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  content: any;
}) => {
  const {
    highlightWithColor,
    title,
    subtitle,
    onMouseEnter,
    onMouseLeave,
    content,
    characteristic,
  } = props;
  const titleTag = props.characteristic ? (
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

  const titleRightPaddingClass = props.characteristic
    ? 'title-right-padding'
    : '';
  const modeClass = props.liteMode ? 'item-lite' : '';
  const highlightStyle = highlightWithColor
    ? { backgroundColor: highlightWithColor }
    : {};
  return (
    <div
      className={`item ${modeClass} ${highlightWithColor ? 'item-highlight' : ''}`}
      style={{ ...highlightStyle }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* {extraSection} */}

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

// Shared helper function to render element detail box
const renderElementDetailBox = (_value: LocateResultElement) => {
  const hasCenter = _value.center && Array.isArray(_value.center);
  const hasRect = _value.rect;

  // If it has center and rect, show detailed info
  if (hasCenter && hasRect) {
    const { center, rect } = _value;
    const { left, top, width, height } = rect;

    return (
      <div className="element-detail-box">
        <div className="element-detail-line">
          {_value.description} (center=[{center[0]}, {center[1]}])
        </div>
        <div className="element-detail-line element-detail-coords">
          left={Math.round(left)}, top={Math.round(top)}, width=
          {Math.round(width)}, height={Math.round(height)}
        </div>
      </div>
    );
  }

  // Fallback to simple tag
  return (
    <span>
      <Tag bordered={false} color="orange" className="element-button">
        Element
      </Tag>
    </span>
  );
};

// Helper function to render content with element detection
const renderMetaContent = (
  content: string | JSX.Element,
): string | JSX.Element => {
  // If content is already JSX, return it
  if (typeof content !== 'string') {
    return content;
  }

  // Try to parse JSON string
  try {
    const parsed = JSON.parse(content);

    // Check if it's a locate object with element inside
    if (parsed.locate && isElementField(parsed.locate)) {
      return (
        <div>
          <div style={{ marginBottom: '8px' }}>locate:</div>
          {renderElementDetailBox(parsed.locate)}
        </div>
      );
    }

    // Check if it's directly an element
    if (isElementField(parsed)) {
      return renderElementDetailBox(parsed);
    }
  } catch (e) {
    // Not JSON, return as is
  }

  return content;
};

// Helper function to extract images from task params
const extractTaskImages = (
  param: any,
): Array<{ name: string; url: string }> | undefined => {
  // For locate params (Planning and Action Space tasks)
  if (param?.prompt?.images && Array.isArray(param.prompt.images)) {
    return param.prompt.images;
  }

  // For nested locate params (Action Space tasks)
  if (
    param?.locate?.prompt?.images &&
    Array.isArray(param.locate.prompt.images)
  ) {
    return param.locate.prompt.images;
  }

  return undefined;
};

const MetaKV = (props: {
  data: {
    key: string;
    content: string | JSX.Element;
    images?: { name: string; url: string }[];
  }[];
}) => {
  return (
    <div className="meta-kv">
      {props.data.map((item, index) => {
        return (
          <div className="meta" key={index}>
            <div className="meta-key">{item.key}</div>
            <div className="meta-value">{renderMetaContent(item.content)}</div>
            {item.images && item.images.length > 0 && (
              <div className="meta-images">
                {item.images.map((image, imgIndex) => (
                  <div key={imgIndex} className="meta-image-item">
                    <FileImageOutlined style={{ marginRight: '6px' }} />
                    <a
                      href={image.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {image.name}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const objectWithoutKeys = (
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> =>
  Object.keys(obj).reduce(
    (acc, key) => {
      if (!keys.includes(key)) {
        (acc as any)[key] = obj[key];
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );

const DetailSide = (): JSX.Element => {
  const task = useExecutionDump((store) => store.activeTask);
  const dump = useExecutionDump((store) => store.insightDump);
  const { matchedElement: elements } = dump || {};
  const reasoningContent = task?.reasoning_content;

  const aiActContextValue = (task as ExecutionTaskPlanningApply)?.param
    ?.aiActContext;

  // Helper functions for rendering element items
  const elementEl = renderElementDetailBox;

  const kv = (data: Record<string, unknown>) => {
    // Recursively render value
    const renderValue = (value: unknown): JSX.Element => {
      // Check if it's an element first
      if (isElementField(value)) {
        return <>{elementEl(value)}</>;
      }

      // Check if it's an array
      if (Array.isArray(value)) {
        // Check if array contains elements
        if (value.some((item) => isElementField(item))) {
          return (
            <>
              {value.map((item, index) => (
                <div key={index}>{renderValue(item)}</div>
              ))}
            </>
          );
        }
        // Regular array
        return <pre>{JSON.stringify(value, undefined, 2)}</pre>;
      }

      // Check if it's an object (and not null)
      if (typeof value === 'object' && value !== null) {
        // Recursively render nested object
        const nestedKv = Object.keys(value).map((nestedKey) => {
          const nestedValue = (value as any)[nestedKey];
          return (
            <div key={nestedKey} className="nested-kv">
              <span className="nested-key">{nestedKey}: </span>
              {renderValue(nestedValue)}
            </div>
          );
        });
        return <>{nestedKv}</>;
      }

      // Primitive value
      return <pre>{JSON.stringify(value, undefined, 2)}</pre>;
    };

    if (Array.isArray(data) || typeof data !== 'object') {
      return (
        <pre className="description-content">
          {JSON.stringify(data, undefined, 2)}
        </pre>
      );
    }

    return Object.keys(data).map((key) => {
      const value = data[key];
      return (
        <pre className="description-content" key={key}>
          {key} {renderValue(value)}
        </pre>
      );
    });
  };

  const metaKVElement = MetaKV({
    data: [
      {
        key: 'type',
        content: (task && typeStr(task)) || '',
      },
      {
        key: 'status',
        content: task?.status || '',
      },
      {
        key: 'start',
        content: fullTimeStrWithMilliseconds(task?.timing?.start),
      },
      {
        key: 'end',
        content: fullTimeStrWithMilliseconds(task?.timing?.end),
      },
      {
        key: 'total time',
        content: timeCostStrElement(task?.timing?.cost),
      },
      ...(aiActContextValue
        ? [
            {
              key: 'act context',
              content: aiActContextValue,
            },
          ]
        : []),
      ...(task?.usage?.time_cost
        ? [
            {
              key: 'AI service time',
              content: <pre>{timeCostStrElement(task?.usage?.time_cost)}</pre>,
            },
          ]
        : []),
      ...(task?.hitBy
        ? [
            {
              key: 'hitBy',
              content: (() => {
                const hitBy = task.hitBy as any;
                // Special handling for Cache with yamlString
                if (hitBy.from === 'Cache' && hitBy.context?.yamlString) {
                  return (
                    <>
                      <div>
                        <strong>from:</strong> {hitBy.from}
                      </div>
                      <div>
                        <strong>context:</strong>
                      </div>
                      <pre className="description-content yaml-content">
                        {hitBy.context.yamlString}
                      </pre>
                    </>
                  );
                }
                // Default JSON rendering
                return <pre>{JSON.stringify(hitBy, undefined, 2)}</pre>;
              })(),
            },
          ]
        : []),
      ...(task?.searchAreaUsage
        ? [
            {
              key: 'searchAreaUsage',
              content: (
                <pre>{JSON.stringify(task.searchAreaUsage, undefined, 2)}</pre>
              ),
            },
          ]
        : []),
      ...(task?.usage
        ? [
            {
              key: 'usage',
              content: <pre>{JSON.stringify(task.usage, undefined, 2)}</pre>,
            },
          ]
        : []),
    ],
  });

  let taskInput: JSX.Element | null = null;
  if (task?.type === 'Planning') {
    const planningTask = task as ExecutionTaskPlanning;
    const isPageContextFrozen = Boolean((task?.uiContext as any)?._isFrozen);

    // Extract images from Planning/Locate tasks
    const locateParam = (planningTask as any)?.param;
    const images = extractTaskImages(locateParam);

    if (planningTask.param?.userInstruction) {
      // Ensure userInstruction is a string
      const instructionContent =
        typeof planningTask.param.userInstruction === 'string'
          ? planningTask.param.userInstruction
          : JSON.stringify(planningTask.param.userInstruction);

      taskInput = MetaKV({
        data: [
          {
            key: 'instruction',
            content: instructionContent,
            images: images,
          },
          ...(isPageContextFrozen
            ? [
                {
                  key: 'context',
                  content: <Tag color="blue">Frozen Context 🧊</Tag>,
                },
              ]
            : []),
        ],
      });
    } else {
      // Ensure paramStr result is a string
      const paramValue = paramStr(task);
      const promptContent =
        typeof paramValue === 'string'
          ? paramValue
          : JSON.stringify(paramValue);

      taskInput = MetaKV({
        data: [
          {
            key: 'userPrompt',
            content: promptContent,
            images: images,
          },
          ...(isPageContextFrozen
            ? [
                {
                  key: 'context',
                  content: <Tag color="blue">Frozen Context 🧊</Tag>,
                },
              ]
            : []),
        ],
      });
    }
  } else if (task?.type === 'Insight') {
    const isPageContextFrozen = Boolean((task?.uiContext as any)?._isFrozen);

    // Use extractInsightParam to get content and images
    const taskParam = (task as any)?.param;
    const { content: displayContent, images } = extractInsightParam(taskParam);

    // Fallback to paramStr if no content extracted
    const finalContent = displayContent || paramStr(task);

    taskInput = MetaKV({
      data: [
        ...(finalContent
          ? [
              {
                key: 'param',
                content: finalContent,
                images: images,
              },
            ]
          : []),
        ...(task?.param?.id
          ? [
              {
                key: 'id',
                content: task.param.id,
              },
            ]
          : []),
        ...(isPageContextFrozen
          ? [
              {
                key: 'context',
                content: <Tag color="blue">Frozen Context 🧊</Tag>,
              },
            ]
          : []),
      ],
    });
  } else if (task?.type === 'Action Space') {
    const actionTask = task as ExecutionTaskAction;

    // Helper to convert to string
    const toContent = (value: any) =>
      typeof value === 'string' ? value : JSON.stringify(value);

    const images = extractTaskImages(actionTask?.param);
    const data: {
      key: string;
      content: string;
      images?: { name: string; url: string }[];
    }[] = [];

    if (actionTask?.param && typeof actionTask.param === 'object') {
      Object.entries(actionTask.param).forEach(([key, value]) => {
        data.push({
          key,
          content: toContent(value),
          images: key === 'locate' ? images : undefined,
        });
      });
    }

    // Fallback to paramStr if param is not an object
    if (data.length === 0) {
      data.push({
        key: 'value',
        content: toContent(paramStr(task)),
        images: images,
      });
    }

    taskInput = MetaKV({ data });
  } else if (task?.type === 'Log') {
    taskInput = task.param?.content ? (
      <pre className="log-content">{task.param.content}</pre>
    ) : null;
  }

  let outputDataContent = null;
  const actions = (task as ExecutionTaskPlanning)?.output?.actions;

  // Prepare error content separately (can coexist with elements)
  let errorContent: JSX.Element | null = null;
  if (task?.error || task?.errorMessage) {
    let errorText = '';

    // prefer errorMessage
    if (task.errorMessage) {
      errorText = task.errorMessage;
    } else if (task.error) {
      // if no errorMessage, try to show error object
      if (typeof task.error === 'string') {
        errorText = task.error;
      } else if (typeof task.error === 'object' && task.error.message) {
        errorText = task.error.message;
      } else {
        errorText = JSON.stringify(task.error, null, 2) || 'Unknown error';
      }
    }

    // add stack info (if exists and not duplicate)
    if (task.errorStack && !errorText.includes(task.errorStack)) {
      errorText += `\n\nStack:\n${task.errorStack}`;
    }

    errorContent = (
      <Card
        liteMode={true}
        title="Error"
        onMouseEnter={noop}
        onMouseLeave={noop}
        content={
          <pre className="description-content" style={{ color: '#F00' }}>
            {errorText}
          </pre>
        }
      />
    );
  }

  if (elements?.length) {
    const elementsContent = elements.map((element, idx) => {
      const ifHighlight = false; // highlightElements.includes(element);
      const highlightColor = ifHighlight
        ? highlightColorForType('element')
        : undefined;

      const elementKV = kv(
        objectWithoutKeys(element as any, [
          'content',
          'left',
          'top',
          'right',
          'bottom',
          'locator',
        ]),
      );

      return (
        <Card
          title={
            'content' in element && typeof element.content === 'string'
              ? element.content
              : undefined
          }
          highlightWithColor={highlightColor}
          subtitle=""
          content={elementKV}
          key={idx}
        />
      );
    });

    // Combine elements with error if both exist
    outputDataContent = (
      <>
        {errorContent}
        {elementsContent}
      </>
    );
  } else if (errorContent) {
    // Only error, no elements
    outputDataContent = errorContent;
  } else if (task?.type === 'Insight' && task.subType === 'Assert') {
    const assertTask = task as ExecutionTaskInsightAssertion;
    const thought = assertTask.thought;
    const output = assertTask.output;
    outputDataContent = (
      <>
        {thought && (
          <Card
            liteMode={true}
            title="thought"
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={<pre className="description-content">{thought}</pre>}
          />
        )}

        <Card
          liteMode={true}
          title="assertion result"
          onMouseEnter={noop}
          onMouseLeave={noop}
          content={
            <pre className="description-content">
              {JSON.stringify(output, undefined, 2)}
            </pre>
          }
        />
        {reasoningContent && (
          <Card
            liteMode={true}
            title="Reasoning"
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={
              <pre className="description-content">{reasoningContent}</pre>
            }
          />
        )}
      </>
    );
  } else if (actions) {
    if (task?.subType === 'LoadYaml') {
      outputDataContent = (
        <Card
          liteMode={true}
          title=""
          onMouseEnter={noop}
          onMouseLeave={noop}
          content={
            <pre className="description-content yaml-content">
              {(task as ExecutionTaskPlanning).output?.yamlString}
            </pre>
          }
        />
      );
    } else {
      const planItems: JSX.Element[] = [];

      // Add Thought if exists
      if ((task as ExecutionTaskPlanning).output?.log) {
        planItems.push(
          <Card
            key="thought"
            liteMode={true}
            title="Thought"
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={
              <pre className="description-content">
                {(task as ExecutionTaskPlanning).output?.log}
              </pre>
            }
          />,
        );
      }

      // Add each plan action
      actions.forEach((action, index) => {
        const paramToShow = action.param || {};
        const actionType = action.type || '';

        // Create a Card for each param key
        if (Object.keys(paramToShow).length > 0) {
          Object.keys(paramToShow).forEach((key) => {
            const paramValue = paramToShow[key];

            // Render content based on value type
            let content: JSX.Element;
            if (isElementField(paramValue)) {
              // Render as element
              content = elementEl(paramValue);
            } else if (Array.isArray(paramValue)) {
              // Check if array contains elements
              if (paramValue.some((item) => isElementField(item))) {
                content = (
                  <div>
                    {paramValue.map((item, idx) => (
                      <div key={idx}>
                        {isElementField(item) ? (
                          elementEl(item)
                        ) : (
                          <pre>{JSON.stringify(item, undefined, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                );
              } else {
                // Regular array
                content = (
                  <pre className="description-content">
                    {JSON.stringify(paramValue, undefined, 2)}
                  </pre>
                );
              }
            } else if (typeof paramValue === 'object' && paramValue !== null) {
              // Object
              content = (
                <pre className="description-content">
                  {JSON.stringify(paramValue, undefined, 2)}
                </pre>
              );
            } else {
              // Primitive value
              content = (
                <pre className="description-content">{String(paramValue)}</pre>
              );
            }

            planItems.push(
              <Card
                key={`plan-${index}-${key}`}
                liteMode={true}
                title={`${actionType}.${key}`}
                subtitle={action.thought}
                onMouseEnter={noop}
                onMouseLeave={noop}
                content={content}
              />,
            );
          });
        } else {
          // If no params, still show the action
          planItems.push(
            <Card
              key={`plan-${index}`}
              liteMode={true}
              title={typeStr(action as any)}
              subtitle={action.thought}
              onMouseEnter={noop}
              onMouseLeave={noop}
              content={null}
            />,
          );
        }
      });

      // Add More actions needed if exists
      if (
        typeof (task as ExecutionTaskPlanning).output
          ?.more_actions_needed_by_instruction === 'boolean'
      ) {
        planItems.push(
          <Card
            key="more-actions"
            liteMode={true}
            title="More actions needed"
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={
              <pre className="description-content">
                {(task as ExecutionTaskPlanning).output
                  ?.more_actions_needed_by_instruction
                  ? 'true'
                  : 'false'}
              </pre>
            }
          />,
        );
      }

      // Add reasoning at the end
      if (reasoningContent) {
        planItems.push(
          <Card
            key="reasoning"
            liteMode={true}
            title="Reasoning"
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={
              <pre className="description-content">{reasoningContent}</pre>
            }
          />,
        );
      }

      outputDataContent = planItems;
    }
  } else {
    let data;

    if (task?.output !== undefined) {
      data = task.output;
    } else if (dump?.data !== undefined) {
      data = dump.data;
    }

    const thought = task?.thought;

    if (data !== undefined) {
      const outputItems: JSX.Element[] = [];

      // Add thought if exists
      if (thought) {
        outputItems.push(
          <Card
            key="thought"
            liteMode={true}
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={<pre>{thought}</pre>}
            title="thought"
          />,
        );
      }

      // Handle output data
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        // For object output, create a Card for each field
        Object.entries(data).forEach(([key, value]) => {
          let content: JSX.Element;

          if (isElementField(value)) {
            content = elementEl(value);
          } else if (typeof value === 'object' && value !== null) {
            // Check if it's a locate object
            const valueAsAny = value as any;
            if (valueAsAny.locate && isElementField(valueAsAny.locate)) {
              content = (
                <div>
                  <div style={{ marginBottom: '8px' }}>locate:</div>
                  {renderElementDetailBox(valueAsAny.locate)}
                </div>
              );
            } else {
              content = (
                <pre className="description-content">
                  {JSON.stringify(value, undefined, 2)}
                </pre>
              );
            }
          } else {
            content = (
              <pre className="description-content">{String(value)}</pre>
            );
          }

          outputItems.push(
            <Card
              key={key}
              liteMode={true}
              onMouseEnter={noop}
              onMouseLeave={noop}
              title={key}
              content={content}
            />,
          );
        });
      } else {
        // For non-object output, show as-is
        outputItems.push(
          <Card
            key="output"
            liteMode={true}
            onMouseEnter={noop}
            onMouseLeave={noop}
            title="output"
            content={
              <pre className="description-content">
                {JSON.stringify(data, undefined, 2)}
              </pre>
            }
          />,
        );
      }

      // Add reasoning at the end
      if (reasoningContent) {
        outputItems.push(
          <Card
            key="reasoning"
            liteMode={true}
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={<pre>{reasoningContent}</pre>}
            title="Reasoning"
          />,
        );
      }

      if (outputItems.length > 0) {
        outputDataContent = outputItems;
      }
    }
  }

  return (
    <div className="detail-side">
      <div className="info-tabs">
        <div className="info-tab">Information</div>
      </div>
      <div className="info-content">
        <details open>
          <summary>
            <span className="summary-text">Param</span>
          </summary>
          {taskInput}
        </details>
        {outputDataContent && (
          <details open>
            <summary>
              <span className="summary-text">
                {task?.subType === 'Locate' ? 'Element' : 'Output'}
              </span>
            </summary>
            <div className="item-list">{outputDataContent}</div>
          </details>
        )}
        <details open>
          <summary>
            <span className="summary-text">Meta</span>
          </summary>
          {metaKVElement}
        </details>
      </div>
    </div>
  );
};

export default DetailSide;
