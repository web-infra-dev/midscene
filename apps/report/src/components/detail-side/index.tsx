/* eslint-disable max-lines */
'use client';
import './index.less';
import { timeStr } from '@midscene/visualizer';

import { RadiusSettingOutlined } from '@ant-design/icons';
import type {
  BaseElement,
  ExecutionTaskInsightAssertion,
  ExecutionTaskPlanning,
} from '@midscene/core';
import { paramStr, typeStr } from '@midscene/core/agent';
import {
  highlightColorForType,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Tag, Timeline, type TimelineItemProps, Tooltip } from 'antd';
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

const objectWithoutKeys = (obj: Record<string, unknown>, keys: string[]) =>
  Object.keys(obj).reduce((acc, key) => {
    if (!keys.includes(key)) {
      (acc as any)[key] = obj[key];
    }
    return acc;
  }, {});

const DetailSide = (): JSX.Element => {
  const task = useExecutionDump((store) => store.activeTask);
  const dump = useExecutionDump((store) => store.insightDump);
  const { matchedElement: elements } = dump || {};

  const kv = (data: Record<string, unknown>) => {
    const isElementItem = (value: unknown): value is BaseElement =>
      Boolean(value) &&
      typeof value === 'object' &&
      typeof (value as any).content !== 'undefined' &&
      Boolean((value as any).center) &&
      Boolean((value as any).rect);

    const elementEl = (_value: BaseElement) => (
      <span>
        <Tag bordered={false} color="orange" className="element-button">
          Element
        </Tag>
      </span>
    );

    if (Array.isArray(data) || typeof data !== 'object') {
      return (
        <pre className="description-content">
          {JSON.stringify(data, undefined, 2)}
        </pre>
      );
    }

    return Object.keys(data).map((key) => {
      const value = data[key];
      let content;
      if (typeof value === 'object' && isElementItem(value)) {
        content = elementEl(value);
      } else if (
        Array.isArray(value) &&
        value.some((item) => isElementItem(item))
      ) {
        content = value.map((item, index) => (
          <span key={index}>{elementEl(item)}</span>
        ));
      } else {
        content = <pre>{JSON.stringify(value, undefined, 2)}</pre>;
      }

      return (
        <pre className="description-content" key={key}>
          {key} {content}
        </pre>
      );
    });
  };

  const metaKVElement = MetaKV({
    data: [
      {
        key: 'status',
        content: task?.status || '',
      },
      {
        key: 'start',
        content: timeStr(task?.timing?.start),
      },
      {
        key: 'end',
        content: timeStr(task?.timing?.end),
      },
      {
        key: 'total time',
        content: timeCostStrElement(task?.timing?.cost),
      },
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
              content: <pre>{JSON.stringify(task?.hitBy, undefined, 2)}</pre>,
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
          { key: 'type', content: (task && typeStr(task)) || '' },
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
          { key: 'type', content: (task && typeStr(task)) || '' },
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
        { key: 'type', content: (task && typeStr(task)) || '' },
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
  } else if (task?.type === 'Action') {
    taskInput = MetaKV({
      data: [
        { key: 'type', content: (task && typeStr(task)) || '' },
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
  if (elements?.length) {
    outputDataContent = elements.map((element, idx) => {
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
          title={element.content}
          highlightWithColor={highlightColor}
          subtitle=""
          content={elementKV}
          key={idx}
        />
      );
    });
  } else if (task?.error || task?.errorMessage) {
    let errorContent = '';

    // prefer errorMessage
    if (task.errorMessage) {
      errorContent = task.errorMessage;
    } else if (task.error) {
      // if no errorMessage, try to show error object
      if (typeof task.error === 'string') {
        errorContent = task.error;
      } else if (typeof task.error === 'object' && task.error.message) {
        errorContent = task.error.message;
      } else {
        errorContent = JSON.stringify(task.error, null, 2) || 'Unknown error';
      }
    }

    // add stack info (if exists and not duplicate)
    if (task.errorStack && !errorContent.includes(task.errorStack)) {
      errorContent += `\n\nStack:\n${task.errorStack}`;
    }

    outputDataContent = (
      <Card
        liteMode={true}
        title="Error"
        onMouseEnter={noop}
        onMouseLeave={noop}
        content={
          <pre className="description-content" style={{ color: '#F00' }}>
            {errorContent}
          </pre>
        }
      />
    );
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
            <pre className="description-content">
              {(task as ExecutionTaskPlanning).output?.yamlString}
            </pre>
          }
        />
      );
    } else {
      let timelineData: TimelineItemProps[] = [];

      if ((task as ExecutionTaskPlanning).output?.log) {
        timelineData.push({
          children: (
            <>
              <p>
                <b>Thought</b>
              </p>
              <p>{(task as ExecutionTaskPlanning).output?.log}</p>
            </>
          ),
        });
      }

      timelineData = timelineData.concat(
        plans.map((item) => {
          const paramToShow = item.param || {};
          const paramStr = Object.keys(paramToShow).length
            ? JSON.stringify(paramToShow, undefined, 2)
            : null;

          const locateStr =
            item.type === 'Locate' && item.locate
              ? JSON.stringify(item.locate, undefined, 2)
              : null;

          return {
            children: (
              <>
                <p>
                  <b>{typeStr(item as any)}</b>
                </p>
                <p>{item.thought}</p>
                <p>
                  <pre>{paramStr}</pre>
                </p>
                <p>
                  <pre>{locateStr}</pre>
                </p>
              </>
            ),
          };
        }),
      );

      if (
        typeof (task as ExecutionTaskPlanning).output
          ?.more_actions_needed_by_instruction === 'boolean'
      ) {
        timelineData.push({
          children: (
            <>
              <p>
                <b>More actions needed</b>
              </p>
              <p>
                {(task as ExecutionTaskPlanning).output
                  ?.more_actions_needed_by_instruction
                  ? 'true'
                  : 'false'}
              </p>
            </>
          ),
        });
      }

      outputDataContent = (
        <Timeline items={timelineData} className="detail-side-timeline" />
      );
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
              <pre>
                {typeof data === 'object'
                  ? JSON.stringify(data, undefined, 2)
                  : String(data)}
              </pre>
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
          <summary>Task meta</summary>
          {metaKVElement}
        </details>
        <details open>
          <summary>Param</summary>
          {taskInput}
        </details>
        <details open>
          <summary>{task?.subType === 'Locate' ? 'Element' : 'Output'}</summary>
          <div className="item-list">{outputDataContent}</div>
        </details>
      </div>
    </div>
  );
};

export default DetailSide;
