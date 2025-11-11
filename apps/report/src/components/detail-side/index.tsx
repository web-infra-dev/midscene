/* eslint-disable max-lines */
'use client';
import './index.less';

import { RadiusSettingOutlined } from '@ant-design/icons';
import type {
  ExecutionTaskInsightAssertion,
  ExecutionTaskPlanning,
  ExecutionTaskPlanningApply,
  LocateResultElement,
} from '@midscene/core';
import { paramStr, typeStr } from '@midscene/core/agent';
import {
  highlightColorForType,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Tag, Tooltip } from 'antd';
import { fullTimeStrWithMilliseconds } from '../../../../../packages/visualizer/src/utils';
import { useExecutionDump } from '../store';

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

const MetaKV = (props: {
  data: { key: string; content: string | JSX.Element }[];
}) => {
  return (
    <div className="meta-kv">
      {props.data.map((item, index) => {
        return (
          <div className="meta" key={index}>
            <div className="meta-key">{item.key}</div>
            <div className="meta-value">{item.content}</div>
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

  const aiActionContextValue = (task as ExecutionTaskPlanningApply)?.param
    ?.aiActionContext;

  const kv = (data: Record<string, unknown>) => {
    const isElementItem = (value: unknown): value is LocateResultElement =>
      Boolean(value) &&
      typeof value === 'object' &&
      Boolean((value as any).center) &&
      Boolean((value as any).rect);

    const elementEl = (_value: LocateResultElement) => {
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

    // Recursively render value
    const renderValue = (value: unknown): JSX.Element => {
      // Check if it's an element first
      if (isElementItem(value)) {
        return <>{elementEl(value)}</>;
      }

      // Check if it's an array
      if (Array.isArray(value)) {
        // Check if array contains elements
        if (value.some((item) => isElementItem(item))) {
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
      ...(aiActionContextValue
        ? [
            {
              key: 'action context',
              content: aiActionContextValue,
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
      ...(task?.locate
        ? [
            {
              key: 'locate',
              content: <pre>{JSON.stringify(task.locate, undefined, 2)}</pre>,
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
    if (planningTask.param?.userInstruction) {
      taskInput = MetaKV({
        data: [
          {
            key: 'instruction',
            content: planningTask.param.userInstruction,
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
      taskInput = MetaKV({
        data: [
          {
            key: 'userPrompt',
            content: paramStr(task) || '',
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
    taskInput = MetaKV({
      data: [
        ...(paramStr(task)
          ? [
              {
                key: 'param',
                content: paramStr(task) || '',
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
    taskInput = MetaKV({
      data: [
        {
          key: 'value',
          content: paramStr(task) || '',
        },
      ],
    });
  } else if (task?.type === 'Log') {
    taskInput = task.param?.content ? (
      <pre className="log-content">{task.param.content}</pre>
    ) : null;
  }

  let outputDataContent = null;
  const plans = (task as ExecutionTaskPlanning)?.output?.actions;

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
      </>
    );
  } else if (plans) {
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
      plans.forEach((item, index) => {
        const paramToShow = item.param || {};
        const paramContent = Object.keys(paramToShow).length
          ? kv(paramToShow as Record<string, unknown>)
          : null;

        const locateContent =
          item.type === 'Locate' && item.locate
            ? kv({ locate: item.locate } as Record<string, unknown>)
            : null;

        planItems.push(
          <Card
            key={`plan-${index}`}
            liteMode={true}
            title={typeStr(item as any)}
            subtitle={item.thought}
            onMouseEnter={noop}
            onMouseLeave={noop}
            content={
              <>
                {paramContent && <div>{paramContent}</div>}
                {locateContent && <div>{locateContent}</div>}
              </>
            }
          />,
        );
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
      outputDataContent = (
        <>
          {thought && (
            <Card
              liteMode={true}
              onMouseEnter={noop}
              onMouseLeave={noop}
              content={<pre>{thought}</pre>}
              title="thought"
            />
          )}
          <Card
            liteMode={true}
            onMouseEnter={noop}
            onMouseLeave={noop}
            title="output"
            content={
              typeof data === 'object' && data !== null ? (
                kv(data as Record<string, unknown>)
              ) : (
                <pre>{String(data)}</pre>
              )
            }
          />
        </>
      );
    }
  }

  return (
    <div className="detail-side">
      <div className="info-tabs">
        <div className="info-tab">Information</div>
      </div>
      <div className="info-content">
        <details open>
          <summary>Param</summary>
          {taskInput}
        </details>
        <details open>
          <summary>{task?.subType === 'Locate' ? 'Element' : 'Output'}</summary>
          <div className="item-list">{outputDataContent}</div>
        </details>
        <details open>
          <summary>Meta</summary>
          {metaKVElement}
        </details>
      </div>
    </div>
  );
};

export default DetailSide;
