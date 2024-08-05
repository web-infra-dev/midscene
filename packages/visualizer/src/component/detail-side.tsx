/* eslint-disable max-lines */
'use client';
import './detail-side.less';
import { timeStr, typeStr } from '@/utils';
import { RadiusSettingOutlined } from '@ant-design/icons';
import type {
  BaseElement,
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightQuery,
  ExecutionTaskPlanning,
  UISection,
} from '@midscene/core';
import { Tag, Timeline, type TimelineItemProps, Tooltip } from 'antd';
import { highlightColorForType } from './color';
import { timeCostStrElement } from './misc';
import PanelTitle from './panel-title';
import { useExecutionDump, useInsightDump } from './store';

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
  const dump = useInsightDump((store) => store.data);
  const { matchedSection: sections, matchedElement: elements } = dump || {};
  const highlightSectionNames = useInsightDump(
    (store) => store.highlightSectionNames,
  );
  const highlightElements = useInsightDump((store) => store.highlightElements);
  const setHighlightSectionNames = useInsightDump(
    (store) => store.setHighlightSectionNames,
  );
  const setHighlightElements = useInsightDump(
    (store) => store.setHighlightElements,
  );

  const setHighlightSectionName = (name: string) => {
    setHighlightSectionNames([name]);
  };
  const setHighlightElement = (element: BaseElement) => {
    setHighlightElements([element]);
  };

  const unhighlightSection = () => {
    setHighlightSectionNames([]);
  };

  const unhighlightElement = () => {
    setHighlightElements([]);
  };

  const kv = (data: Record<string, unknown>) => {
    const isElementItem = (value: unknown): value is BaseElement =>
      Boolean(value) &&
      typeof value === 'object' &&
      typeof (value as any).content !== 'undefined' &&
      Boolean((value as any).center) &&
      Boolean((value as any).rect);

    const isSectionItem = (value: unknown): value is UISection =>
      Boolean(value) &&
      typeof (value as any)?.sectionCharacteristics !== 'undefined' &&
      typeof (value as any)?.rect !== 'undefined';

    const elementEl = (value: BaseElement) => (
      <span
        onMouseEnter={() => {
          setHighlightElement(value);
        }}
        onMouseLeave={unhighlightElement}
      >
        <Tag bordered={false} color="orange" className="element-button">
          Element
        </Tag>
      </span>
    );

    const sectionEl = (value: UISection) => (
      <span
        onMouseEnter={() => {
          setHighlightSectionName(value.name);
        }}
        onMouseLeave={unhighlightSection}
      >
        <Tag bordered={false} color="blue" className="section-button">
          Section
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
      } else if (typeof value === 'object' && isSectionItem(value)) {
        content = sectionEl(value);
      } else if (
        Array.isArray(value) &&
        value.some((item) => isSectionItem(item))
      ) {
        content = value.map((item, index) => (
          <span key={index}>{sectionEl(item)}</span>
        ));
      } else {
        content =
          typeof value === 'string'
            ? value
            : JSON.stringify(value, undefined, 2);
      }

      return (
        <pre className="description-content" key={key}>
          {key}:&nbsp;{content}
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
        key: 'time cost',
        content: timeCostStrElement(task?.timing?.cost),
      },
      {
        key: 'cache',
        content: task?.cache ? JSON.stringify(task?.cache) : 'false',
      },
    ],
  });

  let taskParam: JSX.Element | null = null;
  if (task?.type === 'Planning') {
    taskParam = MetaKV({
      data: [
        { key: 'type', content: (task && typeStr(task)) || '' },
        {
          key: 'param',
          content: (task as ExecutionTaskPlanning)?.param?.userPrompt,
        },
      ],
    });
  } else if (task?.type === 'Insight') {
    taskParam = MetaKV({
      data: [
        { key: 'type', content: (task && typeStr(task)) || '' },
        {
          key: 'param',
          content: JSON.stringify(
            (task as ExecutionTaskInsightLocate)?.param?.prompt ||
              (task as ExecutionTaskInsightQuery)?.param?.dataDemand ||
              (task as ExecutionTaskInsightAssertion)?.param?.assertion,
          ),
        },
      ],
    });
  } else if (task?.type === 'Action') {
    taskParam = MetaKV({
      data: [
        { key: 'type', content: (task && typeStr(task)) || '' },
        {
          key: 'value',
          content: JSON.stringify(
            (task as ExecutionTaskAction)?.param?.value,
            undefined,
            2,
          ),
        },
      ],
    });
  }

  const matchedSectionsEl = sections?.length
    ? sections.map((section) => {
        const { name } = section;
        const ifHighlight = highlightSectionNames.includes(name);

        const kvToShow = objectWithoutKeys(section as Record<string, any>, [
          'name',
          'description',
          'texts',
          'rect',
          'sectionCharacteristics',
        ]);
        const sectionKV = Object.keys(kvToShow).length ? kv(kvToShow) : null;
        const highlightColor = ifHighlight
          ? highlightColorForType('section')
          : undefined;

        return (
          <Card
            title={section.name}
            highlightWithColor={highlightColor}
            subtitle={section.description}
            characteristic={section.sectionCharacteristics}
            onMouseEnter={setHighlightSectionName.bind(this, name)}
            onMouseLeave={unhighlightSection}
            content={sectionKV}
            key={name}
          />
        );
      })
    : null;

  const matchedElementsEl = elements?.length
    ? elements.map((element, idx) => {
        const ifHighlight = highlightElements.includes(element);
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
            onMouseEnter={setHighlightElement.bind(this, element)}
            onMouseLeave={unhighlightElement}
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

  let assertionCard : JSX.Element | null = null;
  if(task?.type === 'Insight' && task.subType === 'Assert') {
    assertionCard = (
      <Card
        liteMode={true}
        title="Assert"
        onMouseEnter={noop}
        onMouseLeave={noop}
        content={
          <pre className="description-content">
            {JSON.stringify((task as ExecutionTaskInsightAssertion).output, undefined, 2)}
          </pre>
        }
      />
    );
  }

  
  const plans = (task as ExecutionTaskPlanning)?.output?.plans;
  let timelineData: TimelineItemProps[] = [];
  if (plans) {
    timelineData = timelineData.concat(
      plans.map((item) => {
        return {
          color: '#06B1AB',
          children: (
            <>
              <p>
                <b>{typeStr(item as any)}</b>
              </p>
              <p>{item.thought}</p>
              <p>
                {item.param
                  ? JSON.stringify(item.param || {}, undefined, 2)
                  : null}
              </p>
            </>
          ),
        };
      }),
    );
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
        {matchedSectionsEl}
        {matchedElementsEl}
        <Timeline items={timelineData} />
      </div>
    </div>
  );
};

export default DetailSide;
