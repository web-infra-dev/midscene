/* eslint-disable max-lines */
'use client';
import './detail-side.less';
import { timeStr } from '@/utils';
import { paramStr, typeStr } from '@midscene/web/ui-utils';

import { RadiusSettingOutlined } from '@ant-design/icons';
import type {
  BaseElement,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightLocate,
  ExecutionTaskPlanning,
} from '@midscene/core';
import { Tag, Timeline, type TimelineItemProps, Tooltip } from 'antd';
import { highlightColorForType } from './color';
import { timeCostStrElement } from './misc';
import PanelTitle from './panel-title';
import { useExecutionDump } from './store';

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
  const { matchedSection: sections, matchedElement: elements } = dump || {};

  const kv = (data: Record<string, unknown>) => {
    const isElementItem = (value: unknown): value is BaseElement =>
      Boolean(value) &&
      typeof value === 'object' &&
      typeof (value as any).content !== 'undefined' &&
      Boolean((value as any).center) &&
      Boolean((value as any).rect);

    const elementEl = (value: BaseElement) => (
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
        content =
          typeof value === 'string'
            ? value
            : JSON.stringify(value, undefined, 2);
      }

      return (
        <pre className="description-content" key={key}>
          {key} {content}
        </pre>
      );
    });
  };

  const usageInfo = (task as ExecutionTaskInsightLocate)?.log?.dump?.taskInfo
    ?.usage
    ? JSON.stringify(
        (task as ExecutionTaskInsightLocate).log!.dump!.taskInfo!.usage,
        undefined,
        2,
      )
    : '';

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
        key: 'time cost',
        content: timeCostStrElement(task?.timing?.cost),
      },
      {
        key: 'cache',
        content: task?.cache ? JSON.stringify(task?.cache) : 'false',
      },
      ...(task?.locate
        ? [
            {
              key: 'locate',
              content: JSON.stringify(task.locate),
            },
          ]
        : []),
      ...(usageInfo ? [{ key: 'usage', content: usageInfo }] : []),
    ],
  });

  let taskParam: JSX.Element | null = null;
  if (task?.type === 'Planning') {
    const planningTask = task as ExecutionTaskPlanning;
    if (planningTask.param?.whatHaveDone) {
      taskParam = MetaKV({
        data: [
          { key: 'type', content: (task && typeStr(task)) || '' },
          {
            key: 'whatHaveDone',
            content: planningTask.param.whatHaveDone,
          },
          {
            key: 'whatToDoNext',
            content: planningTask.param.userPrompt,
          },
        ],
      });
    } else {
      taskParam = MetaKV({
        data: [
          { key: 'type', content: (task && typeStr(task)) || '' },
          {
            key: 'userPrompt',
            content: paramStr(task) || '',
          },
        ],
      });
    }
  } else if (task?.type === 'Insight') {
    taskParam = MetaKV({
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
        ...(task?.thought
          ? [
              {
                key: 'thought',
                content: task.thought,
              },
            ]
          : []),
      ],
    });
  } else if (task?.type === 'Action') {
    taskParam = MetaKV({
      data: [
        { key: 'type', content: (task && typeStr(task)) || '' },
        {
          key: 'value',
          content: paramStr(task) || '',
        },
      ],
    });
  }

  const matchedElementsEl = elements?.length
    ? elements.map((element, idx) => {
        const ifHighlight = false; // highlightElements.includes(element);
        const highlightColor = ifHighlight
          ? highlightColorForType('element')
          : undefined;

        const elementKV = kv(
          objectWithoutKeys(element as any, [
            'content',
            'rect',
            'center',
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
      })
    : null;

  // const [showQuery, setShowQuery] = useState(false);

  const errorSection = task?.error ? (
    <Card
      liteMode={true}
      title="Error"
      onMouseEnter={noop}
      onMouseLeave={noop}
      content={
        <pre className="description-content" style={{ color: '#F00' }}>
          {task.error}
        </pre>
      }
    />
  ) : null;

  const dataCard = dump?.data ? (
    <Card
      liteMode={true}
      onMouseEnter={noop}
      onMouseLeave={noop}
      content={<pre>{JSON.stringify(dump.data, undefined, 2)}</pre>}
    />
  ) : null;

  let assertionCard: JSX.Element | null = null;
  if (task?.type === 'Insight' && task.subType === 'Assert') {
    assertionCard = (
      <Card
        liteMode={true}
        title="Assert"
        onMouseEnter={noop}
        onMouseLeave={noop}
        content={
          <pre className="description-content">
            {JSON.stringify(
              (task as ExecutionTaskInsightAssertion).output,
              undefined,
              2,
            )}
          </pre>
        }
      />
    );
  }

  const plans = (task as ExecutionTaskPlanning)?.output?.actions;
  let timelineData: TimelineItemProps[] = [];
  if (plans) {
    timelineData = timelineData.concat(
      plans.map((item) => {
        const paramToShow = item.param || {};
        const paramStr = Object.keys(paramToShow).length
          ? JSON.stringify(paramToShow, undefined, 2)
          : null;

        const locateStr =
          item.type === 'Locate' && item.locate
            ? JSON.stringify(item.locate)
            : null;

        return {
          color: '#06B1AB',
          children: (
            <>
              <p>
                <b>{typeStr(item as any)}</b>
              </p>
              <p>{item.thought}</p>
              <p>{paramStr}</p>
              <p>{locateStr}</p>
            </>
          ),
        };
      }),
    );
    if ((task as ExecutionTaskPlanning).output?.furtherPlan) {
      timelineData.push({
        color: '#06B1AB',
        children: (
          <>
            <p>
              <b>Further Plan</b>
            </p>
            <p>
              {
                (task as ExecutionTaskPlanning).output?.furtherPlan
                  ?.whatToDoNext
              }
            </p>
          </>
        ),
      });
    }
  }

  return (
    <div className="detail-side">
      {/* Meta */}
      <PanelTitle title="Task Meta" />
      {metaKVElement}
      {/* Param  */}
      <PanelTitle title="Param" />
      {taskParam}
      {/* Response */}
      <PanelTitle title="Output" />
      <div className="item-list item-list-space-up">
        {errorSection}
        {dataCard}
        {assertionCard}
        {matchedElementsEl}
        <Timeline items={timelineData} />
      </div>
    </div>
  );
};

export default DetailSide;
